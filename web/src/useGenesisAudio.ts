import { useCallback, useEffect, useRef, useState, type MutableRefObject } from "react";

type GenesisCue = "birth" | "join" | "proto" | "mature" | "choice_pickup" | "choice_resolve";

const muteKey = "pattern-cosmos-genesis-muted";
const musicPositionKey = "pattern-cosmos-bgm-position";
const musicSource = "/assets/audio/starfall-aperture.mp3";
const musicLevel = 0.21;
const duckedMusicLevel = 0.075;

function rampAudioVolume(
  audio: HTMLAudioElement,
  from: number,
  to: number,
  duration: number,
  frameRef: MutableRefObject<number | null>,
  onComplete?: () => void,
) {
  if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current);
  const startedAt = performance.now();
  const tick = (now: number) => {
    const progress = Math.min(1, (now - startedAt) / duration);
    const eased = progress * progress * (3 - (2 * progress));
    audio.volume = from + ((to - from) * eased);
    if (progress < 1) frameRef.current = window.requestAnimationFrame(tick);
    else {
      frameRef.current = null;
      onComplete?.();
    }
  };
  frameRef.current = window.requestAnimationFrame(tick);
}

function createTone(
  context: AudioContext,
  destination: AudioNode,
  frequency: number,
  start: number,
  duration: number,
  volume: number,
  type: OscillatorType = "sine",
) {
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, start);
  oscillator.frequency.exponentialRampToValueAtTime(frequency * 1.035, start + duration);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(volume, start + Math.min(0.08, duration * 0.2));
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  oscillator.connect(gain).connect(destination);
  oscillator.start(start);
  oscillator.stop(start + duration + 0.03);
}

export function useGenesisAudio() {
  const [muted, setMuted] = useState(() => window.localStorage.getItem(muteKey) === "1");
  const mutedRef = useRef(muted);
  const contextRef = useRef<AudioContext | null>(null);
  const masterRef = useRef<GainNode | null>(null);
  const musicRef = useRef<HTMLAudioElement | null>(null);
  const musicEligibleRef = useRef(false);
  const musicStartedRef = useRef(false);
  const musicLoopingRef = useRef(false);
  const musicFadeFrameRef = useRef<number | null>(null);
  const musicDuckTimerRef = useRef<number | null>(null);
  const musicDuckUntilRef = useRef(0);
  const dragSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const dragGainRef = useRef<GainNode | null>(null);
  const dragFilterRef = useRef<BiquadFilterNode | null>(null);

  const desiredMusicLevel = useCallback(() => {
    if (mutedRef.current) return 0;
    return performance.now() < musicDuckUntilRef.current ? duckedMusicLevel : musicLevel;
  }, []);

  const rampMusic = useCallback((target: number, duration: number, onComplete?: () => void) => {
    const music = musicRef.current;
    if (!music) return;
    rampAudioVolume(music, music.volume, target, duration, musicFadeFrameRef, onComplete);
  }, []);

  const ensureMusic = useCallback(() => {
    if (musicRef.current) return musicRef.current;
    const music = new Audio(musicSource);
    music.preload = "auto";
    music.loop = false;
    music.volume = 0;
    music.addEventListener("loadedmetadata", () => {
      const savedPosition = Number(window.sessionStorage.getItem(musicPositionKey));
      if (Number.isFinite(savedPosition) && savedPosition > 0 && savedPosition < music.duration - 2) {
        music.currentTime = savedPosition;
      }
    }, { once: true });
    music.addEventListener("timeupdate", () => {
      if (!musicStartedRef.current || musicLoopingRef.current || !Number.isFinite(music.duration)) return;
      window.sessionStorage.setItem(musicPositionKey, String(Math.floor(music.currentTime)));
      if (music.duration - music.currentTime > 1.25) return;
      musicLoopingRef.current = true;
      rampMusic(0.0001, 520, () => {
        music.currentTime = 0;
        void music.play().catch(() => undefined);
        rampMusic(desiredMusicLevel(), 720, () => {
          musicLoopingRef.current = false;
        });
      });
    });
    musicRef.current = music;
    return music;
  }, [desiredMusicLevel, rampMusic]);

  const resumeMusic = useCallback(async () => {
    const music = ensureMusic();
    if (mutedRef.current) return;
    try {
      await music.play();
      musicStartedRef.current = true;
      rampMusic(desiredMusicLevel(), 460);
    } catch {
      // A later explicit pointer/key interaction will retry under autoplay policy.
    }
  }, [desiredMusicLevel, ensureMusic, rampMusic]);

  // The Intro is the one place music may be attempted before a user gesture.
  // A rejected play promise is the precise autoplay signal App needs in order
  // to pause at its cinematic entry gate instead of running a silent intro.
  const beginIntroMusic = useCallback(async () => {
    if (mutedRef.current) return true;
    const music = ensureMusic();
    if (!musicStartedRef.current) {
      window.sessionStorage.removeItem(musicPositionKey);
      music.currentTime = 0;
    }
    try {
      // Keep play() before the first await: when this is called from the entry
      // gesture Chrome still considers it user initiated.
      const playing = music.play();
      await playing;
      musicEligibleRef.current = true;
      musicStartedRef.current = true;
      rampMusic(desiredMusicLevel(), 460);
      return true;
    } catch {
      return false;
    }
  }, [desiredMusicLevel, ensureMusic, rampMusic]);

  const duckMusic = useCallback((duration = 620) => {
    const music = musicRef.current;
    if (!music || mutedRef.current || !musicStartedRef.current) return;
    musicDuckUntilRef.current = Math.max(musicDuckUntilRef.current, performance.now() + duration);
    rampMusic(duckedMusicLevel, 75);
    if (musicDuckTimerRef.current !== null) window.clearTimeout(musicDuckTimerRef.current);
    musicDuckTimerRef.current = window.setTimeout(() => {
      if (performance.now() >= musicDuckUntilRef.current) rampMusic(desiredMusicLevel(), 620);
      musicDuckTimerRef.current = null;
    }, duration + 30);
  }, [desiredMusicLevel, rampMusic]);

  const unlock = useCallback(async (resumeBgm = true) => {
    musicEligibleRef.current = true;
    if (!contextRef.current) {
      const context = new AudioContext({ latencyHint: "interactive" });
      const master = context.createGain();
      master.gain.value = muted ? 0 : 0.24;
      master.connect(context.destination);
      contextRef.current = context;
      masterRef.current = master;
    }
    if (contextRef.current.state === "suspended") await contextRef.current.resume();
    if (resumeBgm) await resumeMusic();
  }, [muted, resumeMusic]);

  useEffect(() => {
    mutedRef.current = muted;
    window.localStorage.setItem(muteKey, muted ? "1" : "0");
    if (masterRef.current && contextRef.current) {
      masterRef.current.gain.setTargetAtTime(muted ? 0 : 0.24, contextRef.current.currentTime, 0.025);
    }
    const music = musicRef.current;
    if (!music) return;
    if (muted) {
      rampMusic(0.0001, 100, () => music.pause());
    } else if (musicEligibleRef.current) {
      void resumeMusic();
    }
  }, [muted, rampMusic, resumeMusic]);

  useEffect(() => () => {
    try { dragSourceRef.current?.stop(); } catch { /* already stopped */ }
    if (musicFadeFrameRef.current !== null) window.cancelAnimationFrame(musicFadeFrameRef.current);
    if (musicDuckTimerRef.current !== null) window.clearTimeout(musicDuckTimerRef.current);
    const music = musicRef.current;
    if (music) {
      window.sessionStorage.setItem(musicPositionKey, String(Math.floor(music.currentTime)));
      music.pause();
      music.src = "";
    }
    void contextRef.current?.close();
  }, []);

  const play = useCallback(async (cue: GenesisCue) => {
    await unlock();
    const context = contextRef.current;
    const destination = masterRef.current;
    if (!context || !destination || muted) return;
    duckMusic(cue === "mature" || cue === "choice_resolve" ? 950 : 560);
    const now = context.currentTime + 0.015;
    if (cue === "birth") {
      createTone(context, destination, 523.25, now, 0.62, 0.11, "sine");
      createTone(context, destination, 1046.5, now + 0.06, 0.44, 0.032, "triangle");
    } else if (cue === "join") {
      createTone(context, destination, 293.66, now, 0.72, 0.075, "sine");
      createTone(context, destination, 440, now + 0.08, 0.68, 0.045, "sine");
    } else if (cue === "proto") {
      createTone(context, destination, 164.81, now, 1.05, 0.065, "sine");
      createTone(context, destination, 329.63, now + 0.14, 0.88, 0.04, "triangle");
    } else if (cue === "mature") {
      createTone(context, destination, 261.63, now, 1.18, 0.055, "sine");
      createTone(context, destination, 329.63, now + 0.06, 1.12, 0.045, "sine");
      createTone(context, destination, 392, now + 0.12, 1.04, 0.038, "triangle");
    } else if (cue === "choice_pickup") {
      createTone(context, destination, 659.25, now, 0.34, 0.045, "sine");
      createTone(context, destination, 1318.5, now + 0.045, 0.22, 0.014, "triangle");
    } else {
      createTone(context, destination, 392, now, 0.76, 0.044, "sine");
      createTone(context, destination, 493.88, now + 0.07, 0.7, 0.036, "sine");
      createTone(context, destination, 659.25, now + 0.15, 0.62, 0.025, "triangle");
    }
  }, [duckMusic, muted, unlock]);

  const startOrbitDrag = useCallback(async () => {
    await unlock();
    const context = contextRef.current;
    const destination = masterRef.current;
    if (!context || !destination || muted || dragSourceRef.current) return;
    const sampleCount = Math.floor(context.sampleRate * 1.8);
    const buffer = context.createBuffer(1, sampleCount, context.sampleRate);
    const channel = buffer.getChannelData(0);
    for (let index = 0; index < sampleCount; index += 1) {
      channel[index] = (Math.random() * 2 - 1) * 0.34;
    }
    const source = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const gain = context.createGain();
    source.buffer = buffer;
    source.loop = true;
    filter.type = "bandpass";
    filter.frequency.value = 760;
    filter.Q.value = 0.72;
    gain.gain.setValueAtTime(0.0001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.008, context.currentTime + 0.09);
    source.connect(filter).connect(gain).connect(destination);
    source.start();
    dragSourceRef.current = source;
    dragFilterRef.current = filter;
    dragGainRef.current = gain;
  }, [muted, unlock]);

  const updateOrbitDrag = useCallback((speed: number) => {
    const context = contextRef.current;
    const gain = dragGainRef.current;
    const filter = dragFilterRef.current;
    if (!context || !gain || !filter || muted) return;
    const intensity = Math.min(1, Math.max(0, speed / 4.5));
    gain.gain.setTargetAtTime(0.006 + intensity * 0.012, context.currentTime, 0.035);
    filter.frequency.setTargetAtTime(680 + intensity * 960, context.currentTime, 0.045);
  }, [muted]);

  const stopOrbitDrag = useCallback((accepted: boolean) => {
    const context = contextRef.current;
    const source = dragSourceRef.current;
    const gain = dragGainRef.current;
    if (context && source && gain) {
      gain.gain.cancelScheduledValues(context.currentTime);
      gain.gain.setTargetAtTime(0.0001, context.currentTime, 0.055);
      window.setTimeout(() => {
        try { source.stop(); } catch { /* already stopped */ }
      }, 220);
    }
    dragSourceRef.current = null;
    dragGainRef.current = null;
    dragFilterRef.current = null;
    if (accepted) void play("choice_resolve");
  }, [play]);

  const toggleMuted = useCallback(async () => {
    await unlock();
    setMuted((current) => !current);
  }, [unlock]);

  return {
    muted,
    play,
    toggleMuted,
    unlock,
    beginIntroMusic,
    duckMusic,
    startOrbitDrag,
    updateOrbitDrag,
    stopOrbitDrag,
  };
}

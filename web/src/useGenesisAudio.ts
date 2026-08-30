import { useCallback, useEffect, useRef, useState } from "react";

type GenesisCue = "birth" | "join" | "proto" | "mature";

const muteKey = "pattern-cosmos-genesis-muted";

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
  const contextRef = useRef<AudioContext | null>(null);
  const masterRef = useRef<GainNode | null>(null);

  const unlock = useCallback(async () => {
    if (!contextRef.current) {
      const context = new AudioContext({ latencyHint: "interactive" });
      const master = context.createGain();
      master.gain.value = muted ? 0 : 0.24;
      master.connect(context.destination);
      contextRef.current = context;
      masterRef.current = master;
    }
    if (contextRef.current.state === "suspended") await contextRef.current.resume();
  }, [muted]);

  useEffect(() => {
    window.localStorage.setItem(muteKey, muted ? "1" : "0");
    if (masterRef.current && contextRef.current) {
      masterRef.current.gain.setTargetAtTime(muted ? 0 : 0.24, contextRef.current.currentTime, 0.025);
    }
  }, [muted]);

  useEffect(() => () => {
    void contextRef.current?.close();
  }, []);

  const play = useCallback(async (cue: GenesisCue) => {
    await unlock();
    const context = contextRef.current;
    const destination = masterRef.current;
    if (!context || !destination || muted) return;
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
    } else {
      createTone(context, destination, 261.63, now, 1.18, 0.055, "sine");
      createTone(context, destination, 329.63, now + 0.06, 1.12, 0.045, "sine");
      createTone(context, destination, 392, now + 0.12, 1.04, 0.038, "triangle");
    }
  }, [muted, unlock]);

  const toggleMuted = useCallback(async () => {
    await unlock();
    setMuted((current) => !current);
  }, [unlock]);

  return { muted, play, toggleMuted, unlock };
}

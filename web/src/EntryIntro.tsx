import { useEffect } from "react";

interface EntryIntroProps {
  onComplete: () => void;
}

export function EntryIntro({ onComplete }: EntryIntroProps) {
  useEffect(() => {
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const timer = window.setTimeout(onComplete, reducedMotion ? 900 : 8200);
    return () => window.clearTimeout(timer);
  }, [onComplete]);

  return (
    <section className="entry-intro" aria-label="Entering Pattern Cosmos">
      <div className="entry-intro__veil" />
      <div className="entry-intro__first-star" aria-hidden="true" />

      <div className="entry-intro__quote">
        <p>Until you make the unconscious conscious, it will direct your life and you will call it fate.</p>
        <span>C. G. Jung</span>
      </div>

      <div className="entry-intro__invitation">
        <p>We are all made of starstuff.</p>
        <strong>Now, see the universe within.</strong>
      </div>

      <button className="entry-intro__skip" type="button" onClick={onComplete}>
        Skip
      </button>
    </section>
  );
}

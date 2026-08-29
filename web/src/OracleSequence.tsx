import type { CSSProperties } from "react";
import type { OracleSequenceState } from "./types";

interface OracleSequenceProps {
  sequence: OracleSequenceState;
}

export function OracleSequence({ sequence }: OracleSequenceProps) {
  const style = {
    "--oracle-origin-x": `${sequence.origin.x - window.innerWidth / 2}px`,
    "--oracle-origin-y": `${sequence.origin.y - window.innerHeight / 2}px`,
    "--oracle-origin-scale": Math.max(0.22, sequence.origin.size / 300),
  } as CSSProperties;

  return (
    <div
      className="oracle-sequence"
      data-phase={sequence.phase}
      data-pattern-id={sequence.patternId}
      style={style}
      role="status"
      aria-live="polite"
      aria-label="Reading the current orbit"
    >
      <div className="oracle-sequence__mist oracle-sequence__mist--far" />
      <div className="oracle-sequence__mist oracle-sequence__mist--near" />
      <div className="oracle-sequence__sphere" aria-hidden="true">
        <div className="oracle-sequence__gas oracle-sequence__gas--cyan" />
        <div className="oracle-sequence__gas oracle-sequence__gas--rose" />
        <div className="oracle-sequence__stars">
          {Array.from({ length: 15 }, (_, index) => <i key={index} />)}
        </div>
        <div className="oracle-sequence__glint" />
      </div>
    </div>
  );
}

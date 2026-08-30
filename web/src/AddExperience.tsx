import { ArrowUpRight, CircleNotch } from "@phosphor-icons/react";
import { FormEvent, useState } from "react";

interface AddExperienceProps {
  disabled: boolean;
  busy: boolean;
  genesis?: boolean;
  onInteract?: () => void;
  onSubmit: (date: string, text: string) => Promise<void>;
}

export function AddExperience({ disabled, busy, genesis = false, onInteract, onSubmit }: AddExperienceProps) {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [text, setText] = useState("");

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!text.trim()) return;
    onInteract?.();
    await onSubmit(date, text);
    setText("");
  };

  return (
    <form className={`experience-composer${genesis ? " is-genesis" : ""}`} onSubmit={submit}>
      <div className="composer-label">
        <span>{genesis ? "Add a moment from your life." : "Capture a moment"}</span>
      </div>
      <label>
        <span>Date</span>
        <input type="date" value={date} onChange={(event) => setDate(event.target.value)} disabled={disabled || busy} />
      </label>
      <label className="experience-input">
        <span>What happened?</span>
        <textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder={genesis ? "What happened? What did you do next?" : "What happened, and what stayed with you?"}
          rows={2}
          disabled={disabled || busy}
        />
      </label>
      <button className="primary-button" type="submit" disabled={disabled || busy || text.trim().length < 8}>
        {busy ? <CircleNotch className="spin" size={18} /> : <ArrowUpRight size={18} />}
        {busy ? "Listening" : "Add to Cosmos"}
      </button>
    </form>
  );
}

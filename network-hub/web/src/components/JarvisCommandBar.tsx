import { FormEvent, useState } from "react";

interface Props {
  onSubmit?: (command: string) => void;
  placeholder?: string;
}

export default function JarvisCommandBar({
  onSubmit,
  placeholder = "Enter command… prep meeting, sync calendar, show network",
}: Props) {
  const [value, setValue] = useState("");

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const cmd = value.trim();
    if (!cmd) return;
    onSubmit?.(cmd);
    setValue("");
  }

  return (
    <form className="jarvis-command-bar" onSubmit={handleSubmit}>
      <span className="jarvis-command-prefix">JARVIS ›</span>
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        spellCheck={false}
        autoComplete="off"
      />
      <button type="submit" className="btn jarvis-cmd-btn">
        Execute
      </button>
    </form>
  );
}

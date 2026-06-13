import { useEffect, useState } from "react";

const BOOT_LINES = [
  "Initializing neural interface…",
  "Loading strategic network graph…",
  "Syncing calendar intelligence…",
  "Standing by for operator.",
];

interface Props {
  onComplete?: () => void;
}

export default function JarvisBoot({ onComplete }: Props) {
  const [lineIndex, setLineIndex] = useState(0);
  const [charIndex, setCharIndex] = useState(0);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (done) {
      onComplete?.();
      return;
    }
    const line = BOOT_LINES[lineIndex] ?? "";
    if (charIndex < line.length) {
      const t = setTimeout(() => setCharIndex((c) => c + 1), 18);
      return () => clearTimeout(t);
    }
    if (lineIndex < BOOT_LINES.length - 1) {
      const t = setTimeout(() => {
        setLineIndex((i) => i + 1);
        setCharIndex(0);
      }, 280);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setDone(true), 400);
    return () => clearTimeout(t);
  }, [lineIndex, charIndex, done, onComplete]);

  return (
    <div className="jarvis-boot">
      {BOOT_LINES.slice(0, lineIndex + 1).map((line, i) => (
        <div key={line} className="jarvis-boot-line">
          <span className="jarvis-prompt">&gt;</span>{" "}
          {i < lineIndex ? line : line.slice(0, charIndex)}
          {i === lineIndex && !done && <span className="jarvis-cursor">▌</span>}
        </div>
      ))}
    </div>
  );
}

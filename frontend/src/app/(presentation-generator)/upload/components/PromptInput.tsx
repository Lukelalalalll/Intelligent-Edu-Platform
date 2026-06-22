import { Textarea } from "@/components/ui/textarea";
import { PencilLine } from "lucide-react";
import styles from "./PromptInput.module.css";

interface PromptInputProps {
  value: string;
  onChange: (value: string) => void;
}

export function PromptInput({ value, onChange }: PromptInputProps) {
  const trimmedValue = value.trim();
  const wordCount = trimmedValue ? trimmedValue.split(/\s+/).filter(Boolean).length : 0;

  return (
    <div className={styles.root}>
      <div className={styles.toolbar}>
        <div className={styles.label}>
          <span className={styles.labelIcon}>
            <PencilLine className="h-4 w-4" />
          </span>
          <span>Write prompt</span>
        </div>
        <span className={styles.counter}>
          {wordCount} word{wordCount === 1 ? "" : "s"}
        </span>
      </div>

      <div className={styles.surface}>
        <Textarea
          value={value}
          rows={5}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Start with your idea... we'll handle the slides"
          data-testid="prompt-input"
          className={`${styles.textarea} custom_scrollbar focus-visible:ring-0 focus-visible:ring-transparent focus-visible:ring-offset-0`}
        />
      </div>
    </div>
  );
}

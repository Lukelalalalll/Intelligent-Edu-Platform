import { Textarea } from "@/components/ui/textarea";
import { PencilLine } from "lucide-react";
import { useI18n } from "@/shared/i18n";
import styles from "./PromptInput.module.css";

interface PromptInputProps {
  value: string;
  onChange: (value: string) => void;
}

export function PromptInput({ value, onChange }: PromptInputProps) {
  const { t } = useI18n();
  const trimmedValue = value.trim();
  const wordCount = trimmedValue ? trimmedValue.split(/\s+/).filter(Boolean).length : 0;

  return (
    <div className={styles.root}>
        <div className={styles.toolbar}>
        <div className={styles.label}>
          <span className={styles.labelIcon}>
            <PencilLine className="h-4 w-4" />
          </span>
          <span>{t("presenton.upload.prompt.label")}</span>
        </div>
        <span className={styles.counter}>
          {t("presenton.upload.wordCount", { count: wordCount })}
        </span>
      </div>

      <div className={styles.surface}>
        <Textarea
          value={value}
          rows={5}
          onChange={(e) => onChange(e.target.value)}
          placeholder={t("presenton.upload.prompt.placeholder")}
          data-testid="prompt-input"
          className={`${styles.textarea} custom_scrollbar focus-visible:ring-0 focus-visible:ring-transparent focus-visible:ring-offset-0`}
        />
      </div>
    </div>
  );
}

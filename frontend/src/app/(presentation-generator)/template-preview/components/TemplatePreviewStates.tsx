import type { ReactNode } from "react";
import { Eye, Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";

import styles from "./TemplatePreviewClient.module.css";

type TemplatePreviewStateBranchProps = {
  children: ReactNode;
  customError: string | null;
  customLoading: boolean;
  isMissingTemplate: boolean;
};

export function TemplatePreviewStateBranch({
  children,
  customError,
  customLoading,
  isMissingTemplate,
}: TemplatePreviewStateBranchProps) {
  const hasBlockingState = customLoading || Boolean(customError) || isMissingTemplate;

  return (
    <>
      {customLoading ? (
        <div className={styles.statusPanel} role="status">
          <Loader2 className={cn("animate-spin", styles.statusIcon)} />
          <h3 className={styles.statusTitle}>Compiling custom template preview</h3>
          <p className={styles.statusText}>
            Pulling saved layouts into the Presenton workspace and preparing
            the full-size slide stack.
          </p>
        </div>
      ) : null}

      {customError ? (
        <div className={styles.statusPanel}>
          <Eye className={styles.statusIcon} />
          <h3 className={styles.statusTitle}>Could not load this template</h3>
          <p className={styles.statusText}>{customError}</p>
        </div>
      ) : null}

      {isMissingTemplate ? (
        <div className={styles.statusPanel}>
          <Eye className={styles.statusIcon} />
          <h3 className={styles.statusTitle}>Template preview unavailable</h3>
          <p className={styles.statusText}>
            The selected slug did not resolve to a built-in or custom
            Presenton template with previewable layouts.
          </p>
        </div>
      ) : null}

      {!hasBlockingState ? children : null}
    </>
  );
}

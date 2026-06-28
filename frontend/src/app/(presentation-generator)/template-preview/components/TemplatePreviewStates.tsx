import type { ReactNode } from "react";
import { Eye, Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";
import { useI18n } from "@/shared/i18n";

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
  const { t } = useI18n();
  const hasBlockingState = customLoading || Boolean(customError) || isMissingTemplate;

  return (
    <>
      {customLoading ? (
        <div className={styles.statusPanel} role="status">
          <Loader2 className={cn("animate-spin", styles.statusIcon)} />
          <h3 className={styles.statusTitle}>{t("ppt_generator.templatePreview.state.loading.title")}</h3>
          <p className={styles.statusText}>
            {t("ppt_generator.templatePreview.state.loading.body")}
          </p>
        </div>
      ) : null}

      {customError ? (
        <div className={styles.statusPanel}>
          <Eye className={styles.statusIcon} />
          <h3 className={styles.statusTitle}>{t("ppt_generator.templatePreview.state.error.title")}</h3>
          <p className={styles.statusText}>{customError}</p>
        </div>
      ) : null}

      {isMissingTemplate ? (
        <div className={styles.statusPanel}>
          <Eye className={styles.statusIcon} />
          <h3 className={styles.statusTitle}>{t("ppt_generator.templatePreview.state.missing.title")}</h3>
          <p className={styles.statusText}>
            {t("ppt_generator.templatePreview.state.missing.body")}
          </p>
        </div>
      ) : null}

      {!hasBlockingState ? children : null}
    </>
  );
}


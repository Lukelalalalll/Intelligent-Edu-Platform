import Link from "@/presenton/shims/next-link";
import WorkspaceCard from "@/shared/components/Card/Card";
import { useI18n } from "@/shared/i18n";
import { ArrowLeft, PanelTop } from "lucide-react";

import type { CustomTemplateLayout } from "@/app/hooks/useCustomTemplates";
import { cn } from "@/lib/utils";

import type { BuiltInPreviewLayout } from "./templatePreviewData";
import { TemplatePreviewStack } from "./TemplatePreviewStack";
import { TemplatePreviewStateBranch } from "./TemplatePreviewStates";
import styles from "./TemplatePreviewClient.module.css";

type TemplatePreviewContentProps = {
  customError: string | null;
  customLayouts: CustomTemplateLayout[];
  customLoading: boolean;
  isCompactBuiltIn: boolean;
  isCustom: boolean;
  isMissingTemplate: boolean;
  mainSectionDescription: string;
  mainSectionTitle: string;
  staticTemplates: BuiltInPreviewLayout[];
  templateSlug: string;
};

export function TemplatePreviewContent({
  customError,
  customLayouts,
  customLoading,
  isCompactBuiltIn,
  isCustom,
  isMissingTemplate,
  mainSectionDescription,
  mainSectionTitle,
  staticTemplates,
  templateSlug,
}: TemplatePreviewContentProps) {
  const { t } = useI18n();

  return (
    <WorkspaceCard
      glass
      className={styles.surfaceCard}
    >
      <div className={styles.contentSection}>
        <div className={styles.sectionIntro}>
          <div className={styles.sectionTitleWrap}>
            {isCompactBuiltIn ? (
              <Link href="/templates" className={styles.inlineBackAction}>
                <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                <span>{t("presenton.templatePreview.backInline")}</span>
              </Link>
            ) : null}
            <div className={cn(styles.badge, styles.mutedBadge)}>
              <PanelTop className="h-3.5 w-3.5" />
              {t("presenton.templatePreview.stackBadge")}
            </div>
            <h2 className={styles.sectionTitle}>{mainSectionTitle}</h2>
            <p className={styles.sectionDescription}>{mainSectionDescription}</p>
          </div>
        </div>

        <TemplatePreviewStateBranch
          customError={customError}
          customLoading={customLoading}
          isMissingTemplate={isMissingTemplate}
        >
          <TemplatePreviewStack
            customLayouts={customLayouts}
            isCustom={isCustom}
            staticTemplates={staticTemplates}
            templateSlug={templateSlug}
          />
        </TemplatePreviewStateBranch>
      </div>
    </WorkspaceCard>
  );
}

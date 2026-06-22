"use client";

import React, { useEffect, useMemo } from "react";
import Link from "@/presenton/shims/next-link";
import {
  useRouter,
  useSearchParams,
} from "@/presenton/shims/next-navigation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import WorkspaceCard from "@/shared/components/Card/Card";
import WelcomeBanner from "@/shared/components/WelcomeBanner";
import {
  ArrowLeft,
  Eye,
  Loader2,
  PanelTop,
  Sparkles,
  Trash2,
} from "lucide-react";

import { MixpanelEvent, trackEvent } from "@/utils/mixpanel";
import TemplateService from "../../services/api/template";
import { notify } from "@/components/ui/sonner";
import {
  CustomTemplateLayout,
  useCustomTemplateDetails,
} from "@/app/hooks/useCustomTemplates";
import {
  templates as templateGroups,
  getTemplatesByTemplateName,
} from "@/app/presentation-templates";
import { setupImageUrlConverter } from "@/utils/image-url-converter";
import styles from "./TemplatePreviewClient.module.css";

const CUSTOM_PREFIX = "custom-";

type PreviewStat = {
  label: string;
  value: string;
  meta: string;
};

function formatLayoutIndex(index: number) {
  return index + 1 < 10 ? `0${index + 1}` : `${index + 1}`;
}

function BuiltInPreviewItem({
  templateSlug,
  index,
  layout,
}: {
  templateSlug: string;
  index: number;
  layout: {
    component: React.ComponentType<{ data: any }>;
    sampleData: Record<string, unknown>;
    layoutId: string;
    layoutName: string;
    layoutDescription: string;
  };
}) {
  const LayoutComponent = layout.component;

  return (
    <article
      key={`${templateSlug}-${layout.layoutId}-${index}`}
      id={layout.layoutId}
      className={styles.previewItem}
    >
      <div className={styles.previewHeader}>
        <div className={styles.previewCopy}>
          <span className={styles.previewIndex}>{formatLayoutIndex(index)}</span>
          <div className={styles.previewTitleWrap}>
            <h3 className={styles.previewTitle}>{layout.layoutName}</h3>
            <p className={styles.previewDescription}>{layout.layoutDescription}</p>
          </div>
        </div>
        <span className={styles.previewMeta}>{layout.layoutId}</span>
      </div>
      <div className={styles.previewStageFrame}>
        <div className={styles.previewStageScroller}>
          <div className={styles.previewStageCanvas}>
            <LayoutComponent data={layout.sampleData} />
          </div>
        </div>
      </div>
    </article>
  );
}

function CustomPreviewItem({
  templateSlug,
  index,
  layout,
}: {
  templateSlug: string;
  index: number;
  layout: CustomTemplateLayout;
}) {
  const LayoutComponent = layout.component;

  return (
    <article
      key={`${templateSlug}-${layout.layoutId}-${index}`}
      id={layout.layoutId}
      className={styles.previewItem}
    >
      <div className={styles.previewHeader}>
        <div className={styles.previewCopy}>
          <span className={styles.previewIndex}>{formatLayoutIndex(index)}</span>
          <div className={styles.previewTitleWrap}>
            <h3 className={styles.previewTitle}>{layout.rawLayoutName}</h3>
            <p className={styles.previewDescription}>{layout.layoutDescription}</p>
          </div>
        </div>
        <span className={styles.previewMeta}>{layout.rawLayoutId}</span>
      </div>
      <div className={styles.previewStageFrame}>
        <div className={styles.previewStageScroller}>
          <div className={styles.previewStageCanvas}>
            <LayoutComponent data={layout.sampleData} />
          </div>
        </div>
      </div>
    </article>
  );
}

export default function TemplatePreviewClient() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const templateSlug = searchParams.get("slug")?.trim() || "";
  const isCustom = templateSlug.startsWith(CUSTOM_PREFIX);
  const customTemplateId = isCustom ? templateSlug.slice(CUSTOM_PREFIX.length) : "";

  const staticTemplates = useMemo(() => {
    return isCustom ? [] : getTemplatesByTemplateName(templateSlug);
  }, [isCustom, templateSlug]);

  const staticGroup = useMemo(() => {
    return isCustom
      ? null
      : templateGroups.find((group: { id: string }) => group.id === templateSlug) || null;
  }, [isCustom, templateSlug]);

  const {
    template: customTemplate,
    loading: customLoading,
    error: customError,
    fonts: customFonts,
  } = useCustomTemplateDetails({
    id: customTemplateId,
    name: "",
    description: "",
  });

  useEffect(() => {
    const observer = setupImageUrlConverter();
    return () => observer?.disconnect();
  }, []);

  const layoutCount = isCustom
    ? customTemplate?.layouts.length || 0
    : staticTemplates.length;

  const templateName = isCustom
    ? customTemplate?.template?.name ||
      customTemplate?.name ||
      "Custom Template"
    : staticGroup?.name || "Template Preview";

  const templateDescription = isCustom
    ? customTemplate?.template?.description ||
      customTemplate?.description ||
      "Review the full slide stack for this saved custom template."
    : staticGroup?.description ||
      "Inspect how this built-in Presenton family is paced before generation starts.";

  const isMissingTemplate =
    (!isCustom && (!staticGroup || staticTemplates.length === 0)) ||
    (isCustom && !customLoading && !customError && !customTemplate);

  const previewStats = useMemo<PreviewStat[]>(() => {
    const sourceMeta = isCustom
      ? {
          label: customFonts.length > 0 ? "Fonts" : "Source",
          value: customFonts.length > 0 ? `${customFonts.length}` : "Custom",
          meta:
            customFonts.length > 0
              ? "Uploaded families detected in this reusable template."
              : "Saved reusable layouts from your workspace.",
        }
      : {
          label: "Source",
          value: "Built-in",
          meta: "Shared Presenton family from the workspace library.",
        };

    return [
      {
        label: "Template type",
        value: isCustom ? "Custom" : "Built-in",
        meta: isCustom
          ? "Preview-only review for a saved custom layout system."
          : "Preview-only review for a shared Presenton family.",
      },
      {
        label: "Layouts",
        value: `${layoutCount}`,
        meta:
          layoutCount === 1
            ? "One layout ready to inspect at full slide size."
            : "Full-size slide stages stay scrollable without shrinking the deck.",
      },
      {
        label: sourceMeta.label,
        value: sourceMeta.value,
        meta: sourceMeta.meta,
      },
    ];
  }, [customFonts.length, isCustom, layoutCount]);

  const handleDeleteCustomTemplate = async () => {
    if (!customTemplateId) return;

    const confirmed = window.confirm(
      "Are you sure you want to delete this template? This action cannot be undone."
    );
    if (!confirmed) return;

    const success = await TemplateService.deleteCustomTemplate(customTemplateId);
    if (success.success) {
      notify.success("Template deleted", "The template was deleted successfully.");
      router.push("/templates");
      return;
    }

    notify.error(
      "Could not delete template",
      "Something went wrong while deleting the template."
    );
  };

  const summaryTitle = isMissingTemplate
    ? "Template preview unavailable"
    : customLoading
      ? "Preparing this custom template for full-size review."
      : templateName;

  const summaryDescription = isMissingTemplate
    ? "We could not find a matching Presenton template family for this slug. Head back to the library and open a different preview."
    : customError
      ? customError
      : customLoading
        ? "Loading saved layouts and compiling the full preview stack inside the Presenton workspace."
        : templateDescription;

  const mainSectionTitle = isCustom
    ? "Review every saved layout at full slide size."
    : "Inspect the built-in family layout sequence.";

  const mainSectionDescription = isCustom
    ? "Keep this page focused on inspection only: open the stack, compare pacing, and confirm the reusable structure before using the template elsewhere."
    : "Browse the shared family one layout at a time and see how the deck moves before it becomes part of a generation flow.";

  const shouldShowDeleteAction =
    isCustom && !customLoading && !customError && !isMissingTemplate;
  const isCompactBuiltIn =
    !isCustom && !customLoading && !customError && !isMissingTemplate;
  const showSummaryCard = !isCompactBuiltIn;

  return (
    <div className={styles.page}>
      <div className={styles.container}>
        <WelcomeBanner
          title="Template Preview"
          subtitle="Inspect a template family at full slide size before using it in the deck flow."
          variant="workspace"
          className={styles.banner}
        />

        {showSummaryCard ? (
          <WorkspaceCard
            glass
            className={cn(styles.surfaceCard, styles.motionCard, styles.motionPrimary)}
          >
            <div className={styles.controlSection}>
              <div className={styles.controlTop}>
                <div className={styles.controlCopy}>
                  <Link href="/templates" className={styles.secondaryAction}>
                    <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                    <span>Back to Templates</span>
                  </Link>
                  <div className={styles.badge}>
                    <Sparkles className="h-3.5 w-3.5" />
                    {isCustom ? "Custom template" : "Built-in family"}
                  </div>
                  <div className={styles.controlHeadingRow}>
                    <h2 className={styles.controlTitle}>{summaryTitle}</h2>
                    {isCustom && !isMissingTemplate ? (
                      <span className={styles.inlinePill}>Custom</span>
                    ) : null}
                  </div>
                  <p className={styles.controlDescription}>{summaryDescription}</p>
                </div>

                <div className={styles.controlActions}>
                  {shouldShowDeleteAction ? (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        trackEvent(
                          MixpanelEvent.TemplatePreview_Delete_Templates_Button_Clicked,
                          { templateSlug }
                        );
                        trackEvent(MixpanelEvent.TemplatePreview_Delete_Templates_API_Call);
                        handleDeleteCustomTemplate();
                      }}
                      className={styles.dangerAction}
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                      <span>Delete Template</span>
                    </Button>
                  ) : null}
                  <p className={styles.controlHelper}>
                    Preview stays read-only here, so you can compare structure, pacing,
                    and deck coverage without switching into editing tools.
                  </p>
                </div>
              </div>

              {!isMissingTemplate && !customError ? (
                <div className={styles.statsGrid}>
                  {previewStats.map((stat) => (
                    <div key={stat.label} className={styles.statCard}>
                      <span className={styles.statLabel}>{stat.label}</span>
                      <div className={styles.statValue}>{stat.value}</div>
                      <p className={styles.statMeta}>{stat.meta}</p>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          </WorkspaceCard>
        ) : null}

        <WorkspaceCard
          glass
          className={cn(styles.surfaceCard, styles.motionCard, styles.motionSecondary)}
        >
          <div className={styles.contentSection}>
            <div className={styles.sectionIntro}>
              <div className={styles.sectionTitleWrap}>
                {isCompactBuiltIn ? (
                  <Link href="/templates" className={styles.inlineBackAction}>
                    <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                    <span>Back to Templates</span>
                  </Link>
                ) : null}
                <div className={cn(styles.badge, styles.mutedBadge)}>
                  <PanelTop className="h-3.5 w-3.5" />
                  Preview stack
                </div>
                <h2 className={styles.sectionTitle}>{mainSectionTitle}</h2>
                <p className={styles.sectionDescription}>{mainSectionDescription}</p>
              </div>
            </div>

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

            {!customLoading && !customError && !isMissingTemplate ? (
              <div className={styles.previewStack}>
                {!isCustom
                  ? staticTemplates.map((layout: any, index: number) => (
                      <BuiltInPreviewItem
                        key={`${templateSlug}-${layout.layoutId}-${index}`}
                        templateSlug={templateSlug}
                        index={index}
                        layout={layout}
                      />
                    ))
                  : customTemplate?.layouts.map((layout, index) => (
                      <CustomPreviewItem
                        key={`${templateSlug}-${layout.layoutId}-${index}`}
                        templateSlug={templateSlug}
                        index={index}
                        layout={layout}
                      />
                    ))}
              </div>
            ) : null}
          </div>
        </WorkspaceCard>
      </div>
    </div>
  );
}

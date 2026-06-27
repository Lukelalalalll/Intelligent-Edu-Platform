"use client";

import { useCallback, useEffect, useMemo } from "react";

import { cn } from "@/lib/utils";
import { useI18n } from "@/shared/i18n";
import WelcomeBanner from "@/shared/components/WelcomeBanner";
import entranceStyles from "@/shared/page-entrance/PageEntrance.module.css";
import { usePageEntrance } from "@/shared/page-entrance/usePageEntrance";
import { notify } from "@/components/ui/sonner";
import {
  useRouter,
  useSearchParams,
} from "@/presenton/shims/next-navigation";
import { useCustomTemplateDetails } from "@/app/hooks/useCustomTemplates";
import {
  templates as templateGroups,
  getTemplatesByTemplateName,
} from "@/app/presentation-templates";
import { setupImageUrlConverter } from "@/utils/image-url-converter";
import { MixpanelEvent, trackEvent } from "@/utils/mixpanel";

import TemplateService from "../../services/api/template";
import { TemplatePreviewContent } from "./TemplatePreviewContent";
import { TemplatePreviewControls } from "./TemplatePreviewControls";
import {
  buildTemplatePreviewModel,
  getTemplatePreviewParams,
  type BuiltInPreviewLayout,
  type TemplatePreviewGroup,
} from "./templatePreviewData";
import styles from "./TemplatePreviewClient.module.css";

export default function TemplatePreviewClient() {
  const { t } = useI18n();
  const isEntranceActive = usePageEntrance();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { customTemplateId, isCustom, templateSlug } =
    getTemplatePreviewParams(searchParams);

  const staticTemplates = useMemo<BuiltInPreviewLayout[]>(() => {
    return isCustom
      ? []
      : (getTemplatesByTemplateName(templateSlug) as BuiltInPreviewLayout[]);
  }, [isCustom, templateSlug]);

  const staticGroup = useMemo<TemplatePreviewGroup | null>(() => {
    return isCustom
      ? null
      : (templateGroups as TemplatePreviewGroup[]).find(
          (group) => group.id === templateSlug
        ) || null;
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

  const previewModel = useMemo(
    () =>
      buildTemplatePreviewModel({
        t,
        isCustom,
        customTemplate,
        customLoading,
        customError,
        customFontCount: customFonts.length,
        staticGroup,
        staticTemplates,
      }),
    [
      customError,
      customFonts.length,
      customLoading,
      customTemplate,
      isCustom,
      staticGroup,
      staticTemplates,
      t,
    ]
  );

  const handleDeleteCustomTemplate = useCallback(async () => {
    if (!customTemplateId) return;

    const confirmed = window.confirm(t("presenton.templatePreview.deleteConfirm"));
    if (!confirmed) return;

    const success = await TemplateService.deleteCustomTemplate(customTemplateId);
    if (success.success) {
      notify.success(
        t("presenton.templatePreview.notify.deleteSuccess.title"),
        t("presenton.templatePreview.notify.deleteSuccess.body")
      );
      router.push("/templates");
      return;
    }

    notify.error(
      t("presenton.templatePreview.notify.deleteFailed.title"),
      t("presenton.templatePreview.notify.deleteFailed.body")
    );
  }, [customTemplateId, router, t]);

  const handleDeleteButtonClick = useCallback(() => {
    trackEvent(MixpanelEvent.TemplatePreview_Delete_Templates_Button_Clicked, {
      templateSlug,
    });
    trackEvent(MixpanelEvent.TemplatePreview_Delete_Templates_API_Call);
    void handleDeleteCustomTemplate();
  }, [handleDeleteCustomTemplate, templateSlug]);

  return (
    <div className={styles.page}>
      <div
        className={cn(
          styles.container,
          entranceStyles.pageEntrance,
          isEntranceActive && entranceStyles.pageEntranceActive
        )}
      >
        <WelcomeBanner
          title={t("presenton.templatePreview.banner.title")}
          subtitle={t("presenton.templatePreview.banner.subtitle")}
          variant="workspace"
          className={styles.banner}
        />

        {previewModel.showSummaryCard ? (
          <TemplatePreviewControls
            isCustom={isCustom}
            isMissingTemplate={previewModel.isMissingTemplate}
            previewStats={previewModel.previewStats}
            shouldShowDeleteAction={previewModel.shouldShowDeleteAction}
            showStats={!previewModel.isMissingTemplate && !customError}
            summaryDescription={previewModel.summaryDescription}
            summaryTitle={previewModel.summaryTitle}
            onDeleteCustomTemplate={handleDeleteButtonClick}
          />
        ) : null}

        <TemplatePreviewContent
          customError={customError}
          customLayouts={customTemplate?.layouts ?? []}
          customLoading={customLoading}
          isCompactBuiltIn={previewModel.isCompactBuiltIn}
          isCustom={isCustom}
          isMissingTemplate={previewModel.isMissingTemplate}
          mainSectionDescription={previewModel.mainSectionDescription}
          mainSectionTitle={previewModel.mainSectionTitle}
          staticTemplates={staticTemplates}
          templateSlug={templateSlug}
        />
      </div>
    </div>
  );
}

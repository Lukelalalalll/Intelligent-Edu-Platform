"use client";

import { useCallback, useEffect, useMemo } from "react";

import WelcomeBanner from "@/shared/components/WelcomeBanner";
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
    ]
  );

  const handleDeleteCustomTemplate = useCallback(async () => {
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
  }, [customTemplateId, router]);

  const handleDeleteButtonClick = useCallback(() => {
    trackEvent(MixpanelEvent.TemplatePreview_Delete_Templates_Button_Clicked, {
      templateSlug,
    });
    trackEvent(MixpanelEvent.TemplatePreview_Delete_Templates_API_Call);
    void handleDeleteCustomTemplate();
  }, [handleDeleteCustomTemplate, templateSlug]);

  return (
    <div className={styles.page}>
      <div className={styles.container}>
        <WelcomeBanner
          title="Template Preview"
          subtitle="Inspect a template family at full slide size before using it in the deck flow."
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

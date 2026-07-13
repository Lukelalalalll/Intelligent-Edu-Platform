import React, { lazy } from "react";
import { Navigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/shared/i18n";
import { PptGeneratorScreen } from "@/ppt_generator/PptGeneratorScreen";

export { PptGeneratorScreen } from "@/ppt_generator/PptGeneratorScreen";

const UploadPage = lazy(
  () => import("@/app/(presentation-generator)/upload/components/UploadPage")
);
const DocumentPreviewPage = lazy(
  () => import("@/app/(presentation-generator)/documents-preview/components/DocumentPreviewPage")
);
const OutlinePage = lazy(
  () => import("@/app/(presentation-generator)/outline/components/OutlinePage")
);
const PresentationPage = lazy(
  () => import("@/app/(presentation-generator)/presentation/components/PresentationPage")
);
const PdfMakerPage = lazy(
  () => import("@/app/(export)/pdf-maker/PdfMakerPage")
);
const SettingsPage = lazy(
  () => import("@/app/(presentation-generator)/(workspace)/settings/SettingPage")
);
const TemplatePreviewPage = lazy(
  () => import("@/app/(presentation-generator)/template-preview/page")
);
const CustomTemplatePage = lazy(
  () => import("@/app/(presentation-generator)/custom-template/CustomTemplatePage")
);

export function PptGeneratorLegacyRedirectRoute() {
  return <Navigate to="/slides/ppt_generator" replace />;
}

export function PptGeneratorUploadRoute() {
  return (
    <PptGeneratorScreen tone="wide" contentClassName="!px-2 sm:!px-3 lg:!px-4 !pb-8 !pt-5">
      <UploadPage />
    </PptGeneratorScreen>
  );
}

export function PptGeneratorDocumentsPreviewRoute() {
  return (
    <PptGeneratorScreen>
      <DocumentPreviewPage />
    </PptGeneratorScreen>
  );
}

export function PptGeneratorOutlineRoute() {
  return (
    <PptGeneratorScreen>
      <OutlinePage />
    </PptGeneratorScreen>
  );
}

export function PptGeneratorPresentationRoute() {
  const { t } = useI18n();
  const [searchParams] = useSearchParams();
  const presentationId = searchParams.get("id");

  if (!presentationId) {
    return (
        <PptGeneratorScreen>
          <div className="flex min-h-[calc(100dvh-var(--nav-height,60px)-8rem)] flex-col items-center justify-center font-syne">
          <h1 className="text-2xl font-bold">{t("ppt_generator.route.missingId.title")}</h1>
          <p className="pb-4 text-gray-500">{t("ppt_generator.route.missingId.body")}</p>
          <Button asChild>
            <a href="/slides/ppt_generator/dashboard">{t("ppt_generator.route.missingId.cta")}</a>
          </Button>
        </div>
      </PptGeneratorScreen>
    );
  }

  return (
    <PptGeneratorScreen tone="wide" contentWidth="full" contentInset="none">
      <PresentationPage presentation_id={presentationId} />
    </PptGeneratorScreen>
  );
}

export function PptGeneratorPdfMakerRoute() {
  const { t } = useI18n();
  const [searchParams] = useSearchParams();
  const presentationId = searchParams.get("id");
  const exportCookie = searchParams.get("exportCookie") ?? undefined;

  if (!presentationId) {
    return (
      <>
        <div className="flex h-screen flex-col items-center justify-center">
          <h1 className="text-2xl font-bold">{t("ppt_generator.route.missingId.title")}</h1>
          <p className="pb-4 text-gray-500">{t("ppt_generator.route.missingId.body")}</p>
          <Button asChild>
            <a href="/slides/ppt_generator/dashboard">{t("ppt_generator.route.missingId.cta")}</a>
          </Button>
        </div>
      </>
    );
  }

  return (
    <>
      <PdfMakerPage presentation_id={presentationId} exportCookie={exportCookie} />
    </>
  );
}

export function PptGeneratorSettingsRoute() {
  return (
    <PptGeneratorScreen>
      <SettingsPage />
    </PptGeneratorScreen>
  );
}

export function PptGeneratorTemplatePreviewRoute() {
  return (
    <PptGeneratorScreen tone="wide">
      <TemplatePreviewPage />
    </PptGeneratorScreen>
  );
}

export function PptGeneratorCustomTemplateRoute() {
  return (
    <PptGeneratorScreen tone="wide">
      <CustomTemplatePage />
    </PptGeneratorScreen>
  );
}


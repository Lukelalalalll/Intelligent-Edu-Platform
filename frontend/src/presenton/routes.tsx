import React, { lazy } from "react";
import { Navigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/shared/i18n";
import { PresentonScreen } from "@/presenton/PresentonScreen";

export { PresentonScreen } from "@/presenton/PresentonScreen";

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

export function PresentonLegacyRedirectRoute() {
  return <Navigate to="/slides/presenton" replace />;
}

export function PresentonUploadRoute() {
  return (
    <PresentonScreen tone="wide" contentClassName="!px-2 sm:!px-3 lg:!px-4 !pb-8 !pt-5">
      <UploadPage />
    </PresentonScreen>
  );
}

export function PresentonDocumentsPreviewRoute() {
  return (
    <PresentonScreen>
      <DocumentPreviewPage />
    </PresentonScreen>
  );
}

export function PresentonOutlineRoute() {
  return (
    <PresentonScreen>
      <OutlinePage />
    </PresentonScreen>
  );
}

export function PresentonPresentationRoute() {
  const { t } = useI18n();
  const [searchParams] = useSearchParams();
  const presentationId = searchParams.get("id");

  if (!presentationId) {
    return (
        <PresentonScreen>
          <div className="flex min-h-[calc(100dvh-var(--nav-height,60px)-8rem)] flex-col items-center justify-center font-syne">
          <h1 className="text-2xl font-bold">{t("presenton.route.missingId.title")}</h1>
          <p className="pb-4 text-gray-500">{t("presenton.route.missingId.body")}</p>
          <Button asChild>
            <a href="/slides/presenton/dashboard">{t("presenton.route.missingId.cta")}</a>
          </Button>
        </div>
      </PresentonScreen>
    );
  }

  return (
    <PresentonScreen tone="wide" contentWidth="full" contentInset="none">
      <PresentationPage presentation_id={presentationId} />
    </PresentonScreen>
  );
}

export function PresentonPdfMakerRoute() {
  const { t } = useI18n();
  const [searchParams] = useSearchParams();
  const presentationId = searchParams.get("id");
  const exportCookie = searchParams.get("exportCookie") ?? undefined;

  if (!presentationId) {
    return (
      <>
        <div className="flex h-screen flex-col items-center justify-center">
          <h1 className="text-2xl font-bold">{t("presenton.route.missingId.title")}</h1>
          <p className="pb-4 text-gray-500">{t("presenton.route.missingId.body")}</p>
          <Button asChild>
            <a href="/slides/presenton/dashboard">{t("presenton.route.missingId.cta")}</a>
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

export function PresentonSettingsRoute() {
  return (
    <PresentonScreen>
      <SettingsPage />
    </PresentonScreen>
  );
}

export function PresentonTemplatePreviewRoute() {
  return (
    <PresentonScreen tone="wide">
      <TemplatePreviewPage />
    </PresentonScreen>
  );
}

export function PresentonCustomTemplateRoute() {
  return (
    <PresentonScreen tone="wide">
      <CustomTemplatePage />
    </PresentonScreen>
  );
}

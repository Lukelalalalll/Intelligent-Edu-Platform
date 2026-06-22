import React, { lazy } from "react";
import { Navigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { PresentonBootstrap } from "@/presenton/bootstrap";
import DashboardPage from "@/app/(presentation-generator)/(workspace)/dashboard/components/DashboardPage";

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
const TemplatePanel = lazy(
  () => import("@/app/(presentation-generator)/(workspace)/templates/components/TemplatePanel")
);
const ThemePanel = lazy(
  () => import("@/app/(presentation-generator)/(workspace)/theme/components/ThemePanel")
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

type PresentonScreenProps = React.PropsWithChildren<{
  tone?: "default" | "wide";
  bleed?: "default" | "full";
  contentWidth?: "default" | "wide" | "full";
  contentInset?: "default" | "none";
  contentClassName?: string;
  bootstrapBlocking?: boolean;
}>;

export function PresentonScreen({
  children,
  tone = "default",
  bleed = "default",
  contentWidth = "default",
  contentInset = "default",
  contentClassName = "",
  bootstrapBlocking = true,
}: PresentonScreenProps) {
  const widthClassName =
    contentWidth === "full"
      ? "w-full max-w-none"
      : contentWidth === "wide" || tone === "wide"
      ? "w-full max-w-[min(100%,1760px)]"
      : "w-full max-w-[min(100%,1560px)]";
  const screenClassName =
    bleed === "full"
      ? "w-full min-h-[calc(100dvh-var(--nav-height,60px))] bg-[radial-gradient(circle_at_top_left,rgba(227,246,237,0.98),rgba(237,248,242,0.99)_34%,rgba(244,250,247,1)_100%)]"
      : contentInset === "none"
      ? "mx-auto flex w-full flex-col"
      : "mx-auto flex w-full flex-col px-3 pb-6 pt-4 sm:px-4 lg:px-6";

  return (
    <PresentonBootstrap blocking={bootstrapBlocking}>
      <section className={`${screenClassName} ${contentClassName}`.trim()}>
        <div className={`${widthClassName} mx-auto flex w-full flex-1 flex-col`}>
          {children}
        </div>
      </section>
    </PresentonBootstrap>
  );
}

function PresentonWorkspace({ children }: React.PropsWithChildren) {
  return <PresentonScreen>{children}</PresentonScreen>;
}

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
  const [searchParams] = useSearchParams();
  const presentationId = searchParams.get("id");

  if (!presentationId) {
    return (
      <PresentonScreen>
        <div className="flex min-h-[calc(100dvh-var(--nav-height,60px)-8rem)] flex-col items-center justify-center font-syne">
          <h1 className="text-2xl font-bold">No presentation id found</h1>
          <p className="pb-4 text-gray-500">Please try again</p>
          <Button asChild>
            <a href="/slides/presenton/dashboard">Go to home</a>
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
  const [searchParams] = useSearchParams();
  const presentationId = searchParams.get("id");
  const exportCookie = searchParams.get("exportCookie") ?? undefined;

  if (!presentationId) {
    return (
      <>
        <div className="flex h-screen flex-col items-center justify-center">
          <h1 className="text-2xl font-bold">No presentation id found</h1>
          <p className="pb-4 text-gray-500">Please try again</p>
          <Button asChild>
            <a href="/slides/presenton/dashboard">Go to home</a>
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

export function PresentonDashboardRoute() {
  return (
    <PresentonScreen bleed="full" bootstrapBlocking={false}>
      <DashboardPage />
    </PresentonScreen>
  );
}

export function PresentonTemplatesRoute() {
  return (
    <PresentonScreen bootstrapBlocking={false}>
      <TemplatePanel />
    </PresentonScreen>
  );
}

export function PresentonThemeRoute() {
  return (
    <PresentonWorkspace>
      <ThemePanel />
    </PresentonWorkspace>
  );
}

export function PresentonSettingsRoute() {
  return (
    <PresentonWorkspace>
      <SettingsPage />
    </PresentonWorkspace>
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

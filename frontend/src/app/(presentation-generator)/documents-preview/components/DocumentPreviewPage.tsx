"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "@/ppt_generator/shims/next-navigation";
import { useDispatch, useSelector } from "react-redux";
import {
  AlertCircle,
  ChevronRight,
  FileText,
  FolderOpen,
  PanelLeftClose,
  PanelLeftOpen,
  RefreshCw,
  Sparkles,
} from "lucide-react";

import Wrapper from "@/components/Wrapper";
import { Button } from "@/components/ui/button";
import { OverlayLoader } from "@/components/ui/overlay-loader";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import PptGeneratorWorkflowStepper from "@/ppt_generator/components/PptGeneratorWorkflowStepper";
import { useI18n } from "@/shared/i18n";
import WelcomeBanner from "@/shared/components/WelcomeBanner";
import entranceStyles from "@/shared/page-entrance/PageEntrance.module.css";
import { usePageEntrance } from "@/shared/page-entrance/usePageEntrance";
import { RootState } from "@/store/store";
import { setPresentationId } from "@/store/slices/presentationGeneration";
import { notify } from "@/components/ui/sonner";
import { trackEvent, MixpanelEvent } from "@/utils/mixpanel";
import { getApiUrl } from "@/utils/api";

import { PresentationGenerationApi } from "../../services/api/presentation-generation";
import { pptGeneratorFetch } from "../../services/api/ppt_generator-fetch";
import { getHeader } from "../../services/api/header";
import { getIconFromFile } from "../../utils/others";
import MarkdownRenderer from "./MarkdownRenderer";
import styles from "./DocumentPreviewPage.module.css";

interface LoadingState {
  message: string;
  show: boolean;
  duration: number;
  progress: boolean;
}

interface FileItem {
  name: string;
  file_path: string;
}

interface DocumentStatus {
  status: "idle" | "loading" | "ready" | "error";
  error?: string;
}

type TextContents = Record<string, string>;
type DocumentStatusMap = Record<string, DocumentStatus>;

function collectFileItems(input: unknown, bucket: FileItem[] = []): FileItem[] {
  if (Array.isArray(input)) {
    input.forEach((entry) => collectFileItems(entry, bucket));
    return bucket;
  }

  if (
    input &&
    typeof input === "object" &&
    "name" in input &&
    "file_path" in input
  ) {
    const candidate = input as Partial<FileItem>;
    if (
      typeof candidate.name === "string" &&
      candidate.name &&
      typeof candidate.file_path === "string" &&
      candidate.file_path
    ) {
      bucket.push({
        name: candidate.name,
        file_path: candidate.file_path,
      });
    }
  }

  return bucket;
}

function getDisplayName(name: string): string {
  return name.split(/[\\/]/).pop() || name;
}

function normalizePreviewContent(content: string): string {
  return content
    .replace(/\uFEFF/g, "")
    .replace(/\r\n/g, "\n")
    .trim();
}

function getDocumentStateLabel(
  t: ReturnType<typeof useI18n>["t"],
  status: DocumentStatus["status"],
  hasContent: boolean
): string {
  if (status === "error") {
    return t("ppt_generator.documents.state.error");
  }

  if (status === "ready") {
    return hasContent
      ? t("ppt_generator.documents.state.ready")
      : t("ppt_generator.documents.state.empty");
  }

  return t("ppt_generator.documents.state.loading");
}

const DocumentsPreviewPage: React.FC = () => {
  const { t } = useI18n();
  const isEntranceActive = usePageEntrance();
  const dispatch = useDispatch();
  const router = useRouter();
  const pathname = usePathname();

  const { config, files } = useSelector(
    (state: RootState) => state.pptGenUpload
  );

  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [selectedDocumentPath, setSelectedDocumentPath] = useState<string | null>(null);
  const [textContents, setTextContents] = useState<TextContents>({});
  const [documentStatuses, setDocumentStatuses] = useState<DocumentStatusMap>({});
  const [showLoading, setShowLoading] = useState<LoadingState>({
    message: "",
    show: false,
    duration: 10,
    progress: false,
  });

  const fileItems = useMemo(() => collectFileItems(files), [files]);

  const selectedFile = useMemo(
    () =>
      fileItems.find((file) => file.file_path === selectedDocumentPath) ??
      fileItems[0] ??
      null,
    [fileItems, selectedDocumentPath]
  );

  const selectedContent = selectedFile
    ? textContents[selectedFile.file_path] ?? ""
    : "";
  const selectedStatus = selectedFile
    ? documentStatuses[selectedFile.file_path]?.status ?? "idle"
    : "idle";
  const selectedError = selectedFile
    ? documentStatuses[selectedFile.file_path]?.error
    : undefined;

  const selectedCharacterCount = selectedContent.length.toLocaleString();

  const readFile = useCallback(
    async (filePath: string): Promise<string> => {
      const response = await pptGeneratorFetch(getApiUrl("/api/v1/app/read-file"), {
        method: "POST",
        headers: getHeader(),
        body: JSON.stringify({ filePath }),
        cache: "no-cache",
      });

      if (!response.ok) {
        let errorMessage = t("ppt_generator.documents.notify.readFailed.body");
        try {
          const payload = await response.clone().json();
          if (typeof payload?.detail === "string" && payload.detail.trim()) {
            errorMessage = payload.detail;
          }
        } catch {
          // Fall through to the generic message below.
        }
        throw new Error(errorMessage);
      }

      const payload = await response.json();
      return typeof payload?.content === "string" ? payload.content : "";
    },
    [t]
  );

  const loadDocument = useCallback(
    async (file: FileItem, force = false) => {
      const existingStatus = documentStatuses[file.file_path]?.status;
      if (
        !force &&
        (existingStatus === "loading" ||
          existingStatus === "ready" ||
          existingStatus === "error")
      ) {
        return;
      }

      setDocumentStatuses((prev) => ({
        ...prev,
        [file.file_path]: { status: "loading" },
      }));

      try {
        const content = await readFile(file.file_path);
        setTextContents((prev) => ({
          ...prev,
          [file.file_path]: normalizePreviewContent(content),
        }));
        setDocumentStatuses((prev) => ({
          ...prev,
          [file.file_path]: { status: "ready" },
        }));
      } catch (error: any) {
        const message =
          error?.message || t("ppt_generator.documents.notify.readFailed.body");

        setTextContents((prev) => ({
          ...prev,
          [file.file_path]: "",
        }));
        setDocumentStatuses((prev) => ({
          ...prev,
          [file.file_path]: {
            status: "error",
            error: message,
          },
        }));
        notify.error(t("ppt_generator.documents.notify.readFailed.title"), message);
      }
    },
    [documentStatuses, readFile, t]
  );

  const handleCreatePresentation = async () => {
    try {
      setShowLoading({
        message: t("ppt_generator.documents.loading"),
        show: true,
        duration: 40,
        progress: true,
      });

      const documentPaths = fileItems.map((file) => file.file_path);
      trackEvent(MixpanelEvent.DocumentsPreview_Create_Presentation_API_Call);
      const createResponse = await PresentationGenerationApi.createPresentation({
        content: config?.prompt ?? "",
        n_slides: config?.slides ? parseInt(config.slides, 10) : null,
        file_paths: documentPaths,
        language: config?.language ?? "",
        tone: config?.tone,
        verbosity: config?.verbosity,
        instructions: config?.instructions || null,
        include_table_of_contents: !!config?.includeTableOfContents,
        include_title_slide: !!config?.includeTitleSlide,
        web_search: !!config?.webSearch,
      });

      dispatch(setPresentationId(createResponse.id));
      trackEvent(MixpanelEvent.Navigation, { from: pathname, to: "/outline" });
      router.replace("/outline");
    } catch (error: any) {
      notify.error(
        t("ppt_generator.documents.notify.createFailed.title"),
        error?.message || t("ppt_generator.documents.notify.createFailed.body")
      );
      setShowLoading({
        message: t("ppt_generator.documents.error.create"),
        show: true,
        duration: 10,
        progress: false,
      });
    } finally {
      setShowLoading({
        message: "",
        show: false,
        duration: 10,
        progress: false,
      });
    }
  };

  useEffect(() => {
    if (fileItems.length === 0) {
      setSelectedDocumentPath(null);
      return;
    }

    setSelectedDocumentPath((current) => {
      if (current && fileItems.some((file) => file.file_path === current)) {
        return current;
      }
      return fileItems[0].file_path;
    });
  }, [fileItems]);

  useEffect(() => {
    if (!selectedFile) {
      return;
    }
    void loadDocument(selectedFile);
  }, [loadDocument, selectedFile]);

  const stateLabel = useMemo(() => {
    if (!selectedFile) {
      return t("ppt_generator.documents.state.missing");
    }
    if (selectedStatus === "loading" || selectedStatus === "idle") {
      return t("ppt_generator.documents.state.loading");
    }
    if (selectedStatus === "error") {
      return t("ppt_generator.documents.state.error");
    }
    if (!selectedContent) {
      return t("ppt_generator.documents.state.empty");
    }
    return t("ppt_generator.documents.state.ready");
  }, [selectedContent, selectedFile, selectedStatus, t]);

  const renderViewerBody = () => {
    if (!selectedFile) {
      return (
        <div className={styles.stateCard}>
          <div className={styles.stateInner}>
            <div className={styles.stateIcon}>
              <FolderOpen className="h-6 w-6" />
            </div>
            <h3 className={styles.stateTitle}>
              {t("ppt_generator.documents.missing.title")}
            </h3>
            <p className={styles.stateText}>
              {t("ppt_generator.documents.missing.body")}
            </p>
            <Button
              type="button"
              variant="outline"
              className={styles.secondaryButton}
              onClick={() => router.push("/upload")}
            >
              {t("ppt_generator.documents.missing.cta")}
            </Button>
          </div>
        </div>
      );
    }

    if (selectedStatus === "loading" || selectedStatus === "idle") {
      return (
        <div className={styles.loadingStack}>
          <Skeleton className="h-6 w-44 rounded-full" />
          <Skeleton className="h-5 w-full rounded-full" />
          <Skeleton className="h-5 w-[92%] rounded-full" />
          <Skeleton className="h-5 w-[88%] rounded-full" />
          <Skeleton className="h-5 w-[95%] rounded-full" />
          <Skeleton className="h-40 w-full rounded-[20px]" />
        </div>
      );
    }

    if (selectedStatus === "error") {
      return (
        <div className={styles.stateCard}>
          <div className={styles.stateInner}>
            <div className={cn(styles.stateIcon, styles.stateIconWarning)}>
              <AlertCircle className="h-6 w-6" />
            </div>
            <h3 className={styles.stateTitle}>
              {t("ppt_generator.documents.error.title")}
            </h3>
            <p className={styles.stateText}>
              {selectedError || t("ppt_generator.documents.error.body")}
            </p>
            <Button
              type="button"
              variant="outline"
              className={styles.secondaryButton}
              onClick={() => selectedFile && void loadDocument(selectedFile, true)}
            >
              <RefreshCw className="h-4 w-4" />
              {t("ppt_generator.documents.retry")}
            </Button>
          </div>
        </div>
      );
    }

    if (!selectedContent) {
      return (
        <div className={styles.stateCard}>
          <div className={styles.stateInner}>
            <div className={styles.stateIcon}>
              <FileText className="h-6 w-6" />
            </div>
            <h3 className={styles.stateTitle}>
              {t("ppt_generator.documents.empty.title")}
            </h3>
            <p className={styles.stateText}>
              {t("ppt_generator.documents.empty.body")}
            </p>
          </div>
        </div>
      );
    }

    return (
      <div className={styles.contentText}>
        <MarkdownRenderer content={selectedContent} />
      </div>
    );
  };

  return (
    <div className={styles.page}>
      <OverlayLoader
        show={showLoading.show}
        text={showLoading.message}
        showProgress={showLoading.progress}
        duration={showLoading.duration}
      />

      <Wrapper
        className={cn(
          styles.shell,
          entranceStyles.pageEntrance,
          isEntranceActive && entranceStyles.pageEntranceActive
        )}
      >
        <WelcomeBanner
          title={t("ppt_generator.documents.banner.title")}
          subtitle={t("ppt_generator.documents.banner.subtitle")}
          variant="workspace"
          className={styles.banner}
        />

        <PptGeneratorWorkflowStepper
          activeStep="prepare"
          onBack={() => router.push("/upload")}
        />

        {!isSidebarOpen && fileItems.length > 0 ? (
          <div className={styles.revealBar}>
            <Button
              type="button"
              variant="outline"
              className={styles.secondaryButton}
              onClick={() => setIsSidebarOpen(true)}
            >
              <PanelLeftOpen className="h-4 w-4" />
              {t("ppt_generator.documents.openPanel")}
            </Button>
          </div>
        ) : null}

        <div className={styles.workspaceGrid}>
          {isSidebarOpen ? (
            <aside className={cn(styles.surfaceCard, styles.sidebarCard)}>
              <div className={styles.sidebarHeader}>
                <div className={styles.sidebarCopy}>
                  <span className={styles.badge}>
                    <FileText className="h-3.5 w-3.5" />
                    {t("ppt_generator.documents.section.documents")}
                  </span>
                  <h2 className={styles.sideTitle}>
                    {t("ppt_generator.documents.library.title")}
                  </h2>
                  <p className={styles.sideDescription}>
                    {t("ppt_generator.documents.library.body")}
                  </p>
                </div>
                <button
                  type="button"
                  className={styles.iconButton}
                  onClick={() => setIsSidebarOpen(false)}
                  aria-label={t("ppt_generator.documents.closePanel")}
                >
                  <PanelLeftClose className="h-4 w-4" />
                </button>
              </div>

              <div className={styles.docList}>
                {fileItems.map((file) => {
                  const isActive = selectedFile?.file_path === file.file_path;

                  return (
                    <button
                      key={file.file_path}
                      type="button"
                      onClick={() => setSelectedDocumentPath(file.file_path)}
                      className={cn(
                        styles.docButton,
                        isActive && styles.docButtonActive
                      )}
                    >
                      <span className={styles.iconFrame}>
                        <img
                          className="h-5 w-5"
                          src={getIconFromFile(file.name)}
                          alt=""
                          aria-hidden="true"
                        />
                      </span>
                      <span className={styles.docBody}>
                        <span className={styles.docName}>
                          {getDisplayName(file.name)}
                        </span>
                        <span className={styles.docMeta}>
                          {getDocumentStateLabel(
                            t,
                            documentStatuses[file.file_path]?.status ?? "idle",
                            !!textContents[file.file_path]
                          )}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </aside>
          ) : null}

          <section className={cn(styles.surfaceCard, styles.viewerCard)}>
            <div className={styles.viewerHeader}>
              <div className={styles.viewerTitleWrap}>
                <span className={styles.mutedBadge}>
                  <Sparkles className="h-3.5 w-3.5" />
                  {t("ppt_generator.documents.content")}
                </span>
                <h2 className={styles.sectionTitle}>
                  {selectedFile
                    ? getDisplayName(selectedFile.name)
                    : t("ppt_generator.documents.missing.title")}
                </h2>
                <p className={styles.sectionDescription}>
                  {t("ppt_generator.documents.viewer.subtitle")}
                </p>
              </div>

              <div className={styles.viewerTools}>
                <span className={styles.statePill}>{stateLabel}</span>
                {selectedFile ? (
                  <Button
                    type="button"
                    variant="outline"
                    className={styles.secondaryButton}
                    onClick={() => void loadDocument(selectedFile, true)}
                  >
                    <RefreshCw className="h-4 w-4" />
                    {t("ppt_generator.documents.retry")}
                  </Button>
                ) : null}
              </div>
            </div>

            <div className={styles.contentViewport}>{renderViewerBody()}</div>
          </section>

          <aside className={cn(styles.surfaceCard, styles.summaryCard)}>
            <span className={styles.badge}>
              <Sparkles className="h-3.5 w-3.5" />
              {t("ppt_generator.documents.summary.badge")}
            </span>
            <h3 className={styles.sideTitle}>
              {t("ppt_generator.documents.summary.title")}
            </h3>
            <p className={styles.sideDescription}>
              {t("ppt_generator.documents.summary.body")}
            </p>

            <div className={styles.summaryList}>
              <div className={styles.summaryRow}>
                <span className={styles.summaryLabel}>
                  {t("ppt_generator.documents.summary.documents")}
                </span>
                <span className={styles.summaryValue}>
                  {fileItems.length.toLocaleString()}
                </span>
              </div>
              <div className={styles.summaryRow}>
                <span className={styles.summaryLabel}>
                  {t("ppt_generator.documents.summary.selected")}
                </span>
                <span className={styles.summaryValue}>
                  {selectedFile ? getDisplayName(selectedFile.name) : "-"}
                </span>
              </div>
              <div className={styles.summaryRow}>
                <span className={styles.summaryLabel}>
                  {t("ppt_generator.documents.summary.characters")}
                </span>
                <span className={styles.summaryValue}>
                  {selectedContent ? selectedCharacterCount : "-"}
                </span>
              </div>
              <div className={styles.summaryRow}>
                <span className={styles.summaryLabel}>
                  {t("ppt_generator.documents.summary.state")}
                </span>
                <span className={styles.summaryValue}>{stateLabel}</span>
              </div>
            </div>

            <div className={styles.actionBlock}>
              <Button
                type="button"
                onClick={handleCreatePresentation}
                className={styles.nextButton}
                disabled={fileItems.length === 0}
              >
                <span>{t("ppt_generator.documents.next")}</span>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </aside>
        </div>
      </Wrapper>
    </div>
  );
};

export default DocumentsPreviewPage;


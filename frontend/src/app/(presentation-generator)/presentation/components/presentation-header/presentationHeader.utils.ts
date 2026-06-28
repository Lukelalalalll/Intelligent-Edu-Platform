import { resolveBackendAssetUrl } from "@/utils/api";

const MAX_EXPORT_TITLE_LENGTH = 40;

export type ExportFormat = "pdf" | "pptx";

export type ExportResponsePayload = {
  success?: boolean;
  downloadUrl?: string | null;
  path?: string | null;
};

export const buildSafeExportFileName = (
  rawTitle: string | null | undefined,
  extension: ExportFormat
) => {
  const normalizedTitle = (rawTitle || "presentation").trim();
  const titleWithoutExtension = normalizedTitle.replace(/\.(pdf|pptx)$/i, "");

  let safeBase = titleWithoutExtension
    .replace(/[^a-zA-Z0-9\s_-]+/g, "-")
    .replace(/\s+/g, "-")
    .replace(/[-_]{2,}/g, "-")
    .replace(/^[-_]+|[-_]+$/g, "");

  if (!safeBase) {
    safeBase = "presentation";
  }

  if (safeBase.length > MAX_EXPORT_TITLE_LENGTH) {
    safeBase = safeBase
      .slice(0, MAX_EXPORT_TITLE_LENGTH)
      .replace(/[-_]+$/g, "");
  }

  if (!safeBase) {
    safeBase = "presentation";
  }

  return `${safeBase}.${extension}`;
};

export const readExportErrorMessage = async (
  response: Response,
  fallback: string
): Promise<string> => {
  try {
    const responseText = await response.text();
    if (!responseText.trim()) {
      return fallback;
    }

    const payload = JSON.parse(responseText);
    if (typeof payload?.detail === "string" && payload.detail.trim()) {
      return payload.detail;
    }
    if (typeof payload?.error === "string" && payload.error.trim()) {
      return payload.error;
    }
    if (typeof payload?.message === "string" && payload.message.trim()) {
      return payload.message;
    }
    if (!responseText.trimStart().startsWith("<")) {
      return responseText.trim();
    }
  } catch {
    // Ignore JSON parsing failures and fall back to the default message below.
  }

  return fallback;
};

export const downloadBackendAsset = (path: string, fileName: string) => {
  const link = document.createElement("a");
  link.href = resolveBackendAssetUrl(path);
  link.download = fileName;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};


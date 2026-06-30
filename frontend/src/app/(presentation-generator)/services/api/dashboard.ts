import { getHeader } from "@/app/(presentation-generator)/services/api/header";
import { ApiResponseHandler } from "@/app/(presentation-generator)/services/api/api-error-handler";
import { pptGeneratorFetch } from "@/app/(presentation-generator)/services/api/ppt_generator-fetch";
import { getApiUrl } from "@/utils/api";

export interface DashboardPresentationPreview {
  eyebrow: string | null;
  heading: string | null;
  summary: string | null;
  imageUrl: string | null;
  layout: string | null;
  layoutGroup: string | null;
}

export interface DashboardPresentationSlide {
  id: string;
  presentation: string;
  index: number;
  layout: string;
  layout_group: string;
  content: Record<string, any>;
  html_content?: string | null;
  speaker_note?: string | null;
  properties?: Record<string, any> | null;
}

export interface DashboardPresentationSummary {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  slideCount: number;
  theme: Record<string, any> | null;
  thumbnailUrl: string | null;
  firstSlidePreview: DashboardPresentationPreview | null;
  slides: DashboardPresentationSlide[];
}

interface DashboardLegacyPresentationApiItem {
  id?: string;
  title?: string;
  created_at?: string;
  createdAt?: string;
  updated_at?: string;
  updatedAt?: string;
  n_slides?: number;
  slideCount?: number;
  theme?: Record<string, any> | null;
  thumbnail?: string | null;
  thumbnailUrl?: string | null;
  slides?: Array<Record<string, any>>;
  presentonPresentationId?: string;
}

const DASHBOARD_LIST_CACHE_TTL_MS = 15_000;

let dashboardPresentationListCache: DashboardPresentationSummary[] | null = null;
let dashboardPresentationListCacheExpiresAt = 0;
let dashboardPresentationListRequest: Promise<DashboardPresentationSummary[]> | null = null;

function stripMarkdown(value: string): string {
  return String(value || "")
    .replace(/!\[[^\]]*\]\([^)]+\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[`*_>#~-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function truncatePreviewText(value: string, limit = 220): string {
  const normalized = stripMarkdown(value);
  if (normalized.length <= limit) {
    return normalized;
  }
  return `${normalized.slice(0, limit - 3).trimEnd()}...`;
}

function collectPreviewStrings(value: unknown, bucket: string[]) {
  if (!value) {
    return;
  }

  if (typeof value === "string") {
    const normalized = truncatePreviewText(value);
    if (normalized) {
      bucket.push(normalized);
    }
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((item) => collectPreviewStrings(item, bucket));
    return;
  }

  if (typeof value === "object") {
    Object.values(value as Record<string, unknown>).forEach((item) =>
      collectPreviewStrings(item, bucket)
    );
  }
}

function extractPreviewImageUrl(value: unknown): string | null {
  if (!value) {
    return null;
  }

  if (typeof value === "string") {
    const normalized = value.trim();
    if (/^(https?:)?\/\//i.test(normalized) || normalized.startsWith("/")) {
      return normalized;
    }
    return null;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const candidate = extractPreviewImageUrl(item);
      if (candidate) {
        return candidate;
      }
    }
    return null;
  }

  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    for (const key of ["__image_url__", "imageUrl", "thumbnailUrl", "src", "url"]) {
      const candidate = record[key];
      if (typeof candidate === "string" && candidate.trim()) {
        return candidate.trim();
      }
    }

    for (const candidate of Object.values(record)) {
      const nested = extractPreviewImageUrl(candidate);
      if (nested) {
        return nested;
      }
    }
  }

  return null;
}

function normalizePresentationSlide(
  slide: Record<string, any> | null | undefined,
  presentationId: string
): DashboardPresentationSlide | null {
  if (!slide || typeof slide !== "object") {
    return null;
  }

  return {
    id: String(slide.id || slide.slideId || `${presentationId}-slide-0`),
    presentation: String(slide.presentation || slide.presentonPresentationId || presentationId),
    index: typeof slide.index === "number" ? slide.index : 0,
    layout: typeof slide.layout === "string" ? slide.layout : "",
    layout_group:
      typeof slide.layout_group === "string"
        ? slide.layout_group
        : typeof slide.layoutGroup === "string"
          ? slide.layoutGroup
          : "",
    content: slide.content && typeof slide.content === "object" ? slide.content : {},
    html_content:
      typeof slide.html_content === "string"
        ? slide.html_content
        : typeof slide.htmlContent === "string"
          ? slide.htmlContent
          : null,
    speaker_note:
      typeof slide.speaker_note === "string"
        ? slide.speaker_note
        : typeof slide.speakerNote === "string"
          ? slide.speakerNote
          : null,
    properties: slide.properties && typeof slide.properties === "object" ? slide.properties : null,
  };
}

function buildFirstSlidePreview(
  slide: DashboardPresentationSlide | null
): DashboardPresentationPreview | null {
  if (!slide) {
    return null;
  }

  const strings: string[] = [];
  collectPreviewStrings(slide.content, strings);

  return {
    eyebrow: strings[0] || null,
    heading: strings[1] || strings[0] || null,
    summary: strings[2] || strings[1] || null,
    imageUrl: extractPreviewImageUrl(slide.content),
    layout: slide.layout || null,
    layoutGroup: slide.layout_group || null,
  };
}

function normalizePresentationSummary(
  item: DashboardLegacyPresentationApiItem
): DashboardPresentationSummary {
  const presentationId = String(item.id || item.presentonPresentationId || "");
  const slides = Array.isArray(item.slides)
    ? item.slides
        .map((slide) => normalizePresentationSlide(slide, presentationId))
        .filter((slide): slide is DashboardPresentationSlide => Boolean(slide))
    : [];
  const firstSlidePreview = buildFirstSlidePreview(slides[0] || null);

  return {
    id: presentationId,
    title: typeof item.title === "string" ? item.title : "",
    createdAt:
      typeof item.createdAt === "string"
        ? item.createdAt
        : typeof item.created_at === "string"
          ? item.created_at
          : "",
    updatedAt:
      typeof item.updatedAt === "string"
        ? item.updatedAt
        : typeof item.updated_at === "string"
          ? item.updated_at
          : "",
    slideCount:
      typeof item.slideCount === "number" && Number.isFinite(item.slideCount)
        ? item.slideCount
        : typeof item.n_slides === "number" && Number.isFinite(item.n_slides)
          ? item.n_slides
          : slides.length,
    theme: item.theme && typeof item.theme === "object" ? item.theme : null,
    thumbnailUrl:
      typeof item.thumbnailUrl === "string" && item.thumbnailUrl.trim()
        ? item.thumbnailUrl.trim()
        : typeof item.thumbnail === "string" && item.thumbnail.trim()
          ? item.thumbnail.trim()
          : firstSlidePreview?.imageUrl || null,
    firstSlidePreview,
    slides,
  };
}

function getCachedDashboardPresentationList(): DashboardPresentationSummary[] | null {
  if (
    dashboardPresentationListCache &&
    Date.now() < dashboardPresentationListCacheExpiresAt
  ) {
    return dashboardPresentationListCache;
  }
  return null;
}

async function fetchDashboardPresentationList(): Promise<DashboardPresentationSummary[]> {
  const response = await pptGeneratorFetch(getApiUrl(`/api/v1/ppt/presentation/all`), {
    method: "GET",
  });

  if (response.status === 404) {
    return [];
  }

  const payload = (await ApiResponseHandler.handleResponse(
    response,
    "Failed to fetch presentations"
  )) as DashboardLegacyPresentationApiItem[];

  return Array.isArray(payload)
    ? payload.map(normalizePresentationSummary).filter((item) => item.id)
    : [];
}

export class DashboardApi {
  static invalidatePresentationListCache() {
    dashboardPresentationListCache = null;
    dashboardPresentationListCacheExpiresAt = 0;
    dashboardPresentationListRequest = null;
  }

  static async getPresentations(
    options?: { force?: boolean }
  ): Promise<DashboardPresentationSummary[]> {
    const force = Boolean(options?.force);
    if (!force) {
      const cached = getCachedDashboardPresentationList();
      if (cached) {
        return cached;
      }
      if (dashboardPresentationListRequest) {
        return dashboardPresentationListRequest;
      }
    }

    const request = fetchDashboardPresentationList()
      .then((items) => {
        dashboardPresentationListCache = items;
        dashboardPresentationListCacheExpiresAt = Date.now() + DASHBOARD_LIST_CACHE_TTL_MS;
        return items;
      })
      .catch((error) => {
        DashboardApi.invalidatePresentationListCache();
        throw error;
      })
      .finally(() => {
        dashboardPresentationListRequest = null;
      });

    dashboardPresentationListRequest = request;
    return request;
  }

  static async getPresentation(id: string) {
    try {
      const response = await pptGeneratorFetch(
        getApiUrl(`/api/v1/ppt/presentation/${id}`),
        {
          method: "GET",
        }
      );

      return await ApiResponseHandler.handleResponse(response, "Presentation not found");
    } catch (error) {
      console.error("Error fetching presentation:", error);
      throw error;
    }
  }

  static async deletePresentation(presentation_id: string) {
    try {
      const response = await pptGeneratorFetch(
        getApiUrl(`/api/v1/ppt/presentation/${presentation_id}`),
        {
          method: "DELETE",
          headers: getHeader(),
        }
      );

      const result = await ApiResponseHandler.handleResponseWithResult(
        response,
        "Failed to delete presentation"
      );
      if (result.success) {
        DashboardApi.invalidatePresentationListCache();
      }
      return result;
    } catch (error) {
      console.error("Error deleting presentation:", error);
      return {
        success: false,
        message: error instanceof Error ? error.message : "Failed to delete presentation",
      };
    }
  }
}

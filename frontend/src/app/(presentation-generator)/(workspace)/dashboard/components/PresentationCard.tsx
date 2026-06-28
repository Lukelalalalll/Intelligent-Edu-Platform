'use client'

import React, { useEffect, useMemo } from "react";
import { DashboardApi, PresentationResponse } from "@/app/(presentation-generator)/services/api/dashboard";
import { AlertTriangle, ArrowUpRight, CalendarDays, EllipsisVertical, Layers3, Loader2, Trash2 } from "lucide-react";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
import { usePathname, useRouter } from "@/ppt_generator/shims/next-navigation";
import { notify } from "@/components/ui/sonner";
import { useFontLoader } from "@/app/(presentation-generator)/hooks/useFontLoad";
import SlideScale from "@/app/(presentation-generator)/components/PresentationRender";
import MarkdownRenderer from "@/components/MarkDownRender";
import { useI18n } from "@/shared/i18n";
import { trackEvent, MixpanelEvent } from "@/utils/mixpanel";
import {
  formatPresentationDate,
  getPresentationSlideCount,
  getPresentationTimestamp,
} from "./dashboardUtils";

type PresentationCardProps = {
  presentation: PresentationResponse;
  onDeleted?: (presentationId: string) => void;
};

type ThemeFont = {
  data?: {
    colors?: Record<string, string>;
    fonts?: {
      textFont?: {
        name?: string;
        url?: string;
      };
    };
  };
};

export const PresentationCard = ({
  presentation,
  onDeleted,
}: PresentationCardProps) => {
  const { locale, t } = useI18n();
  const router = useRouter();
  const pathname = usePathname();
  const [showDeleteDialog, setShowDeleteDialog] = React.useState(false);
  const [isDeleting, setIsDeleting] = React.useState(false);

  const {
    id,
    title,
    created_at,
    updated_at,
    theme,
    slides,
    n_slides,
  } = presentation;

  const cardTimestamp = getPresentationTimestamp({ created_at, updated_at } as PresentationResponse);
  const slideCount = getPresentationSlideCount({ slides, n_slides } as PresentationResponse);
  const firstSlide = slides?.[0];
  const unknownDateLabel = t("ppt_generator.dashboard.card.unknownDate");
  const dateLabel = formatPresentationDate(cardTimestamp, locale, "long", unknownDateLabel);
  const detailedDateLabel = formatPresentationDate(cardTimestamp, locale, "dateTime", unknownDateLabel);
  const createdTimestamp = created_at ? new Date(created_at).getTime() : 0;
  const createdDateLabel = formatPresentationDate(
    createdTimestamp || cardTimestamp,
    locale,
    "short",
    unknownDateLabel
  );

  const cardTheme = useMemo(() => theme as ThemeFont | null, [theme]);
  const fontName = cardTheme?.data?.fonts?.textFont?.name?.trim() || "";
  const fontUrl = cardTheme?.data?.fonts?.textFont?.url?.trim() || "";

  useEffect(() => {
    const element = document.getElementById(`dashboard-presentation-card-${id}`);
    if (!element) return;

    const colors = cardTheme?.data?.colors;
    if (!colors?.graph_0) return;

    Object.entries({
      "--primary-color": colors.primary,
      "--background-color": colors.background,
      "--card-color": colors.card,
      "--stroke": colors.stroke,
      "--primary-text": colors.primary_text,
      "--background-text": colors.background_text,
      "--graph-0": colors.graph_0,
      "--graph-1": colors.graph_1,
      "--graph-2": colors.graph_2,
      "--graph-3": colors.graph_3,
      "--graph-4": colors.graph_4,
      "--graph-5": colors.graph_5,
      "--graph-6": colors.graph_6,
      "--graph-7": colors.graph_7,
      "--graph-8": colors.graph_8,
      "--graph-9": colors.graph_9,
    }).forEach(([key, value]) => {
      if (typeof value === "string" && value) {
        element.style.setProperty(key, value);
      }
    });

    if (fontName) {
      element.style.setProperty("font-family", `"${fontName}"`);
      element.style.setProperty("--heading-font-family", `"${fontName}"`);
      element.style.setProperty("--body-font-family", `"${fontName}"`);
    }
  }, [cardTheme, fontName, id]);

  useFontLoader(fontName && fontUrl ? { [fontName]: fontUrl } : {});

  const handlePreview = (e?: React.MouseEvent | React.KeyboardEvent) => {
    e?.preventDefault();
    trackEvent(MixpanelEvent.Dashboard_Presentation_Opened, {
      pathname,
      presentation_id: id,
      title_length: (title || "").length,
      slide_count: slideCount,
    });
    router.push(`/presentation?id=${id}&type=standard`);
  };

  const handleDelete = async () => {
    if (isDeleting) return;
    setIsDeleting(true);
    const response = await DashboardApi.deletePresentation(id);

    if (response?.success) {
      trackEvent(MixpanelEvent.Dashboard_Presentation_Deleted, {
        pathname,
        presentation_id: id,
        slide_count: slideCount,
      });
      notify.success(
        t("ppt_generator.dashboard.notify.deleteSuccess.title"),
        t("ppt_generator.dashboard.notify.deleteSuccess.body"),
      );
      setShowDeleteDialog(false);
      onDeleted?.(id);
    } else {
      notify.error(
        t("ppt_generator.dashboard.notify.deleteFailed.title"),
        response?.message || t("ppt_generator.dashboard.notify.deleteFailed.body")
      );
    }
    setIsDeleting(false);
  };

  const handleCardKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      handlePreview(event);
    }
  };

  return (
    <>
      <article
        className="group relative flex h-full flex-col overflow-hidden rounded-[28px] border border-[rgba(15,23,42,0.08)] bg-[linear-gradient(180deg,rgba(249,252,250,0.98)_0%,rgba(255,255,255,0.98)_100%)] shadow-[0_20px_40px_-26px_rgba(15,23,42,0.24)] transition duration-300 hover:-translate-y-1 hover:border-[rgba(0,123,85,0.18)] hover:shadow-[0_28px_50px_-24px_rgba(0,123,85,0.28)] focus-within:border-[rgba(0,123,85,0.18)] focus-within:shadow-[0_28px_50px_-24px_rgba(0,123,85,0.28)]"
      >
        <div
          role="button"
          tabIndex={0}
          onClick={() => handlePreview()}
          onKeyDown={handleCardKeyDown}
          className="flex h-full flex-col focus-visible:outline-none"
          aria-label={t("ppt_generator.dashboard.card.ariaOpen", {
            title: title || t("ppt_generator.dashboard.card.untitled"),
          })}
        >
          <div className="relative overflow-hidden border-b border-[rgba(15,23,42,0.08)] bg-[linear-gradient(135deg,rgba(232,245,238,0.95)_0%,rgba(248,250,252,0.98)_80%)] p-[1.05rem] sm:p-[1.15rem]">
            <div className="absolute inset-x-0 top-0 h-24 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.78),transparent_70%)]" />
            <div
              id={`dashboard-presentation-card-${id}`}
              suppressHydrationWarning
              className="relative overflow-hidden rounded-[22px] border border-white/75 bg-white/92 shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_18px_34px_-20px_rgba(15,23,42,0.22)]"
            >
              <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-center justify-between px-4 py-3 opacity-0 transition duration-300 group-hover:opacity-100 group-focus-within:opacity-100">
                <div className="rounded-full bg-[linear-gradient(135deg,#007b55_0%,#0b6b4b_100%)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-white">
                  {t("ppt_generator.dashboard.card.openBadge")}
                </div>
                <div className="rounded-full border border-white/70 bg-white/88 p-2 text-[#171923] shadow-sm">
                  <ArrowUpRight className="h-4 w-4" />
                </div>
              </div>
              {firstSlide ? (
                <div className="aspect-[16/9] overflow-hidden">
                  <SlideScale slide={firstSlide} isClickable={false} />
                </div>
              ) : (
                <div className="flex aspect-[16/9] items-center justify-center bg-[linear-gradient(135deg,rgba(248,250,252,1)_0%,rgba(232,245,238,0.92)_100%)] text-sm font-medium text-slate-500">
                  {t("ppt_generator.dashboard.card.noPreview")}
                </div>
              )}
            </div>
          </div>

          <div className="flex flex-1 flex-col gap-5 px-6 pb-6 pt-5 sm:px-6 sm:pb-6 sm:pt-5">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0 space-y-3 pr-2">
                <div className="text-[1.04rem] font-semibold leading-7 text-[#101828]">
                  <MarkdownRenderer
                    content={title || t("ppt_generator.dashboard.card.untitled")}
                    className="mb-0 line-clamp-2 text-[1.04rem] font-semibold leading-7 text-[#101828]"
                  />
                </div>
                <p className="pr-4 text-sm leading-6 text-slate-500" title={detailedDateLabel}>
                  {t("ppt_generator.dashboard.card.lastUpdated", { date: dateLabel })}
                </p>
              </div>

              <Popover>
                <PopoverTrigger
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[rgba(15,23,42,0.08)] bg-white text-slate-500 transition hover:border-[rgba(0,123,85,0.16)] hover:text-[#0b6b4b] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(0,123,85,0.22)]"
                  onClick={(e) => e.stopPropagation()}
                  aria-label={t("ppt_generator.dashboard.card.actions")}
                >
                  <EllipsisVertical className="h-4 w-4" />
                </PopoverTrigger>
                <PopoverContent align="end" className="w-[220px] rounded-2xl border border-[rgba(15,23,42,0.08)] bg-white p-2 shadow-xl">
                  <button
                    className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-sm text-[#101828] transition hover:bg-slate-50"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      handlePreview(e);
                    }}
                  >
                    <span>{t("ppt_generator.dashboard.card.action.open")}</span>
                    <ArrowUpRight className="h-4 w-4 text-slate-500" />
                  </button>
                  <button
                    className="mt-1 flex w-full items-center justify-between rounded-xl px-3 py-2 text-sm text-red-600 transition hover:bg-red-50"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setShowDeleteDialog(true);
                    }}
                  >
                    <span>{t("ppt_generator.dashboard.card.action.delete")}</span>
                    <Trash2 className="h-4 w-4" />
                  </button>
                </PopoverContent>
              </Popover>
            </div>

            <div className="mt-auto flex flex-wrap items-center gap-3 pt-1 text-sm text-slate-600">
              <div className="inline-flex min-h-11 items-center gap-2 rounded-full border border-[rgba(15,23,42,0.08)] bg-[rgba(248,250,252,0.92)] px-4 py-2.5">
                <Layers3 className="h-4 w-4 text-[#0b6b4b]" />
                <span>
                  {slideCount > 0
                    ? slideCount === 1
                      ? t("ppt_generator.dashboard.card.slideSingle", { count: slideCount })
                      : t("ppt_generator.dashboard.card.slideOther", { count: slideCount })
                    : t("ppt_generator.dashboard.card.slideAuto")}
                </span>
              </div>
              <div className="inline-flex min-h-11 items-center gap-2 rounded-full border border-[rgba(15,23,42,0.08)] bg-[rgba(248,250,252,0.92)] px-4 py-2.5">
                <CalendarDays className="h-4 w-4 text-slate-500" />
                <span>{t("ppt_generator.dashboard.card.created", { date: createdDateLabel })}</span>
              </div>
            </div>
          </div>
        </div>
      </article>

      {showDeleteDialog && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 px-4 backdrop-blur-[3px]"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (isDeleting) return;
            setShowDeleteDialog(false);
          }}
        >
          <div
            className="relative w-full max-w-[420px] overflow-hidden rounded-[28px] border border-white/70 bg-[linear-gradient(180deg,#FFFFFF_0%,#FBFBFD_100%)] shadow-[0_40px_90px_rgba(15,23,42,0.22)]"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
          >
            <div className="flex flex-col items-start gap-4 p-6 pb-5">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-red-50">
                <AlertTriangle className="h-5 w-5 text-red-500" />
              </div>
              <div className="space-y-2">
                <h3 className="text-lg font-semibold text-[#101828]">{t("ppt_generator.dashboard.card.delete.title")}</h3>
                <p className="text-sm leading-6 text-slate-600">
                  {t("ppt_generator.dashboard.card.delete.body", {
                    title: title || t("ppt_generator.dashboard.card.untitled"),
                  })}
                </p>
              </div>
            </div>
            <div className="flex flex-col-reverse gap-3 border-t border-slate-100 bg-slate-50/70 p-4 sm:flex-row sm:justify-end">
              <button
                onClick={() => setShowDeleteDialog(false)}
                disabled={isDeleting}
                className="inline-flex h-11 items-center justify-center rounded-full border border-slate-200 bg-white px-5 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {t("ppt_generator.dashboard.card.delete.cancel")}
              </button>
              <button
                onClick={() => void handleDelete()}
                disabled={isDeleting}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-[#B42318] px-5 text-sm font-semibold text-white transition hover:bg-[#912018] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isDeleting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {t("ppt_generator.dashboard.card.delete.deleting")}
                  </>
                ) : (
                  <>
                    <Trash2 className="h-4 w-4" />
                    {t("ppt_generator.dashboard.card.delete.confirm")}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};


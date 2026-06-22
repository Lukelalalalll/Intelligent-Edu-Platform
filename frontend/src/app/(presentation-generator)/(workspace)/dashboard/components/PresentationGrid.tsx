import React from "react";
import Link from "@/presenton/shims/next-link";
import { AlertCircle, ArrowRight, RefreshCcw } from "lucide-react";
import { PresentationCard } from "./PresentationCard";
import { EmptyState } from "./EmptyState";
import { PresentationHistoryGroup } from "./dashboardUtils";

interface PresentationGridProps {
  groups: PresentationHistoryGroup[];
  isLoading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  onCreatePresentationClick?: () => void;
  onPresentationDeleted?: (presentationId: string) => void;
}

const shimmerCardClassName =
  "overflow-hidden rounded-[26px] border border-[rgba(15,23,42,0.08)] bg-[linear-gradient(180deg,rgba(249,252,250,0.98)_0%,rgba(255,255,255,0.98)_100%)] shadow-[0_20px_40px_-26px_rgba(15,23,42,0.24)]";

const DeckShimmerCard = () => (
  <div className={`${shimmerCardClassName} animate-pulse`}>
    <div className="relative aspect-[16/11] overflow-hidden border-b border-[rgba(15,23,42,0.08)] bg-[linear-gradient(135deg,rgba(232,245,238,0.95)_0%,rgba(248,250,252,0.98)_80%)] p-4">
      <div className="absolute inset-x-4 top-4 h-5 w-24 rounded-full bg-white/60" />
      <div className="absolute bottom-4 left-4 right-4 top-[54px] rounded-[18px] border border-white/70 bg-white/75 shadow-[inset_0_1px_0_rgba(255,255,255,0.85)]" />
    </div>
    <div className="space-y-4 px-5 py-5">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          <div className="h-4 w-36 rounded-full bg-slate-200" />
          <div className="h-3 w-24 rounded-full bg-slate-200" />
        </div>
        <div className="h-9 w-9 rounded-full bg-slate-200" />
      </div>
      <div className="flex flex-wrap gap-3">
        <div className="h-10 w-32 rounded-full bg-slate-100" />
        <div className="h-10 w-32 rounded-full bg-slate-100" />
      </div>
    </div>
  </div>
);

const ErrorState = ({ error, onRetry }: { error: string; onRetry?: () => void }) => (
  <div className="rounded-[26px] border border-[#F1D0D0] bg-[linear-gradient(180deg,rgba(255,249,248,0.98)_0%,rgba(255,255,255,0.98)_100%)] p-6 shadow-[0_18px_36px_-20px_rgba(127,29,29,0.12)] sm:p-7">
    <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
      <div className="flex items-start gap-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#FEE4E2] text-[#B42318]">
          <AlertCircle className="h-5 w-5" />
        </div>
        <div className="space-y-2">
          <h3 className="text-lg font-semibold text-[#101828]">Unable to load deck history</h3>
          <p className="max-w-2xl text-sm leading-6 text-slate-600">{error}</p>
        </div>
      </div>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex h-11 items-center justify-center gap-2 rounded-full border border-[rgba(15,23,42,0.08)] bg-white px-5 text-sm font-semibold text-[#101828] transition hover:-translate-y-0.5 hover:border-[rgba(0,123,85,0.18)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(0,123,85,0.28)]"
        >
          <RefreshCcw className="h-4 w-4" />
          Try again
        </button>
      ) : null}
    </div>
  </div>
);

export const PresentationGrid = ({
  groups,
  isLoading = false,
  error = null,
  onRetry,
  onCreatePresentationClick,
  onPresentationDeleted,
}: PresentationGridProps) => {
  if (isLoading) {
    return (
      <div className="space-y-8">
        {[...Array(2)].map((_, groupIndex) => (
          <section key={groupIndex} className="space-y-4">
            <div className="space-y-2">
              <div className="h-4 w-36 rounded-full bg-slate-200" />
              <div className="h-3 w-72 rounded-full bg-slate-100" />
            </div>
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              {[...Array(4)].map((_, cardIndex) => (
                <DeckShimmerCard key={`${groupIndex}-${cardIndex}`} />
              ))}
            </div>
          </section>
        ))}
      </div>
    );
  }

  if (error) {
    return <ErrorState error={error} onRetry={onRetry} />;
  }

  if (!groups.length) {
    return <EmptyState onCreatePresentationClick={onCreatePresentationClick} />;
  }

  return (
    <div className="space-y-9">
      {groups.map((group) => (
        <section key={group.key} className="space-y-5">
          <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
            <div>
              <h3 className="text-lg font-semibold text-[#101828]">{group.title}</h3>
              <p className="text-sm leading-6 text-slate-600">{group.description}</p>
            </div>
            <div className="inline-flex items-center gap-2 rounded-full border border-[rgba(15,23,42,0.08)] bg-[rgba(248,250,252,0.92)] px-3 py-1 text-xs font-medium uppercase tracking-[0.16em] text-slate-500">
              <span>{group.items.length}</span>
              <span>deck{group.items.length === 1 ? "" : "s"}</span>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {group.items.map((presentation) => (
              <PresentationCard
                key={presentation.id}
                presentation={presentation}
                onDeleted={onPresentationDeleted}
              />
            ))}
          </div>
        </section>
      ))}

      <div className="flex flex-col gap-3 rounded-[24px] border border-dashed border-[rgba(15,23,42,0.12)] bg-[rgba(247,251,249,0.86)] px-5 py-4 text-sm text-slate-600 sm:flex-row sm:items-center sm:justify-between">
        <span>Need a fresh starting point for the next story?</span>
        {onCreatePresentationClick ? (
          <Link
            href="/upload"
            onClick={onCreatePresentationClick}
            className="inline-flex items-center gap-2 font-semibold text-[#007b55] transition hover:text-[#0b6b4b] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(0,123,85,0.24)]"
          >
            <span>Create another presentation</span>
            <ArrowRight className="h-4 w-4" />
          </Link>
        ) : null}
      </div>
    </div>
  );
};

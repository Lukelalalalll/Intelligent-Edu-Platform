import React from "react";
import Link from "@/ppt_generator/shims/next-link";
import { ArrowRight, LayoutTemplate, Sparkles } from "lucide-react";

export const EmptyState = ({
  onCreatePresentationClick,
}: {
  onCreatePresentationClick?: () => void;
}) => {
  return (
    <div className="overflow-hidden rounded-[26px] border border-dashed border-[rgba(15,23,42,0.12)] bg-[linear-gradient(180deg,rgba(246,250,248,0.98)_0%,rgba(255,255,255,0.98)_100%)] p-6 shadow-[0_22px_36px_-26px_rgba(15,23,42,0.2)] sm:p-8">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="max-w-2xl space-y-4">
          <div className="inline-flex items-center gap-2 rounded-full border border-[rgba(0,123,85,0.16)] bg-[rgba(0,123,85,0.08)] px-3 py-1 text-xs font-medium uppercase tracking-[0.18em] text-[#0b6b4b]">
            <Sparkles className="h-3.5 w-3.5" />
            Ready for the first deck
          </div>
          <div className="space-y-3">
            <h3 className="font-syne text-[28px] font-normal leading-[1.08] text-[#101828]">
              You don&apos;t have any presentations yet.
            </h3>
            <p className="text-[15px] leading-7 text-slate-600">
              Start a new PPT Generator workflow from a prompt or source file, then every finished
              deck will show up here as part of your reusable history.
            </p>
          </div>
          <div className="flex flex-wrap gap-3 text-sm text-slate-600">
            <div className="inline-flex items-center gap-2 rounded-full border border-[rgba(15,23,42,0.08)] bg-white px-3 py-2">
              <LayoutTemplate className="h-4 w-4 text-[#007b55]" />
              Outline-first workflow
            </div>
            <div className="inline-flex items-center gap-2 rounded-full border border-[rgba(15,23,42,0.08)] bg-white px-3 py-2">
              <Sparkles className="h-4 w-4 text-[#0b6b4b]" />
              Saved model settings
            </div>
          </div>
        </div>

        <Link
          href="/upload"
          onClick={onCreatePresentationClick}
          className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-[linear-gradient(135deg,#007b55_0%,#0b6b4b_100%)] px-5 text-sm font-semibold text-white shadow-[0_16px_30px_-18px_rgba(0,123,85,0.5)] transition hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(0,123,85,0.22)] focus-visible:ring-offset-2"
        >
          <span>Create Presentation</span>
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </div>
  );
};


import React from "react";

const navPill = "h-10 rounded-full bg-slate-100";
const shimmerCardClassName =
  "overflow-hidden rounded-[26px] border border-[#E6E8F0] bg-[linear-gradient(180deg,#F8FBFF_0%,#FFFFFF_100%)] shadow-[0_18px_45px_rgba(15,23,42,0.06)]";

const SummarySkeleton = () => (
  <div className="rounded-[24px] border border-white/70 bg-white/78 px-4 py-4 shadow-[0_20px_45px_rgba(15,23,42,0.08)] backdrop-blur">
    <div className="h-3 w-20 rounded-full bg-slate-200" />
    <div className="mt-3 h-6 w-28 rounded-full bg-slate-200" />
  </div>
);

const HistoryCardSkeleton = () => (
  <div className={`${shimmerCardClassName} animate-pulse`}>
    <div className="relative aspect-[16/11] overflow-hidden border-b border-[#E8ECF4] bg-[linear-gradient(135deg,#EEF2FF_0%,#F8FAFC_80%)] p-4">
      <div className="absolute inset-x-4 top-4 h-5 w-24 rounded-full bg-white/60" />
      <div className="absolute left-4 right-4 top-[54px] bottom-4 rounded-[18px] border border-white/70 bg-white/75" />
    </div>
    <div className="space-y-4 px-5 py-5">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          <div className="h-4 w-36 rounded-full bg-slate-200" />
          <div className="h-3 w-24 rounded-full bg-slate-200" />
        </div>
        <div className="h-9 w-9 rounded-full bg-slate-200" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="h-14 rounded-2xl bg-slate-100" />
        <div className="h-14 rounded-2xl bg-slate-100" />
      </div>
      <div className="h-10 rounded-full bg-slate-100" />
    </div>
  </div>
);

const Loading = () => {
  return (
    <div className="relative min-h-[calc(100dvh-var(--nav-height,60px)-6rem)] w-full bg-[radial-gradient(circle_at_top_left,_rgba(238,242,255,0.95),_rgba(255,255,255,0.98)_42%,_rgba(248,250,252,1)_100%)] pb-12">
      <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-8 px-3 pt-4 sm:px-4 lg:px-6">
        <div className="rounded-[28px] border border-white/65 bg-[rgba(248,250,252,0.86)] px-4 py-4 shadow-[0_20px_55px_rgba(15,23,42,0.06)] backdrop-blur-xl sm:px-6">
          <div className="space-y-5 animate-pulse">
            <div className="space-y-3">
              <div className="h-8 w-56 rounded-full bg-slate-200" />
              <div className="h-4 w-[min(100%,680px)] rounded-full bg-slate-100" />
            </div>
            <div className="flex flex-wrap gap-2">
              <div className={`${navPill} w-[132px]`} />
              <div className={`${navPill} w-[124px]`} />
              <div className={`${navPill} w-[106px]`} />
            </div>
          </div>
        </div>

        <section className="overflow-hidden rounded-[30px] border border-white/70 bg-[linear-gradient(135deg,rgba(255,255,255,0.96),rgba(244,247,255,0.92))] px-5 py-6 shadow-[0_28px_80px_rgba(15,23,42,0.08)] sm:px-6 lg:px-8 lg:py-8">
          <div className="animate-pulse space-y-6">
            <div className="h-6 w-32 rounded-full bg-slate-100" />
            <div className="space-y-3">
              <div className="h-9 w-[min(100%,560px)] rounded-full bg-slate-200" />
              <div className="h-4 w-[min(100%,640px)] rounded-full bg-slate-100" />
              <div className="h-4 w-[min(100%,520px)] rounded-full bg-slate-100" />
            </div>
            <div className="h-11 w-52 rounded-full bg-slate-200" />
            <div className="grid gap-3 sm:grid-cols-3">
              {[...Array(3)].map((_, index) => (
                <SummarySkeleton key={index} />
              ))}
            </div>
          </div>
        </section>

        <section className="rounded-[30px] border border-white/70 bg-white/78 px-5 py-6 shadow-[0_24px_70px_rgba(15,23,42,0.07)] backdrop-blur sm:px-6 lg:px-8 lg:py-8">
          <div className="animate-pulse space-y-6">
            <div className="flex flex-col gap-5 border-b border-slate-200/80 pb-6 lg:flex-row lg:items-end lg:justify-between">
              <div className="space-y-3">
                <div className="h-6 w-32 rounded-full bg-slate-100" />
                <div className="h-8 w-56 rounded-full bg-slate-200" />
                <div className="h-4 w-[min(100%,620px)] rounded-full bg-slate-100" />
              </div>
              <div className="space-y-4 lg:min-w-[520px]">
                <div className="grid gap-3 sm:grid-cols-3">
                  {[...Array(3)].map((_, index) => (
                    <div
                      key={index}
                      className="rounded-2xl border border-slate-200/80 bg-slate-50/80 px-4 py-3"
                    >
                      <div className="h-3 w-20 rounded-full bg-slate-200" />
                      <div className="mt-2 h-4 w-24 rounded-full bg-slate-100" />
                    </div>
                  ))}
                </div>
                <div className="inline-flex gap-2 rounded-full border border-slate-200 bg-slate-50/80 p-1">
                  <div className="h-10 w-28 rounded-full bg-slate-200" />
                  <div className="h-10 w-28 rounded-full bg-slate-100" />
                </div>
              </div>
            </div>

            <div className="space-y-8">
              {[...Array(2)].map((_, groupIndex) => (
                <section key={groupIndex} className="space-y-4">
                  <div className="space-y-2">
                    <div className="h-4 w-36 rounded-full bg-slate-200" />
                    <div className="h-3 w-72 rounded-full bg-slate-100" />
                  </div>
                  <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                    {[...Array(4)].map((_, cardIndex) => (
                      <HistoryCardSkeleton key={`${groupIndex}-${cardIndex}`} />
                    ))}
                  </div>
                </section>
              ))}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};

export default Loading;


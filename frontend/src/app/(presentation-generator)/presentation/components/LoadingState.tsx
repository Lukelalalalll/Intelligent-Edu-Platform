import React from "react";
import { Loader2 } from "lucide-react";

type LoadingStateProps = {
  statusText?: string;
  detailText?: string;
  waitingForFirstContent?: boolean;
};

const LoadingState: React.FC<LoadingStateProps> = ({
  statusText = "Creating Your Presentation",
  detailText = "Preparing the first slides.",
  waitingForFirstContent = false,
}) => {
  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-white/70 backdrop-blur-[2px]">
      <div className="mx-6 flex max-w-[420px] flex-col items-center rounded-2xl border border-gray-200 bg-white/95 px-6 py-5 text-center shadow-lg">
        <Loader2 className="mb-4 h-8 w-8 animate-spin text-[#5146E5]" />
        <p className="text-base font-semibold text-[#191919]">{statusText}</p>
        <p className="mt-2 text-sm leading-6 text-[#666666]">{detailText}</p>
        {waitingForFirstContent ? (
          <p className="mt-3 text-xs font-medium uppercase tracking-[0.08em] text-[#5146E5]">
            Waiting for first slide content
          </p>
        ) : null}
      </div>
    </div>
  );
};

export default LoadingState;


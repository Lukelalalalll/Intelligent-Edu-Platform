"use client";

import { ArrowLeft } from "lucide-react";
import { useRouter } from "next/navigation";

import PresentationHeaderTitle from "./PresentationHeaderTitle";

type PresentationHeaderInfoProps = {
  presentationId: string;
};

const PROJECT_UI_FONT_STACK =
  '"Segoe UI", -apple-system, BlinkMacSystemFont, Roboto, sans-serif';

const PresentationHeaderInfo = ({
  presentationId,
}: PresentationHeaderInfoProps) => {
  const router = useRouter();

  const handleBack = () => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
      return;
    }

    router.push("/dashboard");
  };

  return (
    <div className="flex min-w-0 items-center gap-3">
      <button
        type="button"
        onClick={handleBack}
        className="inline-flex h-10 shrink-0 items-center gap-2 rounded-full border border-[#E7E8EC] bg-white px-3 text-sm font-medium text-[#101323] shadow-[0_8px_18px_rgba(15,23,42,0.05)] transition-colors hover:bg-[#F8F8FB] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5141e5] focus-visible:ring-offset-2"
        style={{ fontFamily: PROJECT_UI_FONT_STACK }}
        aria-label="Back"
      >
        <ArrowLeft className="h-4 w-4" />
        <span className="pr-0.5">Back</span>
      </button>
      <PresentationHeaderTitle presentationId={presentationId} />
    </div>
  );
};

export default PresentationHeaderInfo;

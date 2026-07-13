"use client";

import PresentationHeaderActions from "./presentation-header/PresentationHeaderActions";
import PresentationHeaderInfo from "./presentation-header/PresentationHeaderInfo";

type PresentationHeaderProps = {
  presentation_id: string;
  isPresentationSaving: boolean;
  currentSlide?: number;
};

const PresentationHeader = ({
  presentation_id,
  isPresentationSaving,
  currentSlide,
}: PresentationHeaderProps) => {
  return (
    <div className="sticky top-0 z-50 flex items-center justify-between gap-4 bg-white px-4 py-[18px] font-syne shadow-sm">
      <PresentationHeaderInfo presentationId={presentation_id} />
      <PresentationHeaderActions
        presentationId={presentation_id}
        isPresentationSaving={isPresentationSaving}
        currentSlide={currentSlide}
      />
    </div>
  );
};

export default PresentationHeader;


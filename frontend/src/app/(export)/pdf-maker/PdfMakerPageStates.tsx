import React from "react";

import SlideScale from "@/app/(presentation-generator)/components/PresentationRender";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertCircle } from "lucide-react";

type PdfMakerErrorStateProps = {
  onRetry: () => void;
};

export const PdfMakerErrorState = ({ onRetry }: PdfMakerErrorStateProps) => (
  <div className="flex flex-col items-center justify-center h-screen bg-gray-100">
    <div
      className="bg-white border border-red-300 text-red-700 px-6 py-8 rounded-lg shadow-lg flex flex-col items-center"
      role="alert"
    >
      <AlertCircle className="w-16 h-16 mb-4 text-red-500" />
      <strong className="font-bold text-4xl mb-2">Oops!</strong>
      <p className="block text-2xl py-2">
        We encountered an issue loading your presentation.
      </p>
      <p className="text-lg py-2">
        Please check your internet connection or try again later.
      </p>
      <Button
        className="mt-4 bg-red-500 text-white hover:bg-red-600 focus:ring-4 focus:ring-red-300"
        onClick={onRetry}
      >
        Retry
      </Button>
    </div>
  </div>
);

type ExportRuntimeAlertProps = {
  messages: string[];
};

export const ExportRuntimeAlert = ({ messages }: ExportRuntimeAlertProps) => {
  if (messages.length === 0) {
    return null;
  }

  return (
    <div className="export-runtime-alert mx-auto w-full max-w-[1280px] px-4 py-4">
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        {messages.map((message) => (
          <p key={message}>{message}</p>
        ))}
      </div>
    </div>
  );
};

export const SlidesLoadingSkeleton = () => (
  <div className="relative m-0 flex w-full justify-center p-0">
    <div className="m-0 p-0">
      {Array.from({ length: 2 }).map((_, index) => (
        <Skeleton
          key={index}
          className="m-0 h-[720px] w-[1280px] bg-gray-400 p-0"
        />
      ))}
    </div>
  </div>
);

type ExportSlidesStackProps = {
  presentationData: any;
  slides: any[];
};

export const ExportSlidesStack = ({
  presentationData,
  slides,
}: ExportSlidesStackProps) => (
  <div className="slides-export-stack font-inter">
    {slides.map((slide: any, index: number) => (
      <div
        key={`${slide.type}-${index}-${slide.index}`}
        id={`slide-${slide.index}`}
        className="main-slide relative flex items-center justify-center"
        data-speaker-note={slide.speaker_note ?? ""}
      >
        <div
          className="slide-export-inner group font-syne"
          data-layout={slide.layout}
          data-group={slide.layout_group}
        >
          <SlideScale
            slide={slide}
            theme={presentationData?.theme ?? null}
            isEditMode={false}
            fixedSize
          />
        </div>
      </div>
    ))}
  </div>
);

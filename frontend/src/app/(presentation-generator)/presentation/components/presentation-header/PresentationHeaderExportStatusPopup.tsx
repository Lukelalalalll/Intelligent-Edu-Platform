"use client";

import { createPortal } from "react-dom";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";

import type { ExportFormat } from "./presentationHeader.utils";

const PROJECT_UI_FONT_STACK =
  '"Segoe UI", -apple-system, BlinkMacSystemFont, Roboto, sans-serif';

type PresentationHeaderExportStatusPopupProps = {
  format: ExportFormat;
  progress: number;
  stageLabel: string;
  description: string;
  onCancel: () => void;
};

const PresentationHeaderExportStatusPopup = ({
  format,
  progress,
  stageLabel,
  description,
  onCancel,
}: PresentationHeaderExportStatusPopupProps) => {
  if (typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <div className="fixed inset-0 z-[140] flex items-center justify-center bg-[rgba(15,23,42,0.24)] px-4 backdrop-blur-md">
      <div
        role="dialog"
        aria-modal="true"
        aria-live="polite"
        className="w-full max-w-[26rem] rounded-[30px] border p-5 shadow-[0_28px_80px_rgba(15,23,42,0.22)] backdrop-blur-xl"
        style={{
          fontFamily: PROJECT_UI_FONT_STACK,
          background: "rgba(255, 255, 255, 0.985)",
          borderColor: "rgba(226, 232, 240, 0.96)",
        }}
      >
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#F4EEFF] text-[#7C51F8]">
            <Loader2 className="h-4 w-4 animate-spin" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-semibold leading-5 text-[#111827]">
              {`Exporting ${format.toUpperCase()}`}
            </p>
            <p className="mt-1 text-[13px] leading-5 text-[#344054]">
              {description}
            </p>
          </div>
        </div>

        <div className="mt-4">
          <div className="mb-2 flex items-center justify-between gap-3">
            <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#7C51F8]">
              {stageLabel}
            </span>
            <span className="text-xs font-medium text-[#344054]">
              {`${Math.round(progress)}%`}
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-[#E5E7EB]">
            <div
              className="h-full rounded-full bg-gradient-to-r from-[#8A5CF7] via-[#6F50F6] to-[#5146E5] transition-[width] duration-300 ease-out"
              style={{ width: `${Math.max(0, Math.min(progress, 100))}%` }}
            />
          </div>
        </div>

        <div className="mt-4 flex justify-end">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onCancel}
            className="h-9 rounded-full border-[#E4E7EC] bg-white px-4 text-xs font-semibold text-[#344054] shadow-none hover:bg-[#F9FAFB]"
            style={{ fontFamily: PROJECT_UI_FONT_STACK }}
          >
            Cancel
          </Button>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default PresentationHeaderExportStatusPopup;

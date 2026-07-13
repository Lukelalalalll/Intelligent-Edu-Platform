"use client";

import { useMemo, useState } from "react";
import { ArrowRightFromLine, ArrowUpRight, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

type PresentationHeaderExportMenuProps = {
  isExporting: boolean;
  isDisabled: boolean;
  onExportPdf: () => void;
  onExportPptx: () => void;
};

type ExportOption = {
  key: "pdf" | "pptx";
  label: "PDF" | "PPTX";
  onSelect: () => void;
};

const PresentationHeaderExportOptions = ({
  mobile,
  options,
}: {
  mobile: boolean;
  options: ExportOption[];
}) => {
  return (
    <div
      className={`rounded-[18px] p-5 max-md:mt-4 ${mobile ? "" : "bg-white"}`}
    >
      <p className="text-sm font-medium text-[#19001F]">Export as</p>
      <div className="my-[18px] h-[1px] bg-[#E8E8E8]" />
      <div className="space-y-3">
        {options.map((option) => (
          <Button
            key={option.key}
            onClick={option.onSelect}
            variant="ghost"
            className={`w-full justify-start px-0 text-xs text-black hover:bg-transparent ${
              mobile
                ? "rounded-lg border-none bg-white py-6"
                : option.key === "pdf"
                  ? "rounded-none"
                  : ""
            }`}
          >
            {option.label}
            <ArrowUpRight className="h-3.5 w-3.5" />
          </Button>
        ))}
      </div>
    </div>
  );
};

const PresentationHeaderExportMenu = ({
  isExporting,
  isDisabled,
  onExportPdf,
  onExportPptx,
}: PresentationHeaderExportMenuProps) => {
  const [open, setOpen] = useState(false);

  const options = useMemo<ExportOption[]>(
    () => [
      {
        key: "pdf",
        label: "PDF",
        onSelect: () => {
          onExportPdf();
          setOpen(false);
        },
      },
      {
        key: "pptx",
        label: "PPTX",
        onSelect: () => {
          onExportPptx();
          setOpen(false);
        },
      },
    ],
    [onExportPdf, onExportPptx]
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className="flex items-center gap-[7px] rounded-[53px] px-[18px] py-[11px] text-sm font-semibold text-[#101323]"
          style={{
            background:
              "linear-gradient(270deg, #D5CAFC 2.4%, #E3D2EB 27.88%, #F4DCD3 69.23%, #FDE4C2 100%)",
          }}
          disabled={isDisabled}
        >
          {isExporting ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            "Export"
          )}{" "}
          <ArrowRightFromLine className="h-3.5 w-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-[200px] space-y-2 rounded-[18px] p-0"
      >
        <PresentationHeaderExportOptions mobile={false} options={options} />
      </PopoverContent>
    </Popover>
  );
};

export default PresentationHeaderExportMenu;


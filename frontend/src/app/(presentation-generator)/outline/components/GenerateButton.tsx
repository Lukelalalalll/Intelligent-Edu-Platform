import React from "react";
import { Button } from "@/components/ui/button";
import { LoadingState } from "../types/index";
import { TemplateLayoutsWithSettings } from "@/app/presentation-templates/utils";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface GenerateButtonProps {
  loadingState: LoadingState;
  streamState: { isStreaming: boolean; isLoading: boolean };
  selectedTemplate: TemplateLayoutsWithSettings | string | null;
  onSubmit: () => void;
  className?: string;
}

const GenerateButton: React.FC<GenerateButtonProps> = ({
  loadingState,
  streamState,
  selectedTemplate,
  onSubmit,
  className,
}) => {
  const isDisabled =
    loadingState.isLoading || streamState.isLoading || streamState.isStreaming;

  const getButtonText = () => {
    if (loadingState.isLoading) return loadingState.message;
    if (streamState.isLoading || streamState.isStreaming) return "Loading...";
    if (!selectedTemplate) return "Select a Template";
    return "Generate Presentation";
  };

  return (
    <Button
      disabled={isDisabled}
      onClick={onSubmit}
      className={cn(
        "flex h-[54px] w-full items-center justify-center gap-1 rounded-full bg-[linear-gradient(135deg,#007b55_0%,#0b6b4b_52%,#0f9f6e_100%)] px-5 py-3 font-instrument_sans text-sm font-semibold text-white shadow-[0_18px_34px_-20px_rgba(0,123,85,0.48)] transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_24px_40px_-20px_rgba(0,123,85,0.42)] disabled:cursor-not-allowed disabled:opacity-55 disabled:hover:translate-y-0",
        className
      )}
    >
      {getButtonText()}
      <ChevronRight className="h-4 w-4" />
    </Button>
  );
};

export default GenerateButton;

import React, { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { MixpanelEvent, trackEvent } from "@/utils/mixpanel";
import { Check, ChevronUp } from "lucide-react";
import { TextProviderInputChange, TextProviderModelOption } from "./types";

interface TextProviderModelSelectProps {
  selectedProvider: string;
  currentModel: string;
  currentModelField: string;
  modelLabel: string;
  availableModels: TextProviderModelOption[];
  onInputChange: TextProviderInputChange;
}

const TextProviderModelSelect = ({
  selectedProvider,
  currentModel,
  currentModelField,
  modelLabel,
  availableModels,
  onInputChange,
}: TextProviderModelSelectProps) => {
  const [open, setOpen] = useState(false);

  const currentModelLabel = useMemo(() => {
    if (!currentModel) {
      return "Select a model";
    }

    const selectedModel = availableModels.find(
      (model) => model.value === currentModel
    );

    if (!selectedModel) {
      return currentModel;
    }

    if (selectedProvider === "ollama" && selectedModel.size) {
      return `${selectedModel.label} (${selectedModel.size})`;
    }

    return selectedModel.label;
  }, [availableModels, currentModel, selectedProvider]);

  if (!currentModelField) {
    return null;
  }

  return (
    <div>
      <label className="mb-3 block text-sm font-medium text-gray-700">
        {selectedProvider === "ollama"
          ? "Choose an Ollama model"
          : `Select ${modelLabel} Model`}
      </label>
      <div className="w-full">
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              role="combobox"
              aria-expanded={open}
              className="h-12 w-full justify-between rounded-lg border border-gray-300 px-4 py-4 outline-none transition-colors hover:border-gray-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
            >
              <span className="truncate text-sm font-medium text-gray-900">
                {currentModelLabel}
              </span>
              <ChevronUp className="h-4 w-4 text-gray-500" />
            </Button>
          </PopoverTrigger>
          <PopoverContent
            className="p-0"
            align="start"
            style={{ width: "var(--radix-popover-trigger-width)" }}
          >
            <Command>
              <CommandInput placeholder="Search models..." />
              <CommandList>
                <CommandEmpty>No model found.</CommandEmpty>
                <CommandGroup>
                  {availableModels.map((model) => (
                    <CommandItem
                      key={model.value}
                      value={model.value}
                      onSelect={() => {
                        trackEvent(MixpanelEvent.Settings_Model_Selected, {
                          provider: selectedProvider,
                          model: model.value,
                        });
                        onInputChange(model.value, currentModelField);
                        setOpen(false);
                      }}
                    >
                      <Check
                        className={cn(
                          "mr-2 h-4 w-4",
                          currentModel === model.value
                            ? "opacity-100"
                            : "opacity-0"
                        )}
                      />
                      <div className="flex items-center gap-3">
                        <div className="flex flex-1 flex-col space-y-1">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-sm font-medium text-gray-900">
                              {model.label}
                            </span>
                            {selectedProvider === "ollama" && model.size ? (
                              <span className="text-xs font-medium text-gray-500">
                                {model.size}
                              </span>
                            ) : null}
                            {selectedProvider === "ollama" ? (
                              <span
                                title={
                                  model.tested === false
                                    ? "Experimental"
                                    : "Recommended"
                                }
                                aria-label={
                                  model.tested === false
                                    ? "Experimental"
                                    : "Recommended"
                                }
                                className={cn(
                                  "inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border",
                                  model.tested === false
                                    ? "border-amber-200 bg-amber-50 text-amber-700"
                                    : "border-green-200 bg-green-50 text-green-700"
                                )}
                              >
                                <Check className="h-3 w-3" aria-hidden="true" />
                              </span>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
};

export default TextProviderModelSelect;

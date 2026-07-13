import React, { useState } from "react";
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
import { LLM_PROVIDERS } from "@/utils/providerConstants";
import { getDefaultOllamaUrl } from "@/utils/providerUtils";
import { Check, ChevronUp } from "lucide-react";
import { TextProviderInputChange } from "./types";

interface TextProviderProviderSelectProps {
  providerValue?: string;
  currentOllamaUrl: string;
  onInputChange: TextProviderInputChange;
}

const TextProviderProviderSelect = ({
  providerValue,
  currentOllamaUrl,
  onInputChange,
}: TextProviderProviderSelectProps) => {
  const [open, setOpen] = useState(false);

  return (
    <div className="flex flex-col justify-start ">
      <label className="mb-2 block text-sm font-medium text-gray-700">
        Select Text Provider
      </label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="h-12 w-[222px] justify-between rounded-lg border border-gray-300 px-4 py-4 outline-none transition-colors hover:border-gray-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
          >
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium text-gray-900">
                {providerValue
                  ? LLM_PROVIDERS[providerValue]?.label || providerValue
                  : "Select text provider"}
              </span>
            </div>
            <ChevronUp className="h-4 w-4 text-gray-500" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="p-0" align="start" style={{ width: "300px" }}>
          <Command>
            <CommandInput placeholder="Search provider..." />
            <CommandList>
              <CommandEmpty>No provider found.</CommandEmpty>
              <CommandGroup>
                {Object.values(LLM_PROVIDERS).map((provider) => (
                  <CommandItem
                    key={provider.value}
                    value={provider.value}
                    onSelect={(value) => {
                      trackEvent(MixpanelEvent.Settings_Provider_Selected, {
                        section: "text_provider",
                        provider: value,
                      });
                      if (value === "ollama" && !(currentOllamaUrl || "").trim()) {
                        onInputChange(getDefaultOllamaUrl(), "OLLAMA_URL");
                      }
                      onInputChange(value, "LLM");
                      setOpen(false);
                    }}
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4",
                        providerValue === provider.value
                          ? "opacity-100"
                          : "opacity-0"
                      )}
                    />
                    <div className="flex items-center gap-3">
                      <div className="flex flex-1 flex-col space-y-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-medium capitalize text-gray-900">
                            {provider.label}
                          </span>
                        </div>
                        <span className="text-xs leading-relaxed text-gray-600">
                          {provider.description}
                        </span>
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
  );
};

export default TextProviderProviderSelect;


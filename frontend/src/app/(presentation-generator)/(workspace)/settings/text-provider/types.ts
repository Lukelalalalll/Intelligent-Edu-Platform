import { LLMConfig } from "@/types/llm_config";

export interface TextProviderProps {
  onInputChange: (value: string | boolean, field: string) => void;
  llmConfig: LLMConfig;
}

export interface TextProviderModelOption {
  value: string;
  label: string;
  size?: string;
  tested?: boolean;
}

export type TextProviderField = keyof LLMConfig & string;
export type TextProviderInputChange = TextProviderProps["onInputChange"];

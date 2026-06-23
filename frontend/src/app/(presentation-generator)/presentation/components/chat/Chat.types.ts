export type AssistantActivity = {
  id: string;
  label: string;
  kind?: string;
  round?: number;
  tool?: string;
  state: "running" | "success" | "error" | "info";
};

export type ChatMessage = {
  id: string;
  role: "user" | "assistant" | "error";
  content: string;
  toolCalls?: string[];
  activity?: AssistantActivity[];
};

export type AgentSlideFocusPayload = {
  slideIndex: number;
  eventId: string;
  tool?: string;
  status?: string;
  isMutatingTool: boolean;
};

export type ChatProps = {
  presentationId: string;
  currentSlide?: number;
  onPresentationChanged?: () => Promise<void> | void;
  onChatMutationStateChange?: (isMutating: boolean) => void;
  onAgentSlideFocus?: (focus: AgentSlideFocusPayload) => void;
  onChatSendingStateChange?: (isSending: boolean) => void;
  onFollowModeChange?: (isEnabled: boolean) => void;
};

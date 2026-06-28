import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { notify } from "@/components/ui/sonner";
import {
  PresentationChatApi,
  type ChatStreamTrace,
} from "../../../../services/api/chat";
import type {
  AssistantActivity,
  ChatMessage,
  ChatProps,
} from "../Chat.types";
import {
  buildBackendMessage,
  conversationStorageKey,
  createMessageId,
  formatTraceActivity,
  hasPresentationMutationToolCall,
  inferStatusState,
  isAbortError,
  stripBackendContextFromUserMessage,
} from "../Chat.utils";
import { MUTATING_TOOLS } from "../Chat.constants";
import { useAgentSlideFollow } from "./useAgentSlideFollow";
import { useBufferedMessages } from "./useBufferedMessages";

export const usePresentationChat = ({
  presentationId,
  currentSlide,
  onPresentationChanged,
  onChatMutationStateChange,
  onAgentSlideFocus,
  onChatSendingStateChange,
  onFollowModeChange,
}: ChatProps) => {
  const [input, setInput] = useState("");
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [isFollowAgentEnabled, setIsFollowAgentEnabled] = useState(true);
  const [activeMutationToolCount, setActiveMutationToolCount] = useState(0);
  const [activeAssistantMessageId, setActiveAssistantMessageId] = useState<
    string | null
  >(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [expandedActivityByMessage, setExpandedActivityByMessage] = useState<
    Record<string, boolean>
  >({});

  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const refreshInFlightRef = useRef(false);
  const refreshQueuedRef = useRef(false);
  const didIncrementalRefreshRef = useRef(false);

  const {
    messages,
    setMessagesImmediate,
    queueMessageUpdate,
    flushQueuedMessageUpdates,
  } = useBufferedMessages();
  const { maybeFollowAgentSlide, resetFollowState } = useAgentSlideFollow({
    onAgentSlideFocus,
  });

  useEffect(() => {
    let cancelled = false;

    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    setMessagesImmediate([]);
    setInput("");
    setConversationId(null);
    setIsSending(false);
    setActiveMutationToolCount(0);
    setActiveAssistantMessageId(null);
    setErrorMessage(null);
    setExpandedActivityByMessage({});

    if (!presentationId) {
      return;
    }

    setIsHistoryLoading(true);

    const run = async () => {
      try {
        if (typeof sessionStorage === "undefined") {
          return;
        }

        const storageKey = conversationStorageKey(presentationId);
        let activeId = sessionStorage.getItem(storageKey) ?? null;
        if (!activeId) {
          const list = await PresentationChatApi.listConversations(presentationId);
          if (Array.isArray(list) && list.length > 0) {
            activeId = list[0]!.conversation_id;
            sessionStorage.setItem(storageKey, activeId);
          }
        }
        if (!activeId) {
          return;
        }

        const data = await PresentationChatApi.getHistory(
          presentationId,
          activeId
        );
        if (cancelled) {
          return;
        }

        setConversationId(activeId);
        const rows = Array.isArray(data?.messages) ? data.messages : [];
        setMessagesImmediate(
          rows.map((message) => ({
            id: createMessageId(),
            role:
              message.role === "assistant"
                ? "assistant"
                : message.role === "user"
                ? "user"
                : "user",
            content:
              message.role === "user"
                ? stripBackendContextFromUserMessage(message.content)
                : message.content,
          }))
        );
      } catch (error) {
        console.error("Failed to load chat history:", error);
        const detail =
          error instanceof Error
            ? error.message
            : "Could not load previous chat";
        notify.error("Could not load chat", detail);
      } finally {
        if (!cancelled) {
          setIsHistoryLoading(false);
        }
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [presentationId, setMessagesImmediate]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ block: "end" });
  }, [messages, isSending]);

  useEffect(() => {
    onChatMutationStateChange?.(activeMutationToolCount > 0);
  }, [activeMutationToolCount, onChatMutationStateChange]);

  useEffect(() => {
    onFollowModeChange?.(isFollowAgentEnabled);
  }, [isFollowAgentEnabled, onFollowModeChange]);

  useEffect(() => {
    onChatSendingStateChange?.(isSending);
    if (!isSending) {
      resetFollowState();
    }
  }, [isSending, onChatSendingStateChange, resetFollowState]);

  useEffect(
    () => () => {
      abortControllerRef.current?.abort();
    },
    []
  );

  const updateMutationToolActivity = useCallback(
    (tool: string | undefined, isActive: boolean) => {
      if (!tool || !MUTATING_TOOLS.has(tool)) {
        return;
      }

      setActiveMutationToolCount((previous) =>
        Math.max(0, previous + (isActive ? 1 : -1))
      );
    },
    []
  );

  const resetChat = useCallback(() => {
    setMessagesImmediate([]);
    setInput("");
    setConversationId(null);
    setActiveMutationToolCount(0);
    setErrorMessage(null);
    setExpandedActivityByMessage({});

    if (presentationId && typeof sessionStorage !== "undefined") {
      sessionStorage.removeItem(conversationStorageKey(presentationId));
    }

    inputRef.current?.focus();
  }, [presentationId, setMessagesImmediate]);

  const refreshPresentationIncrementally = useCallback(async () => {
    if (!onPresentationChanged) {
      return;
    }
    if (refreshInFlightRef.current) {
      refreshQueuedRef.current = true;
      return;
    }

    refreshInFlightRef.current = true;
    didIncrementalRefreshRef.current = true;
    try {
      await onPresentationChanged();
    } catch (error) {
      console.error(
        "Failed to refresh presentation after tool mutation:",
        error
      );
      notify.error("Refresh failed", "Slides were saved, but refresh failed.");
    } finally {
      refreshInFlightRef.current = false;
      if (refreshQueuedRef.current) {
        refreshQueuedRef.current = false;
        void refreshPresentationIncrementally();
      }
    }
  }, [onPresentationChanged]);

  const refreshPresentationIfNeeded = useCallback(
    async (toolCalls: string[]) => {
      if (
        !hasPresentationMutationToolCall(toolCalls) ||
        !onPresentationChanged ||
        didIncrementalRefreshRef.current
      ) {
        return;
      }

      try {
        await onPresentationChanged();
      } catch (error) {
        console.error("Failed to refresh presentation after chat update:", error);
        notify.error(
          "Refresh failed",
          "Chat completed, but slide refresh failed."
        );
      }
    },
    [onPresentationChanged]
  );

  const appendAssistantActivity = useCallback(
    (assistantMessageId: string, activity: Omit<AssistantActivity, "id">) => {
      const normalizedLabel = activity.label.trim();
      if (!normalizedLabel) {
        return;
      }

      queueMessageUpdate((previous) =>
        previous.map((message) => {
          if (message.id !== assistantMessageId) {
            return message;
          }

          const currentActivity = message.activity ?? [];
          const lastActivity = currentActivity[currentActivity.length - 1];
          if (
            lastActivity &&
            lastActivity.label === normalizedLabel &&
            lastActivity.state === activity.state
          ) {
            return message;
          }

          const settledActivity: AssistantActivity[] =
            lastActivity && lastActivity.state === "running"
              ? [
                  ...currentActivity.slice(0, -1),
                  {
                    ...lastActivity,
                    state:
                      activity.state === "error"
                        ? "error"
                        : ("success" as AssistantActivity["state"]),
                  },
                ]
              : currentActivity;

          const lastSettledActivity =
            settledActivity[settledActivity.length - 1];
          if (
            lastSettledActivity &&
            lastSettledActivity.label === normalizedLabel &&
            lastSettledActivity.state !== activity.state
          ) {
            return {
              ...message,
              activity: [
                ...settledActivity.slice(0, -1),
                {
                  ...lastSettledActivity,
                  ...activity,
                  label: normalizedLabel,
                  state: activity.state,
                },
              ],
            };
          }

          return {
            ...message,
            activity: [
              ...settledActivity,
              {
                id: createMessageId(),
                ...activity,
                label: normalizedLabel,
                state: activity.state,
              },
            ],
          };
        })
      );
    },
    [queueMessageUpdate]
  );

  const toggleActivityExpanded = useCallback((messageId: string) => {
    setExpandedActivityByMessage((previous) => ({
      ...previous,
      [messageId]: !previous[messageId],
    }));
  }, []);

  const stopStreaming = useCallback(() => {
    flushQueuedMessageUpdates();
    abortControllerRef.current?.abort();
  }, [flushQueuedMessageUpdates]);

  const submitMessage = useCallback(
    async (rawMessage: string) => {
      const trimmedMessage = rawMessage.trim();

      if (!trimmedMessage || isSending || isHistoryLoading) {
        return;
      }

      if (!presentationId) {
        notify.error(
          "Presentation not ready",
          "The presentation is not ready yet."
        );
        return;
      }

      const userMessage: ChatMessage = {
        id: createMessageId(),
        role: "user",
        content: trimmedMessage,
      };

      const assistantMessageId = createMessageId();
      setMessagesImmediate((previous) => [
        ...previous,
        userMessage,
        {
          id: assistantMessageId,
          role: "assistant",
          content: "",
          toolCalls: [],
          activity: [],
        },
      ]);
      setExpandedActivityByMessage((previous) => ({
        ...previous,
        [assistantMessageId]: false,
      }));
      setInput("");
      setErrorMessage(null);
      setIsSending(true);
      setActiveAssistantMessageId(assistantMessageId);
      didIncrementalRefreshRef.current = false;
      refreshQueuedRef.current = false;
      refreshInFlightRef.current = false;

      const streamAbortController = new AbortController();
      abortControllerRef.current = streamAbortController;

      try {
        const response = await PresentationChatApi.streamMessage(
          {
            presentation_id: presentationId,
            message: buildBackendMessage(trimmedMessage, currentSlide),
            conversation_id: conversationId ?? undefined,
          },
          {
            onChunk: (chunk) => {
              queueMessageUpdate((previous) =>
                previous.map((message) =>
                  message.id === assistantMessageId
                    ? {
                        ...message,
                        content: `${message.content}${chunk}`,
                      }
                    : message
                )
              );
            },
            onStatus: (status) => {
              appendAssistantActivity(assistantMessageId, {
                label: status,
                state: inferStatusState(status),
              });
            },
            onTrace: (trace: ChatStreamTrace) => {
              maybeFollowAgentSlide(trace);

              if (
                trace.status === "success" &&
                trace.tool &&
                MUTATING_TOOLS.has(trace.tool)
              ) {
                void refreshPresentationIncrementally();
              }
              if (trace.status === "start") {
                updateMutationToolActivity(trace.tool, true);
              } else if (
                trace.status === "success" ||
                trace.status === "error"
              ) {
                updateMutationToolActivity(trace.tool, false);
              }

              const traceActivity = formatTraceActivity(trace);
              if (!traceActivity) {
                return;
              }

              appendAssistantActivity(assistantMessageId, traceActivity);
            },
          },
          { signal: streamAbortController.signal }
        );

        setMessagesImmediate((previous) =>
          previous.map((message) =>
            message.id === assistantMessageId
              ? {
                  ...message,
                  content: response.response,
                  toolCalls: [],
                  activity: [],
                }
              : message
          )
        );
        setExpandedActivityByMessage((previous) => {
          const next = { ...previous };
          delete next[assistantMessageId];
          return next;
        });
        setConversationId((previous) => {
          const next =
            typeof response.conversation_id === "string"
              ? response.conversation_id
              : previous;
          if (next && presentationId && typeof sessionStorage !== "undefined") {
            sessionStorage.setItem(conversationStorageKey(presentationId), next);
          }
          return next;
        });

        await refreshPresentationIfNeeded(
          Array.isArray(response.tool_calls) ? response.tool_calls : []
        );
      } catch (error) {
        if (isAbortError(error)) {
          setMessagesImmediate((previous) =>
            previous.map((message) =>
              message.id === assistantMessageId
                ? {
                    ...message,
                    toolCalls: [],
                    activity: [],
                  }
                : message
            )
          );
          setExpandedActivityByMessage((previous) => {
            const next = { ...previous };
            delete next[assistantMessageId];
            return next;
          });
          return;
        }

        const message =
          error instanceof Error ? error.message : "Failed to send chat message";

        setMessagesImmediate((previous) => [
          ...previous.map((entry) =>
            entry.id === assistantMessageId
              ? {
                  ...entry,
                  toolCalls: [],
                  activity: [],
                }
              : entry
          ),
          {
            id: createMessageId(),
            role: "error",
            content: message,
          },
        ]);
        setExpandedActivityByMessage((previous) => {
          const next = { ...previous };
          delete next[assistantMessageId];
          return next;
        });
        setErrorMessage(message);
        notify.error("Chat error", message);
      } finally {
        setActiveMutationToolCount(0);
        if (abortControllerRef.current === streamAbortController) {
          abortControllerRef.current = null;
        }
        setActiveAssistantMessageId((current) =>
          current === assistantMessageId ? null : current
        );
        setIsSending(false);
      }
    },
    [
      appendAssistantActivity,
      conversationId,
      currentSlide,
      isHistoryLoading,
      isSending,
      maybeFollowAgentSlide,
      presentationId,
      queueMessageUpdate,
      refreshPresentationIfNeeded,
      refreshPresentationIncrementally,
      setMessagesImmediate,
      updateMutationToolActivity,
    ]
  );

  const handleSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      void submitMessage(input);
    },
    [input, submitMessage]
  );

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLTextAreaElement>) => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        void submitMessage(input);
      }
    },
    [input, submitMessage]
  );

  const applyPrompt = useCallback((prompt: string) => {
    setInput(prompt);
    setErrorMessage(null);
    inputRef.current?.focus();
  }, []);

  const toggleFollowAgentMode = useCallback(() => {
    setIsFollowAgentEnabled((previous) => !previous);
  }, []);

  return {
    activeAssistantMessageId,
    applyPrompt,
    errorMessage,
    expandedActivityByMessage,
    handleKeyDown,
    handleSubmit,
    input,
    inputRef,
    isFollowAgentEnabled,
    isHistoryLoading,
    isSending,
    messages,
    messagesEndRef,
    resetChat,
    setInput,
    stopStreaming,
    toggleActivityExpanded,
    toggleFollowAgentMode,
  };
};


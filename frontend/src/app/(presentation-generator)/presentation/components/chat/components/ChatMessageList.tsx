import type { RefObject } from "react";
import { ChevronDown, ChevronRight, Loader2 } from "lucide-react";
import MarkdownRenderer from "@/components/MarkDownRender";
import type { ChatMessage } from "../Chat.types";
import {
  getToolLabel,
  stripBackendContextFromUserMessage,
} from "../Chat.utils";
import AssistantMarker from "./AssistantMarker";
import ChatEmptyState from "./ChatEmptyState";

type ChatMessageListProps = {
  activeAssistantMessageId: string | null;
  expandedActivityByMessage: Record<string, boolean>;
  isHistoryLoading: boolean;
  isSending: boolean;
  messages: ChatMessage[];
  messagesEndRef: RefObject<HTMLDivElement>;
  onApplyPrompt: (prompt: string) => void;
  onToggleActivityExpanded: (messageId: string) => void;
};

const ChatMessageList = ({
  activeAssistantMessageId,
  expandedActivityByMessage,
  isHistoryLoading,
  isSending,
  messages,
  messagesEndRef,
  onApplyPrompt,
  onToggleActivityExpanded,
}: ChatMessageListProps) => (
  <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4 pt-9 hide-scrollbar">
    {isHistoryLoading && messages.length === 0 ? (
      <div className="flex items-center justify-center py-8 text-sm text-[#99A1AF]">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        Loading chat鈥?      </div>
    ) : messages.length === 0 ? (
      <ChatEmptyState onApplyPrompt={onApplyPrompt} />
    ) : (
      <div className="flex flex-col gap-9">
        {messages.map((message) =>
          message.role === "user" ? (
            <div key={message.id} className="flex items-start justify-end gap-2">
              <div className="max-w-[78%] rounded-[20px] bg-[#A100FF] px-4 py-3 text-sm font-medium leading-5 text-white">
                <p className="whitespace-pre-wrap">
                  {stripBackendContextFromUserMessage(message.content)}
                </p>
              </div>
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#FF8617] text-sm font-semibold text-white">
                U
              </div>
            </div>
          ) : (
            <div key={message.id} className="max-w-[92%]">
              <AssistantMarker />
              {message.content ? (
                message.role === "error" ? (
                  <div className="whitespace-pre-wrap text-sm font-normal leading-5 text-red-600">
                    {message.content}
                  </div>
                ) : (
                  <div className="chat-markdown mb-0 text-sm font-normal leading-5 text-[#535862]">
                    <MarkdownRenderer
                      content={message.content}
                      className="chat-markdown mb-0 text-sm font-normal leading-5 text-[#535862]"
                    />
                    {isSending && message.id === activeAssistantMessageId && (
                      <span
                        aria-hidden="true"
                        className="ml-1 inline-block h-4 w-0.5 animate-pulse rounded-full bg-[#98A2B3] align-middle"
                      />
                    )}
                  </div>
                )
              ) : (
                <div className="text-sm font-normal leading-5 text-[#535862]">
                  {isSending && message.role === "assistant"
                    ? message.activity?.[message.activity.length - 1]?.label ||
                      "Working on it..."
                    : ""}
                </div>
              )}
              {message.activity && message.activity.length > 0 && (
                <div className="mt-2">
                  <button
                    type="button"
                    onClick={() => onToggleActivityExpanded(message.id)}
                    className="inline-flex items-center gap-1 text-left text-xs font-medium text-[#667085] hover:text-[#475467]"
                  >
                    {expandedActivityByMessage[message.id] ? (
                      <ChevronDown className="h-3 w-3" />
                    ) : (
                      <ChevronRight className="h-3 w-3" />
                    )}
                    <span>Thinking</span>
                    {message.activity.some((item) => item.state === "running") && (
                      <Loader2 className="h-3 w-3 animate-spin text-[#98A2B3]" />
                    )}
                  </button>

                  {expandedActivityByMessage[message.id] && (
                    <div className="mt-2 space-y-1.5 pl-4">
                      {message.activity.map((activityItem) => (
                        <div
                          key={activityItem.id}
                          className="text-xs leading-4 text-[#667085]"
                        >
                          {activityItem.tool && (
                            <span className="mr-1 text-[#475467]">
                              {getToolLabel(activityItem.tool)}:
                            </span>
                          )}
                          <span>{activityItem.label}</span>
                        </div>
                      ))}
                      {message.toolCalls && message.toolCalls.length > 0 && (
                        <div className="pt-0.5 text-[11px] text-[#98A2B3]">
                          Tools called: {message.toolCalls.join(", ")}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        )}
      </div>
    )}

    <div ref={messagesEndRef} />
  </div>
);

export default ChatMessageList;


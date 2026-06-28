import type {
  FormEventHandler,
  KeyboardEventHandler,
  RefObject,
} from "react";
import { Loader2, Plus, Send, Square } from "lucide-react";
import ToolTip from "@/components/ToolTip";

type ChatComposerProps = {
  errorMessage: string | null;
  input: string;
  inputRef: RefObject<HTMLTextAreaElement>;
  isFollowAgentEnabled: boolean;
  isHistoryLoading: boolean;
  isSending: boolean;
  onInputChange: (value: string) => void;
  onKeyDown: KeyboardEventHandler<HTMLTextAreaElement>;
  onStopStreaming: () => void;
  onSubmit: FormEventHandler<HTMLFormElement>;
  onToggleFollowAgent: () => void;
};

const ChatComposer = ({
  errorMessage,
  input,
  inputRef,
  isFollowAgentEnabled,
  isHistoryLoading,
  isSending,
  onInputChange,
  onKeyDown,
  onStopStreaming,
  onSubmit,
  onToggleFollowAgent,
}: ChatComposerProps) => (
  <form
    onSubmit={onSubmit}
    className="mx-4 mb-4 rounded-[8px] border border-[#F4F4F4] bg-white px-2.5 py-3"
    style={{
      boxShadow: "0 2px 10px 0 rgba(15, 23, 42, 0.05)",
    }}
  >
    <textarea
      ref={inputRef}
      name="chat-input"
      id="chat-input"
      className="min-h-[92px] w-full resize-none bg-transparent text-sm text-[#101828] placeholder:text-[#99A1AF] focus:outline-none focus:ring-0"
      rows={3}
      value={input}
      disabled={isSending || isHistoryLoading}
      onChange={(event) => onInputChange(event.target.value)}
      onKeyDown={onKeyDown}
      placeholder="Improve your slides..."
      aria-invalid={Boolean(errorMessage)}
    />
    <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
      <div className="flex items-center gap-2 rounded-[64px] border border-[#EDEEEF] bg-white px-3 py-1">
        <button
          type="button"
          disabled
          className="inline-flex h-[28px] items-center rounded-[64px] disabled:opacity-50"
          aria-label="Attach files"
          title="Attachments are not supported yet"
        >
          <Plus className="h-3 w-3 text-black" />
        </button>
        <svg
          className="mx-[8px]"
          xmlns="http://www.w3.org/2000/svg"
          width="2"
          height="17"
          viewBox="0 0 2 17"
          fill="none"
        >
          <path d="M1 0V16.5" stroke="#EDECEC" strokeWidth="2" />
        </svg>
        <ToolTip
          content={
            isFollowAgentEnabled
              ? "Disable follow AI mode"
              : "Enable follow AI mode"
          }
        >
          <button
            type="button"
            onClick={onToggleFollowAgent}
            disabled={isHistoryLoading || isSending}
            className="inline-flex h-[28px] items-center gap-1 rounded-[64px] text-[11px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50"
            aria-label={
              isFollowAgentEnabled
                ? "Disable follow AI mode"
                : "Enable follow AI mode"
            }
            title={
              isFollowAgentEnabled
                ? "Follow AI is on: auto-jump to active slide"
                : "Follow AI is off"
            }
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="12"
              height="12"
              viewBox="0 0 11 11"
              fill="none"
            >
              <g clipPath="url(#clip0_6216_326)">
                <path
                  d="M5.50008 10.0837C8.03139 10.0837 10.0834 8.03163 10.0834 5.50033C10.0834 2.96902 8.03139 0.916992 5.50008 0.916992C2.96878 0.916992 0.916748 2.96902 0.916748 5.50033C0.916748 8.03163 2.96878 10.0837 5.50008 10.0837Z"
                  stroke={isFollowAgentEnabled ? "#7A5AF8" : "#000000"}
                  strokeWidth="0.938667"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M10.0833 5.5H8.25"
                  stroke={isFollowAgentEnabled ? "#7A5AF8" : "#000000"}
                  strokeWidth="0.938667"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M2.75008 5.5H0.916748"
                  stroke={isFollowAgentEnabled ? "#7A5AF8" : "#000000"}
                  strokeWidth="0.938667"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M5.5 2.75033V0.916992"
                  stroke={isFollowAgentEnabled ? "#7A5AF8" : "#000000"}
                  strokeWidth="0.938667"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M5.5 10.0833V8.25"
                  stroke={isFollowAgentEnabled ? "#7A5AF8" : "#000000"}
                  strokeWidth="0.938667"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </g>
              <defs>
                <clipPath id="clip0_6216_326">
                  <rect width="11" height="11" fill="white" />
                </clipPath>
              </defs>
            </svg>
          </button>
        </ToolTip>
      </div>
      <div className="ml-auto flex items-center gap-2">
        {isSending ? (
          <button
            type="button"
            onClick={onStopStreaming}
            className="flex items-center gap-1.5 whitespace-nowrap rounded-[34px] border border-[#E4E7EC] bg-white px-3 py-2 text-sm font-medium text-[#344054] transition-colors hover:bg-[#F9FAFB]"
            aria-label="Stop chat response"
          >
            <Loader2
              className="h-3 w-3 animate-spin text-[#667085]"
              aria-hidden="true"
            />
            <Square className="h-3 w-3 fill-current" aria-hidden="true" />
            Stop
          </button>
        ) : (
          <button
            type="submit"
            disabled={!input.trim() || isHistoryLoading}
            className="flex items-center gap-1.5 whitespace-nowrap px-3 py-2 text-sm font-medium text-[#191919] disabled:cursor-not-allowed disabled:opacity-60"
            style={{
              background:
                "linear-gradient(270deg, #D5CAFC 2.4%, #E3D2EB 27.88%, #F4DCD3 69.23%, #FDE4C2 100%)",
              borderRadius: "34px",
            }}
          >
            <Send className="h-3 w-3 text-[#191919]" />
            Send
          </button>
        )}
      </div>
    </div>
  </form>
);

export default ChatComposer;


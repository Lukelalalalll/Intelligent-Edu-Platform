import { Loader2, RefreshCw } from "lucide-react";

type ChatHeaderProps = {
  isHistoryLoading: boolean;
  isSending: boolean;
  onReset: () => void;
};

const ChatHeader = ({
  isHistoryLoading,
  isSending,
  onReset,
}: ChatHeaderProps) => (
  <div className="flex items-center justify-between px-4 pt-8">
    <div className="flex items-center gap-2">
      <h4 className="flex items-center gap-2 text-sm font-semibold text-[#101828]">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden="true"
        >
          <path
            d="M19.1407 9.46542C16.5537 9.21616 14.5067 7.17009 14.2577 4.58528L13.8376 0.220703L13.4175 4.58528C13.1685 7.17053 11.1215 9.2166 8.53451 9.46542L4.1731 9.88521L8.53451 10.305C11.1215 10.5543 13.1685 12.6003 13.4175 15.1852L13.8376 19.5497L14.2577 15.1852C14.5067 12.5999 16.5537 10.5538 19.1407 10.305L23.5021 9.88521L19.1407 9.46542Z"
            fill="#7A5AF8"
          />
          <path
            d="M9.07681 16.8431C7.62808 16.7035 6.48175 15.5577 6.34232 14.1102L6.10707 11.666L5.87183 14.1102C5.7324 15.5579 4.58606 16.7037 3.13734 16.8431L0.694946 17.0781L3.13734 17.3132C4.58606 17.4528 5.7324 18.5986 5.87183 20.0461L6.10707 22.4903L6.34232 20.0461C6.48175 18.5984 7.62808 17.4526 9.07681 17.3132L11.5192 17.0781L9.07681 16.8431Z"
            fill="#7A5AF8"
          />
        </svg>
        AI Assistant
      </h4>
      {isSending && (
        <span className="inline-flex items-center gap-1 rounded-full bg-[#F4F3FF] px-2 py-0.5 text-[10px] font-medium text-[#6941C6]">
          <Loader2 className="h-2.5 w-2.5 animate-spin" />
          Live
        </span>
      )}
    </div>
    <button
      type="button"
      onClick={onReset}
      disabled={isSending || isHistoryLoading}
      className="rounded-full p-1 text-[#8C8C8C] transition-colors hover:bg-[#F7F7F7] hover:text-[#191919] disabled:cursor-not-allowed disabled:opacity-50"
      aria-label="Reset chat"
      title="Reset chat"
    >
      <RefreshCw className="h-4 w-4" />
    </button>
  </div>
);

export default ChatHeader;


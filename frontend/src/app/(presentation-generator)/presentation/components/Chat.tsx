"use client";

import React from "react";
import ChatComposer from "./chat/components/ChatComposer";
import ChatHeader from "./chat/components/ChatHeader";
import ChatMessageList from "./chat/components/ChatMessageList";
import { usePresentationChat } from "./chat/hooks/usePresentationChat";
import type { ChatProps } from "./chat/Chat.types";

const PROJECT_UI_FONT_STACK =
  '"Segoe UI", -apple-system, BlinkMacSystemFont, Roboto, sans-serif';

const Chat = (props: ChatProps) => {
  const {
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
  } = usePresentationChat(props);

  return (
    <div
      className="flex h-full w-full flex-col bg-white"
      style={{ fontFamily: PROJECT_UI_FONT_STACK }}
    >
      <ChatHeader
        isHistoryLoading={isHistoryLoading}
        isSending={isSending}
        onReset={resetChat}
      />
      <ChatMessageList
        activeAssistantMessageId={activeAssistantMessageId}
        expandedActivityByMessage={expandedActivityByMessage}
        isHistoryLoading={isHistoryLoading}
        isSending={isSending}
        messages={messages}
        messagesEndRef={messagesEndRef}
        onApplyPrompt={applyPrompt}
        onToggleActivityExpanded={toggleActivityExpanded}
      />
      <ChatComposer
        errorMessage={errorMessage}
        input={input}
        inputRef={inputRef}
        isFollowAgentEnabled={isFollowAgentEnabled}
        isHistoryLoading={isHistoryLoading}
        isSending={isSending}
        onInputChange={setInput}
        onKeyDown={handleKeyDown}
        onStopStreaming={stopStreaming}
        onSubmit={handleSubmit}
        onToggleFollowAgent={toggleFollowAgentMode}
      />
    </div>
  );
};

export default React.memo(Chat);


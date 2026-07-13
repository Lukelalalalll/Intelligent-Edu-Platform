import { useCallback, useEffect, useRef, useState } from "react";
import { MESSAGE_UPDATE_FLUSH_MS } from "../Chat.constants";
import type { ChatMessage } from "../Chat.types";

type MessagesUpdater =
  | ChatMessage[]
  | ((currentMessages: ChatMessage[]) => ChatMessage[]);

export const useBufferedMessages = () => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  const messagesRef = useRef<ChatMessage[]>([]);
  const queuedMessageUpdatersRef = useRef<
    Array<(currentMessages: ChatMessage[]) => ChatMessage[]>
  >([]);
  const messageFlushTimerRef = useRef<number | null>(null);

  const drainPendingMessageUpdates = useCallback(
    (baseMessages: ChatMessage[] = messagesRef.current) => {
      if (messageFlushTimerRef.current !== null) {
        window.clearTimeout(messageFlushTimerRef.current);
        messageFlushTimerRef.current = null;
      }

      const queuedUpdaters = queuedMessageUpdatersRef.current;
      queuedMessageUpdatersRef.current = [];

      return queuedUpdaters.reduce(
        (currentMessages, updater) => updater(currentMessages),
        baseMessages
      );
    },
    []
  );

  const flushQueuedMessageUpdates = useCallback(() => {
    const nextMessages = drainPendingMessageUpdates();
    messagesRef.current = nextMessages;
    setMessages(nextMessages);
  }, [drainPendingMessageUpdates]);

  const setMessagesImmediate = useCallback(
    (updater: MessagesUpdater) => {
      const currentMessages = drainPendingMessageUpdates();
      const nextMessages =
        typeof updater === "function"
          ? (
              updater as (currentMessages: ChatMessage[]) => ChatMessage[]
            )(currentMessages)
          : updater;

      messagesRef.current = nextMessages;
      setMessages(nextMessages);
    },
    [drainPendingMessageUpdates]
  );

  const queueMessageUpdate = useCallback(
    (updater: (currentMessages: ChatMessage[]) => ChatMessage[]) => {
      queuedMessageUpdatersRef.current.push(updater);

      if (messageFlushTimerRef.current !== null) {
        return;
      }

      messageFlushTimerRef.current = window.setTimeout(() => {
        flushQueuedMessageUpdates();
      }, MESSAGE_UPDATE_FLUSH_MS);
    },
    [flushQueuedMessageUpdates]
  );

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(
    () => () => {
      if (messageFlushTimerRef.current !== null) {
        window.clearTimeout(messageFlushTimerRef.current);
      }
      queuedMessageUpdatersRef.current = [];
    },
    []
  );

  return {
    messages,
    setMessagesImmediate,
    queueMessageUpdate,
    flushQueuedMessageUpdates,
  };
};


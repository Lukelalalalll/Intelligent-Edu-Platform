/**
 * chatApi.ts — backwards-compatible facade.
 * Domain APIs are now in src/features/chat/api/:
 *   contactApi, roomApi, messageApi, chatAiApi, transferApi
 *
 * All methods are re-exported here so existing importers continue to work.
 */

import { contactApi } from '../features/chat/api/contactApi';
import { roomApi } from '../features/chat/api/roomApi';
import { messageApi } from '../features/chat/api/messageApi';
import { chatAiApi } from '../features/chat/api/chatAiApi';
import { transferApi, toAbsoluteFileUrl, fetchFileBlob } from '../features/chat/api/transferApi';

export type { AiSummaryResult, AiReplySuggestionsResult, AiRewriteResult, AiAssistantResult } from '../features/chat/api/chatAiApi';
export type { TransferStartResult, TransferStatus, TransferConsumeResult } from '../features/chat/api/transferApi';

export const chatApi = {
    toAbsoluteFileUrl,
    fetchFileBlob,
    ...contactApi,
    ...roomApi,
    ...messageApi,
    ...chatAiApi,
    ...transferApi,
};

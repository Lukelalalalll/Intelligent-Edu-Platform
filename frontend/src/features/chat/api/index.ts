/**
 * Chat feature API barrel — merges all sub-API modules into a single facade.
 */

import { contactApi } from './contactApi';
import { roomApi } from './roomApi';
import { messageApi } from './messageApi';
import { chatAiApi } from './chatAiApi';
import { transferApi, toAbsoluteFileUrl, fetchFileBlob } from './transferApi';

export type { AiSummaryResult, AiReplySuggestionsResult, AiRewriteResult, AiAssistantResult } from './chatAiApi';
export type { TransferStartResult, TransferStatus, TransferConsumeResult } from './transferApi';

export const chatApi = {
    toAbsoluteFileUrl,
    fetchFileBlob,
    ...contactApi,
    ...roomApi,
    ...messageApi,
    ...chatAiApi,
    ...transferApi,
};

export { contactApi, roomApi, messageApi, chatAiApi, transferApi, toAbsoluteFileUrl, fetchFileBlob };

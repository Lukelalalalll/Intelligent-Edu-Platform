import type { MessageDictionary } from "../types";

export const enSharedNetworkMessages = {
  "network.offline.body": "Some features are unavailable. Please check your network.",
  "network.offline.title": "No Internet Connection",
  "network.restored": "Connection restored. You are back online.",
} as const satisfies MessageDictionary;


export const zhCNSharedNetworkMessages = {
  "network.offline.body": "部分功能暂时不可用。请检查你的网络连接。",
  "network.offline.title": "没有网络连接",
  "network.restored": "连接已恢复。你已重新联网。",
} as const satisfies MessageDictionary;


export const zhHKSharedNetworkMessages = {
  "network.offline.body": "部分功能暫時不可用。請檢查你的網絡連線。",
  "network.offline.title": "沒有網絡連線",
  "network.restored": "連線已恢復。你已重新連上網絡。",
} as const satisfies MessageDictionary;


export const zhTWSharedNetworkMessages = {
  "network.offline.body": "部分功能暫時無法使用。請檢查你的網路連線。",
  "network.offline.title": "沒有網路連線",
  "network.restored": "連線已恢復。你已重新連上網路。",
} as const satisfies MessageDictionary;

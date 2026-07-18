import type { MessageDictionary } from "../types";

export const enSharedErrorMessages = {
  "error.backHome": "Back to Home",
  "error.pageTitle": "This page encountered an error",
  "error.retry": "Retry",
  "error.unexpected": "An unexpected error occurred.",
} as const satisfies MessageDictionary;


export const zhCNSharedErrorMessages = {
  "error.backHome": "返回首页",
  "error.pageTitle": "此页面遇到错误",
  "error.retry": "重试",
  "error.unexpected": "发生了意外错误。",
} as const satisfies MessageDictionary;


export const zhHKSharedErrorMessages = {
  "error.backHome": "返回主頁",
  "error.pageTitle": "此頁面發生錯誤",
  "error.retry": "重試",
  "error.unexpected": "發生未預期錯誤。",
} as const satisfies MessageDictionary;


export const zhTWSharedErrorMessages = {
  "error.backHome": "返回首頁",
  "error.pageTitle": "此頁面發生錯誤",
  "error.retry": "重試",
  "error.unexpected": "發生未預期的錯誤。",
} as const satisfies MessageDictionary;

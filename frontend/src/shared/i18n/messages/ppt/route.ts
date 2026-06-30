import type { MessageDictionary } from "../types";

export const enPptRouteMessages = {
  "ppt_generator.route.missingId.body": "Please try again",
  "ppt_generator.route.missingId.cta": "Go to home",
  "ppt_generator.route.missingId.title": "No presentation id found",
} as const satisfies MessageDictionary;


export const zhCNPptRouteMessages = {
  "ppt_generator.route.missingId.body": "请重试",
  "ppt_generator.route.missingId.cta": "返回首页",
  "ppt_generator.route.missingId.title": "未找到演示文稿 ID",
} as const satisfies MessageDictionary;


export const zhHKPptRouteMessages = {
  "ppt_generator.route.missingId.body": "請重試",
  "ppt_generator.route.missingId.cta": "返回首頁",
  "ppt_generator.route.missingId.title": "未找到簡報 ID",
} as const satisfies MessageDictionary;

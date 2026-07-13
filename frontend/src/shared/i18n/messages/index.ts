import { extendMessages, mergeMessages } from './mergeMessages';
import { enSharedLanguageMessages, zhCNSharedLanguageMessages, zhHKSharedLanguageMessages } from "./shared/language";
import { enSharedNavMessages, zhCNSharedNavMessages, zhHKSharedNavMessages } from "./shared/nav";
import { enSharedSidebarMessages, zhCNSharedSidebarMessages, zhHKSharedSidebarMessages } from "./shared/sidebar";
import { enSharedFooterMessages, zhCNSharedFooterMessages, zhHKSharedFooterMessages } from "./shared/footer";
import { enSharedNetworkMessages, zhCNSharedNetworkMessages, zhHKSharedNetworkMessages } from "./shared/network";
import { enSharedErrorMessages, zhCNSharedErrorMessages, zhHKSharedErrorMessages } from "./shared/error";
import { enSharedHomeToolMessages, zhCNSharedHomeToolMessages, zhHKSharedHomeToolMessages } from "./shared/homeTool";
import { enPptLoadingMessages, zhCNPptLoadingMessages, zhHKPptLoadingMessages } from "./ppt/loading";
import { enPptRouteMessages, zhCNPptRouteMessages, zhHKPptRouteMessages } from "./ppt/route";
import { enPptWorkflowMessages, zhCNPptWorkflowMessages, zhHKPptWorkflowMessages } from "./ppt/workflow";
import { enPptUploadMessages, zhCNPptUploadMessages, zhHKPptUploadMessages } from "./ppt/upload";
import { enPptDocumentsMessages, zhCNPptDocumentsMessages, zhHKPptDocumentsMessages } from "./ppt/documents";
import { enPptOutlineMessages, zhCNPptOutlineMessages, zhHKPptOutlineMessages } from "./ppt/outline";
import { enPptDashboardMessages, zhCNPptDashboardMessages, zhHKPptDashboardMessages } from "./ppt/dashboard";
import { enPptTemplatesMessages, zhCNPptTemplatesMessages, zhHKPptTemplatesMessages } from "./ppt/templates";
import { enPptTemplatePreviewMessages, zhCNPptTemplatePreviewMessages, zhHKPptTemplatePreviewMessages } from "./ppt/templatePreview";
import { enPptCustomTemplateMessages, zhCNPptCustomTemplateMessages, zhHKPptCustomTemplateMessages } from "./ppt/customTemplate";
import { enPptSettingsMessages, zhCNPptSettingsMessages, zhHKPptSettingsMessages } from "./ppt/settings";
import { enPptThemeMessages, zhCNPptThemeMessages, zhHKPptThemeMessages } from "./ppt/theme";
import { enPptWorkspaceMessages, zhCNPptWorkspaceMessages, zhHKPptWorkspaceMessages } from "./ppt/workspace";
import { enPptPresentationMessages, zhCNPptPresentationMessages, zhHKPptPresentationMessages } from "./ppt/presentation";
import { enLegacyMessages, zhCNLegacyMessages, zhHKLegacyMessages } from "./legacy";

export { extendMessages, mergeMessages } from './mergeMessages';
export type { MessageDictionary } from './types';

export const enMessages = mergeMessages(
  enSharedLanguageMessages,
  enSharedNavMessages,
  enSharedSidebarMessages,
  enSharedFooterMessages,
  enSharedNetworkMessages,
  enSharedErrorMessages,
  enSharedHomeToolMessages,
  enPptLoadingMessages,
  enPptRouteMessages,
  enPptWorkflowMessages,
  enPptUploadMessages,
  enPptDocumentsMessages,
  enPptOutlineMessages,
  enPptDashboardMessages,
  enPptTemplatesMessages,
  enPptTemplatePreviewMessages,
  enPptCustomTemplateMessages,
  enPptSettingsMessages,
  enPptThemeMessages,
  enPptWorkspaceMessages,
  enPptPresentationMessages,
  enLegacyMessages,
);

export const zhCNMessages = extendMessages(
  enMessages,
  zhCNSharedLanguageMessages,
  zhCNSharedNavMessages,
  zhCNSharedSidebarMessages,
  zhCNSharedFooterMessages,
  zhCNSharedNetworkMessages,
  zhCNSharedErrorMessages,
  zhCNSharedHomeToolMessages,
  zhCNPptLoadingMessages,
  zhCNPptRouteMessages,
  zhCNPptWorkflowMessages,
  zhCNPptUploadMessages,
  zhCNPptDocumentsMessages,
  zhCNPptOutlineMessages,
  zhCNPptDashboardMessages,
  zhCNPptTemplatesMessages,
  zhCNPptTemplatePreviewMessages,
  zhCNPptCustomTemplateMessages,
  zhCNPptSettingsMessages,
  zhCNPptThemeMessages,
  zhCNPptWorkspaceMessages,
  zhCNPptPresentationMessages,
  zhCNLegacyMessages,
);

export const zhHKMessages = extendMessages(
  enMessages,
  zhHKSharedLanguageMessages,
  zhHKSharedNavMessages,
  zhHKSharedSidebarMessages,
  zhHKSharedFooterMessages,
  zhHKSharedNetworkMessages,
  zhHKSharedErrorMessages,
  zhHKSharedHomeToolMessages,
  zhHKPptLoadingMessages,
  zhHKPptRouteMessages,
  zhHKPptWorkflowMessages,
  zhHKPptUploadMessages,
  zhHKPptDocumentsMessages,
  zhHKPptOutlineMessages,
  zhHKPptDashboardMessages,
  zhHKPptTemplatesMessages,
  zhHKPptTemplatePreviewMessages,
  zhHKPptCustomTemplateMessages,
  zhHKPptSettingsMessages,
  zhHKPptThemeMessages,
  zhHKPptWorkspaceMessages,
  zhHKPptPresentationMessages,
  zhHKLegacyMessages,
);

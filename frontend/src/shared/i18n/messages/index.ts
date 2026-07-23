import { extendMessages, mergeMessages } from './mergeMessages';
import {
  enSharedLanguageMessages,
  zhCNSharedLanguageMessages,
  zhHKSharedLanguageMessages,
  zhTWSharedLanguageMessages,
} from "./shared/language";
import {
  enSharedNavMessages,
  zhCNSharedNavMessages,
  zhHKSharedNavMessages,
  zhTWSharedNavMessages,
} from "./shared/nav";
import {
  enSharedSidebarMessages,
  zhCNSharedSidebarMessages,
  zhHKSharedSidebarMessages,
  zhTWSharedSidebarMessages,
} from "./shared/sidebar";
import {
  enSharedFooterMessages,
  zhCNSharedFooterMessages,
  zhHKSharedFooterMessages,
  zhTWSharedFooterMessages,
} from "./shared/footer";
import {
  enSharedNetworkMessages,
  zhCNSharedNetworkMessages,
  zhHKSharedNetworkMessages,
  zhTWSharedNetworkMessages,
} from "./shared/network";
import {
  enSharedErrorMessages,
  zhCNSharedErrorMessages,
  zhHKSharedErrorMessages,
  zhTWSharedErrorMessages,
} from "./shared/error";
import {
  enSharedHomeToolMessages,
  zhCNSharedHomeToolMessages,
  zhHKSharedHomeToolMessages,
  zhTWSharedHomeToolMessages,
} from "./shared/homeTool";
import {
  enSharedPrivacyMessages,
  zhCNSharedPrivacyMessages,
  zhHKSharedPrivacyMessages,
  zhTWSharedPrivacyMessages,
} from "./shared/privacy";
import {
  enPptLoadingMessages,
  zhCNPptLoadingMessages,
  zhHKPptLoadingMessages,
  zhTWPptLoadingMessages,
} from "./ppt/loading";
import {
  enPptRouteMessages,
  zhCNPptRouteMessages,
  zhHKPptRouteMessages,
  zhTWPptRouteMessages,
} from "./ppt/route";
import {
  enPptWorkflowMessages,
  zhCNPptWorkflowMessages,
  zhHKPptWorkflowMessages,
  zhTWPptWorkflowMessages,
} from "./ppt/workflow";
import {
  enPptUploadMessages,
  zhCNPptUploadMessages,
  zhHKPptUploadMessages,
  zhTWPptUploadMessages,
} from "./ppt/upload";
import {
  enPptDocumentsMessages,
  zhCNPptDocumentsMessages,
  zhHKPptDocumentsMessages,
  zhTWPptDocumentsMessages,
} from "./ppt/documents";
import {
  enPptOutlineMessages,
  zhCNPptOutlineMessages,
  zhHKPptOutlineMessages,
  zhTWPptOutlineMessages,
} from "./ppt/outline";
import {
  enPptDashboardMessages,
  zhCNPptDashboardMessages,
  zhHKPptDashboardMessages,
  zhTWPptDashboardMessages,
} from "./ppt/dashboard";
import {
  enPptTemplatesMessages,
  zhCNPptTemplatesMessages,
  zhHKPptTemplatesMessages,
  zhTWPptTemplatesMessages,
} from "./ppt/templates";
import {
  enPptTemplatePreviewMessages,
  zhCNPptTemplatePreviewMessages,
  zhHKPptTemplatePreviewMessages,
  zhTWPptTemplatePreviewMessages,
} from "./ppt/templatePreview";
import {
  enPptCustomTemplateMessages,
  zhCNPptCustomTemplateMessages,
  zhHKPptCustomTemplateMessages,
  zhTWPptCustomTemplateMessages,
} from "./ppt/customTemplate";
import {
  enPptSettingsMessages,
  zhCNPptSettingsMessages,
  zhHKPptSettingsMessages,
  zhTWPptSettingsMessages,
} from "./ppt/settings";
import {
  enPptThemeMessages,
  zhCNPptThemeMessages,
  zhHKPptThemeMessages,
  zhTWPptThemeMessages,
} from "./ppt/theme";
import {
  enPptWorkspaceMessages,
  zhCNPptWorkspaceMessages,
  zhHKPptWorkspaceMessages,
  zhTWPptWorkspaceMessages,
} from "./ppt/workspace";
import {
  enPptPresentationMessages,
  zhCNPptPresentationMessages,
  zhHKPptPresentationMessages,
  zhTWPptPresentationMessages,
} from "./ppt/presentation";
import { enLegacyMessages, zhCNLegacyMessages, zhHKLegacyMessages, zhTWLegacyMessages } from "./legacy";

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
  enSharedPrivacyMessages,
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
  zhCNSharedPrivacyMessages,
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
  zhHKSharedPrivacyMessages,
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

export const zhTWMessages = extendMessages(
  enMessages,
  zhTWSharedLanguageMessages,
  zhTWSharedNavMessages,
  zhTWSharedSidebarMessages,
  zhTWSharedFooterMessages,
  zhTWSharedNetworkMessages,
  zhTWSharedErrorMessages,
  zhTWSharedHomeToolMessages,
  zhTWSharedPrivacyMessages,
  zhTWPptLoadingMessages,
  zhTWPptRouteMessages,
  zhTWPptWorkflowMessages,
  zhTWPptUploadMessages,
  zhTWPptDocumentsMessages,
  zhTWPptOutlineMessages,
  zhTWPptDashboardMessages,
  zhTWPptTemplatesMessages,
  zhTWPptTemplatePreviewMessages,
  zhTWPptCustomTemplateMessages,
  zhTWPptSettingsMessages,
  zhTWPptThemeMessages,
  zhTWPptWorkspaceMessages,
  zhTWPptPresentationMessages,
  zhTWLegacyMessages,
);

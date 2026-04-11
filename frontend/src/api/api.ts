/**
 * api.ts — backward-compat re-export shim.
 * Prefer importing directly from mailboxApi, cozeApi, or videoApi.
 */
export { teacherApi, studentApi } from './mailboxApi';
export { cozeApi } from './cozeApi';
export { videoApi } from './videoApi';

/** Vite environment variables used across the app */
interface ImportMetaEnv {
  readonly VITE_API_ROOT: string;
  readonly VITE_GOOGLE_AUTH_CLIENT_ID: string;
  readonly VITE_LOG_LEVEL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

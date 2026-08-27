/// <reference types="astro/client" />

interface Window {
  APP_CONFIG?: {
    API_BASE_URL?: string;
    SITE_URL?: string;
    ANALYTICS_ID?: string;
  };
}

// Runtime environment variables
interface ImportMetaEnv {
  readonly PUBLIC_API_BASE_URL: string;
  readonly PUBLIC_SITE_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
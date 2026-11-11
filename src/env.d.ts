/// <reference types="vite/client" />
interface ImportMetaEnv {
  readonly VITE_SNIPPETS_URL?: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}

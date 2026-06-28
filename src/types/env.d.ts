// Tauri 2 注入的全局类型
// 文档：https://v2.tauri.app/reference/globals/

/// <reference types="vite/client" />

export {};

declare global {
  interface Window {
    __TAURI_INTERNALS__?: {
      metadata: {
        currentWindow: { label: string };
        currentWebview: { label: string };
      };
      transformCallback: <T>(callback: (response: T) => void, once: boolean) => number;
    };
    __TAURI_OS_PLUGIN_INTERNALS__?: { [key: string]: unknown };
  }
}

// Vite ?raw import 声明
declare module '*.svg?raw' {
  const content: string;
  export default content;
}

// 入口：按 window label 路由到不同根组件
//  - main:  隐藏 anchor（无 UI）
//  - popover: PopoverRoot
//  - widget: WidgetRoot
//  - reminder-overlay: ReminderOverlayRoot

import React from 'react';
import ReactDOM from 'react-dom/client';
import PopoverRoot from '@/windows/PopoverRoot';
import WidgetRoot from '@/windows/WidgetRoot';
import SettingsRoot from '@/windows/SettingsRoot';
import ReminderOverlayRoot from '@/windows/ReminderOverlayRoot';
import '@/styles.css';

function getLabel(): string {
  // 1. URL 参数（最高优先级，Playwright 测试用）
  const url = new URLSearchParams(window.location.search).get('label');
  if (url) return url;
  // 2. Tauri 2 注入：window.__TAURI_INTERNALS__.metadata.currentWindow.label
  const internals = (
    window as unknown as {
      __TAURI_INTERNALS__?: {
        metadata: { currentWindow: { label: string } };
      };
    }
  ).__TAURI_INTERNALS__;
  return internals?.metadata?.currentWindow?.label ?? 'main';
}

const label = getLabel();
const Root =
  label === 'widget'
    ? WidgetRoot
    : label === 'settings'
      ? SettingsRoot
      : label === 'reminder-overlay'
        ? ReminderOverlayRoot
        : PopoverRoot;

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
);

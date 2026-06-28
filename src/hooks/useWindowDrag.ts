// 窗口拖动（前端 Tauri API）
//
// 04 阶段用在 widget：onMouseDown → win.startDragging()
// Rust 端监听 onMoved 自动保存位置到 DB + 边界检查

import { getCurrentWindow } from '@tauri-apps/api/window';
import type { MouseEvent } from 'react';

export function useWindowDrag() {
  const win = getCurrentWindow();
  return {
    /** 鼠标按下 → 触发原生拖动。e.preventDefault() 避免文字选中等默认行为 */
    onMouseDown: (e: MouseEvent) => {
      e.preventDefault();
      void win.startDragging();
    },
  };
}

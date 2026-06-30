// 键盘导航 hook
//
// 用法（在 popover 顶层）：
//   useKeyboardNav({
//     '1': () => onAdd(small),
//     '2': () => onAdd(medium),
//     '3': () => onAdd(large),
//     'Escape': () => win.hide(),
//   });
//
// 行为：
// - 只在目标窗口内生效（用 window === 当前 webview 区分）
// - input/textarea 聚焦时不触发（避免冲突）
// - modifier 键按下时忽略（防误触）

import { useEffect } from 'react';

type KeyHandler = (e: KeyboardEvent) => void;

interface Options {
  /** key → handler 映射（小写 key 字符串，如 '1' / 'escape'） */
  bindings: Record<string, KeyHandler>;
  /** 是否启用（默认 true） */
  enabled?: boolean;
}

export function useKeyboardNav({ bindings, enabled = true }: Options) {
  useEffect(() => {
    if (!enabled) return;
    const handler = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable) {
          return;
        }
      }
      const k = e.key.toLowerCase();
      const fn = bindings[k];
      if (fn) {
        e.preventDefault();
        fn(e);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [bindings, enabled]);
}

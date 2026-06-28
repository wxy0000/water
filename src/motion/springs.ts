// Framer Motion spring 常量（04 阶段）
//
// 全部使用 spring physics（无 linear / ease-in-out），符合 mvp-spec.md 强制要求。
// 4 组参数按使用场景调优，对照 Linear / Raycast / Arc 的物理感。

import type { Transition } from 'framer-motion';

export const springs = {
  /** 圆环进度条（低 stiffness + 适中 damping = 弹性"灌满"感） */
  ring: { type: 'spring', stiffness: 80, damping: 15 } as Transition,

  /** 按钮按下回弹（高 stiffness + 高 damping = 快速响应） */
  button: { type: 'spring', stiffness: 400, damping: 25 } as Transition,

  /** Popover 出现（适中 stiffness + damping = 轻微 overshoot） */
  popover: { type: 'spring', stiffness: 300, damping: 22 } as Transition,

  /** 数字翻牌 / Widget（适中 stiffness + 略低 damping = 弹性更明显） */
  widget: { type: 'spring', stiffness: 300, damping: 20 } as Transition,
} as const;

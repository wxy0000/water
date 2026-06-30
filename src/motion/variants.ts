// Framer Motion variants
//
// variants 配合 springs.ts 使用，让 motion.div 直接 initial/animate/exit。

import type { Variants } from 'framer-motion';
import { springs } from './springs';

/** Popover / 卡片出现：轻微 overshoot */
export const popoverVariants: Variants = {
  hidden: { opacity: 0, scale: 0.9, y: -8 },
  visible: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: springs.popover,
  },
  exit: { opacity: 0, scale: 0.95, y: -4, transition: { duration: 0.15 } },
};

/** 按钮按下 */
export const buttonVariants: Variants = {
  rest: { scale: 1 },
  tap: { scale: 0.92, transition: springs.button },
};

/** 数字翻牌（key 切换时） */
export const counterVariants: Variants = {
  initial: { opacity: 0, y: 6 },
  animate: { opacity: 1, y: 0, transition: springs.widget },
  exit: { opacity: 0, y: -6, transition: { duration: 0.1 } },
};

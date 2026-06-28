// 半透明背景卡片（vibrancy 效果 + spring 出现）
import { motion, type HTMLMotionProps } from 'framer-motion';
import { popoverVariants } from '@/motion/variants';

interface Props extends HTMLMotionProps<'div'> {
  children: React.ReactNode;
}

export const VibrancyCard = ({ children, style, ...rest }: Props) => (
  <motion.div
    initial="hidden"
    animate="visible"
    exit="exit"
    variants={popoverVariants}
    style={{
      // vibrancy：macOS 用 NSVisualEffectView（Rust 端 window-vibrancy），
      // 非 macOS 或 vibrancy 失败时用 backdrop-filter 降级
      background: 'rgba(255, 255, 255, 0.72)',
      backdropFilter: 'blur(20px) saturate(180%)',
      WebkitBackdropFilter: 'blur(20px) saturate(180%)',
      borderRadius: 16,
      boxShadow: '0 8px 32px rgba(0, 0, 0, 0.12)',
      border: '1px solid rgba(255, 255, 255, 0.4)',
      ...style,
    }}
    {...rest}
  >
    {children}
  </motion.div>
);

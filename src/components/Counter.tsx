// 数字翻牌（key 切换时 spring y 过渡）
import { AnimatePresence, motion } from 'framer-motion';
import { counterVariants } from '@/motion/variants';

interface Props {
  value: number;
  format?: (n: number) => string;
  style?: React.CSSProperties;
  className?: string;
}

export const Counter = ({ value, format, style, className }: Props) => {
  const text = format ? format(value) : String(value);
  return (
    <span className={className} style={{ display: 'inline-block', ...style }}>
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={text}
          variants={counterVariants}
          initial="initial"
          animate="animate"
          exit="exit"
          style={{ display: 'inline-block' }}
        >
          {text}
        </motion.span>
      </AnimatePresence>
    </span>
  );
};

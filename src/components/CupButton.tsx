// 杯子按钮（whileTap spring）
import { motion } from 'framer-motion';
import { buttonVariants } from '@/motion/variants';
import { springs } from '@/motion/springs';

interface Props {
  label: string;
  onClick: () => void;
  disabled?: boolean;
}

export const CupButton = ({ label, onClick, disabled = false }: Props) => (
  <motion.button
    onClick={onClick}
    disabled={disabled}
    // buttonVariants.tap 是 Variants 类型，TS 推为 union，whileTap 期望单一 variant label
    // 用 as any 绕过；运行时 framer-motion 仍能正常用
    whileTap={disabled ? undefined : (buttonVariants.tap as never)}
    transition={springs.button}
    style={{
      flex: 1,
      padding: '12px 6px',
      borderRadius: 12,
      background: disabled ? 'rgba(0,0,0,0.04)' : 'rgba(74, 158, 255, 0.08)',
      color: disabled ? '#bbb' : '#4A9EFF',
      border: disabled ? '1px solid rgba(0,0,0,0.06)' : '1px solid rgba(74, 158, 255, 0.2)',
      cursor: disabled ? 'not-allowed' : 'pointer',
      fontSize: 13,
      fontWeight: 500,
      fontFamily: 'inherit',
    }}
  >
    {label}
  </motion.button>
);

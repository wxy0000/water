// Toggle 切换（spring 滑动）
import { motion } from 'framer-motion';

interface Props {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}

export const Toggle = ({ checked, onChange, disabled = false }: Props) => (
  <button
    type="button"
    onClick={() => !disabled && onChange(!checked)}
    disabled={disabled}
    aria-pressed={checked}
    style={{
      width: 38,
      height: 22,
      borderRadius: 11,
      background: checked ? '#4A9EFF' : 'rgba(0, 0, 0, 0.15)',
      border: 'none',
      padding: 0,
      cursor: disabled ? 'not-allowed' : 'pointer',
      position: 'relative',
      opacity: disabled ? 0.5 : 1,
      transition: 'background 0.2s',
    }}
  >
    <motion.div
      animate={{ x: checked ? 18 : 2 }}
      transition={{ type: 'spring', stiffness: 400, damping: 25 }}
      style={{
        position: 'absolute',
        top: 2,
        left: 0,
        width: 18,
        height: 18,
        borderRadius: 9,
        background: '#fff',
        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.2)',
      }}
    />
  </button>
);

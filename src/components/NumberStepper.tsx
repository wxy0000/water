// 数字加减按钮（whileTap spring scale）
import { motion } from 'framer-motion';

interface Props {
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange: (v: number) => void;
}

export const NumberStepper = ({ value, min, max, step = 10, onChange }: Props) => {
  const clamp = (v: number) => Math.max(min ?? -Infinity, Math.min(max ?? Infinity, v));
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <motion.button
        type="button"
        whileTap={{ scale: 0.9 }}
        transition={{ type: 'spring', stiffness: 400, damping: 25 }}
        onClick={() => onChange(clamp(value - step))}
        style={stepperBtn}
      >
        −
      </motion.button>
      <span
        style={{
          minWidth: 36,
          textAlign: 'center',
          fontSize: 13,
          color: '#1A1A1A',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {value}
      </span>
      <motion.button
        type="button"
        whileTap={{ scale: 0.9 }}
        transition={{ type: 'spring', stiffness: 400, damping: 25 }}
        onClick={() => onChange(clamp(value + step))}
        style={stepperBtn}
      >
        +
      </motion.button>
    </div>
  );
};

const stepperBtn: React.CSSProperties = {
  width: 24,
  height: 24,
  borderRadius: 6,
  background: 'rgba(74, 158, 255, 0.1)',
  color: '#4A9EFF',
  border: '1px solid rgba(74, 158, 255, 0.2)',
  cursor: 'pointer',
  fontSize: 14,
  lineHeight: 1,
  fontFamily: 'inherit',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 0,
};

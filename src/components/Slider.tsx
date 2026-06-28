// 数值滑块（spring thumb + 填充）
import { useRef } from 'react';
import { motion } from 'framer-motion';

interface Props {
  value: number;
  min: number;
  max: number;
  step?: number;
  format?: (v: number) => string;
  onChange: (v: number) => void;
}

export const Slider = ({ value, min, max, step = 1, format, onChange }: Props) => {
  const trackRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const pct = ((value - min) / (max - min)) * 100;

  const handleMove = (clientX: number) => {
    if (!trackRef.current) return;
    const rect = trackRef.current.getBoundingClientRect();
    const p = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const raw = min + p * (max - min);
    const stepped = Math.round(raw / step) * step;
    onChange(Math.max(min, Math.min(max, stepped)));
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 220 }}>
      <div
        ref={trackRef}
        onMouseDown={(e) => {
          dragging.current = true;
          handleMove(e.clientX);
        }}
        onMouseMove={(e) => dragging.current && handleMove(e.clientX)}
        onMouseUp={() => (dragging.current = false)}
        onMouseLeave={() => (dragging.current = false)}
        style={{
          flex: 1,
          height: 4,
          background: 'rgba(0, 0, 0, 0.1)',
          borderRadius: 2,
          position: 'relative',
          cursor: 'pointer',
          minWidth: 100,
        }}
      >
        <motion.div
          animate={{ width: `${pct}%` }}
          transition={{ type: 'spring', stiffness: 400, damping: 25 }}
          style={{ height: '100%', background: '#4A9EFF', borderRadius: 2 }}
        />
        <motion.div
          animate={{ left: `calc(${pct}% - 7px)` }}
          transition={{ type: 'spring', stiffness: 400, damping: 25 }}
          style={{
            position: 'absolute',
            top: -5,
            width: 14,
            height: 14,
            borderRadius: 7,
            background: '#fff',
            border: '2px solid #4A9EFF',
            cursor: 'grab',
            boxShadow: '0 1px 3px rgba(0, 0, 0, 0.2)',
          }}
        />
      </div>
      <div
        style={{
          minWidth: 64,
          textAlign: 'right',
          fontSize: 13,
          color: '#1A1A1A',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {format ? format(value) : value}
      </div>
    </div>
  );
};

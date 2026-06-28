// 时间选择（HH:MM 两个 number input）
interface Props {
  value: string; // "HH:MM"
  onChange: (v: string) => void;
}

export const TimePicker = ({ value, onChange }: Props) => {
  const [h, m] = value.split(':');
  const safeH = h ?? '09';
  const safeM = m ?? '00';
  const update = (newH: string, newM: string) => {
    const hNum = Math.max(0, Math.min(23, Number.parseInt(newH, 10) || 0));
    const mNum = Math.max(0, Math.min(59, Number.parseInt(newM, 10) || 0));
    onChange(`${String(hNum).padStart(2, '0')}:${String(mNum).padStart(2, '0')}`);
  };
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      <input
        type="number"
        min={0}
        max={23}
        value={safeH}
        onChange={(e) => update(e.target.value, safeM)}
        style={timeInput}
      />
      <span style={{ color: '#999' }}>:</span>
      <input
        type="number"
        min={0}
        max={59}
        value={safeM}
        onChange={(e) => update(safeH, e.target.value)}
        style={timeInput}
      />
    </div>
  );
};

const timeInput: React.CSSProperties = {
  width: 36,
  padding: '4px 6px',
  borderRadius: 6,
  border: '1px solid rgba(0, 0, 0, 0.1)',
  fontSize: 13,
  textAlign: 'center',
  fontFamily: 'inherit',
  background: 'rgba(255, 255, 255, 0.5)',
  color: '#1A1A1A',
  outline: 'none',
  fontVariantNumeric: 'tabular-nums',
};

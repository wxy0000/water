// 时间选择（HH:MM 两个 text input）
//
// 用本地 state 缓存输入文本，blur 时才解析/clamp/commit。
// 避免 type=number 受控 input + 实时 padStart 把 "13" 重写成 "01" 的跳变 bug。

import { useEffect, useState } from 'react';

interface Props {
  value: string; // "HH:MM"
  onChange: (v: string) => void;
}

const clamp = (n: number, max: number) => Math.max(0, Math.min(max, n));
const pad2 = (n: number) => String(n).padStart(2, '0');

export const TimePicker = ({ value, onChange }: Props) => {
  const [h, m] = value.split(':');
  // 本地缓存：初始用解析后的两位数，编辑过程允许任意文本（空、单数）
  const [hText, setHText] = useState(pad2(clamp(Number.parseInt(h ?? '0', 10) || 0, 23)));
  const [mText, setMText] = useState(pad2(clamp(Number.parseInt(m ?? '0', 10) || 0, 59)));

  // 外部 value 变化（如撤销/重置）时同步本地缓存
  useEffect(() => {
    setHText(pad2(clamp(Number.parseInt(h ?? '0', 10) || 0, 23)));
    setMText(pad2(clamp(Number.parseInt(m ?? '0', 10) || 0, 59)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  // blur 时 commit：解析失败按 0，clamp 到合法范围，补零
  const commit = (which: 'h' | 'm') => {
    if (which === 'h') {
      const n = clamp(Number.parseInt(hText, 10) || 0, 23);
      const text = pad2(n);
      setHText(text);
      onChange(`${text}:${mText}`);
    } else {
      const n = clamp(Number.parseInt(mText, 10) || 0, 59);
      const text = pad2(n);
      setMText(text);
      onChange(`${hText}:${text}`);
    }
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      <input
        type="text"
        inputMode="numeric"
        maxLength={2}
        value={hText}
        onChange={(e) => setHText(e.target.value.replace(/\D/g, '').slice(0, 2))}
        onBlur={() => commit('h')}
        style={timeInput}
      />
      <span style={{ color: '#999' }}>:</span>
      <input
        type="text"
        inputMode="numeric"
        maxLength={2}
        value={mText}
        onChange={(e) => setMText(e.target.value.replace(/\D/g, '').slice(0, 2))}
        onBlur={() => commit('m')}
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

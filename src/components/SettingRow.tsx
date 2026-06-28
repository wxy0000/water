// 设置行（label + 控件 + hint）
interface Props {
  label: string;
  hint?: string;
  children: React.ReactNode;
}

export const SettingRow = ({ label, hint, children }: Props) => (
  <div
    style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
      padding: '8px 0',
    }}
  >
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ fontSize: 13, color: '#1A1A1A' }}>{label}</div>
      {hint && <div style={{ fontSize: 11, color: '#999', marginTop: 2 }}>{hint}</div>}
    </div>
    <div style={{ flexShrink: 0 }}>{children}</div>
  </div>
);

// Tab 切换（spring 滑动指示器，07 阶段）
import { motion } from 'framer-motion';

interface Tab<T extends string> {
  id: T;
  label: string;
}

interface Props<T extends string> {
  tabs: Tab<T>[];
  active: T;
  onChange: (id: T) => void;
}

export const TabSwitcher = <T extends string>({ tabs, active, onChange }: Props<T>) => (
  <div
    style={{
      display: 'flex',
      background: 'rgba(0, 0, 0, 0.05)',
      borderRadius: 8,
      padding: 3,
      position: 'relative',
    }}
  >
    {tabs.map((tab) => {
      const isActive = tab.id === active;
      return (
        <button
          key={tab.id}
          onClick={() => onChange(tab.id)}
          style={{
            flex: 1,
            padding: '6px 12px',
            border: 'none',
            background: 'transparent',
            color: isActive ? '#1A1A1A' : '#999',
            fontSize: 12,
            fontWeight: isActive ? 600 : 500,
            cursor: 'pointer',
            position: 'relative',
            zIndex: 1,
            fontFamily: 'inherit',
          }}
        >
          {isActive && (
            <motion.div
              layoutId="tab-indicator"
              style={{
                position: 'absolute',
                inset: 0,
                background: '#fff',
                borderRadius: 6,
                boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
                zIndex: -1,
              }}
              transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            />
          )}
          {tab.label}
        </button>
      );
    })}
  </div>
);

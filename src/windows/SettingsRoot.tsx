// 设置窗口根组件（06 阶段）
//
// 内容：13 个设置项 + 数据管理（清空今日 / 清空全部 + 确认弹窗）
// 实时保存：每个 onChange 立即 invoke('set_setting') + 乐观更新

import { useState } from 'react';
import { motion } from 'framer-motion';
import { VibrancyCard } from '@/components/VibrancyCard';
import { SettingRow } from '@/components/SettingRow';
import { Toggle } from '@/components/Toggle';
import { Slider } from '@/components/Slider';
import { NumberStepper } from '@/components/NumberStepper';
import { TimePicker } from '@/components/TimePicker';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { TabSwitcher } from '@/components/TabSwitcher';
import { TrendChart } from '@/components/TrendChart';
import { AppIcon } from '@/components/AppIcon';
import { useSettings } from '@/hooks/useSettings';
import { useWeeklyData } from '@/hooks/useWeeklyData';
import { useTodayTotal } from '@/hooks/useTodayTotal';
import { commands, getCurrentWindow } from '@/lib/tauri';

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div style={{ marginBottom: 8 }}>
    <div
      style={{
        fontSize: 10,
        color: '#999',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
        marginBottom: 3,
        fontWeight: 500,
      }}
    >
      {title}
    </div>
    <div
      style={{
        background: 'rgba(255, 255, 255, 0.4)',
        borderRadius: 8,
        padding: '0 10px',
        border: '1px solid rgba(0, 0, 0, 0.04)',
      }}
    >
      {children}
    </div>
  </div>
);

export default function SettingsRoot() {
  const { settings: s, update } = useSettings();
  const [confirmClear, setConfirmClear] = useState<null | 'today' | 'all'>(null);
  const [activeTab, setActiveTab] = useState<'today' | 'week'>('today');
  const win = getCurrentWindow();
  const total = useTodayTotal();
  const weekly = useWeeklyData();

  if (!s) {
    return (
      <VibrancyCard style={{ width: 480, height: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: '#999' }}>加载中…</div>
      </VibrancyCard>
    );
  }

  return (
    <VibrancyCard
      style={{
        width: 480,
        height: 700,
        padding: 16,
        display: 'flex',
        flexDirection: 'column',
        fontFamily:
          '-apple-system, BlinkMacSystemFont, "SF Pro Display", system-ui, sans-serif',
      }}
    >
      {/* 顶部标题栏 */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 8,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <AppIcon size={28} />
          <h1 style={{ fontSize: 17, fontWeight: 600, color: '#1A1A1A', margin: 0 }}>
            L01 Water 设置
          </h1>
        </div>
        <motion.button
          whileTap={{ scale: 0.9 }}
          transition={{ type: 'spring', stiffness: 400, damping: 25 }}
          onClick={() => win.hide()}
          aria-label="关闭"
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            fontSize: 22,
            color: '#999',
            lineHeight: 1,
            padding: 4,
            fontFamily: 'inherit',
          }}
        >
          ×
        </motion.button>
      </div>

      {/* 07 阶段：Tab 切换 */}
      <div style={{ marginBottom: 10 }}>
        <TabSwitcher
          tabs={[
            { id: 'today', label: '今日' },
            { id: 'week', label: '7 天' },
          ]}
          active={activeTab}
          onChange={setActiveTab}
        />
      </div>

      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
        {activeTab === 'today' ? (
          <>
            {/* 今日统计 */}
            <div
              style={{
                background: 'rgba(74, 158, 255, 0.08)',
                borderRadius: 10,
                padding: 10,
                marginBottom: 10,
                textAlign: 'center',
              }}
            >
              <div style={{ fontSize: 24, fontWeight: 600, color: '#4A9EFF' }}>
                {total} / {s.dailyGoalMl} ml
              </div>
              <div style={{ fontSize: 12, color: '#666', marginTop: 4 }}>
                {Math.round((total / s.dailyGoalMl) * 100)}% · 今日进度
              </div>
            </div>

            {/* 每日目标 */}
            <Section title="每日目标">
              <SettingRow label="目标量" hint="每天喝多少 ml">
                <Slider
                  value={s.dailyGoalMl}
                  min={500}
                  max={4000}
                  step={100}
                  format={(v) => `${v} ml`}
                  onChange={(v) => update('dailyGoalMl', v)}
                />
              </SettingRow>
            </Section>

            {/* 杯量 */}
            <Section title="杯量">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, padding: '8px 0' }}>
                <CupAmountControl
                  label="小杯"
                  value={s.cupSmallMl}
                  min={50}
                  max={500}
                  step={10}
                  onChange={(v) => update('cupSmallMl', v)}
                />
                <CupAmountControl
                  label="中杯"
                  value={s.cupMediumMl}
                  min={100}
                  max={800}
                  step={10}
                  onChange={(v) => update('cupMediumMl', v)}
                />
                <CupAmountControl
                  label="大杯"
                  value={s.cupLargeMl}
                  min={200}
                  max={1500}
                  step={50}
                  onChange={(v) => update('cupLargeMl', v)}
                />
              </div>
            </Section>

            {/* 提醒 */}
            <Section title="提醒">
              <div style={{ display: 'flex', gap: 16, padding: '8px 0' }}>
                <SettingRow label="开始">
                  <TimePicker value={s.workStart} onChange={(v) => update('workStart', v)} />
                </SettingRow>
                <SettingRow label="结束">
                  <TimePicker value={s.workEnd} onChange={(v) => update('workEnd', v)} />
                </SettingRow>
              </div>
              <SettingRow label="启用提醒">
                <Toggle checked={s.reminderEnabled} onChange={(v) => update('reminderEnabled', v)} />
              </SettingRow>
              <SettingRow label="周末也提醒" hint="周六周日 9:00-18:00">
                <Toggle checked={s.weekendEnabled} onChange={(v) => update('weekendEnabled', v)} />
              </SettingRow>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, padding: '8px 0' }}>
                <SettingRow label="最小间隔 (分)">
                  <NumberStepper
                    value={s.reminderMinIntervalMin}
                    min={30}
                    max={180}
                    step={5}
                    onChange={(v) => update('reminderMinIntervalMin', v)}
                  />
                </SettingRow>
                <SettingRow label="最大间隔 (分)">
                  <NumberStepper
                    value={s.reminderMaxIntervalMin}
                    min={60}
                    max={240}
                    step={5}
                    onChange={(v) => update('reminderMaxIntervalMin', v)}
                  />
                </SettingRow>
              </div>
            </Section>

            {/* 桌面与数据 */}
            <Section title="桌面与数据">
              <SettingRow label="显示桌面浮窗">
                <Toggle checked={s.widgetVisible} onChange={(v) => update('widgetVisible', v)} />
              </SettingRow>
              <div style={{ display: 'flex', gap: 8, padding: '8px 0 10px' }}>
                <motion.button
                  whileTap={{ scale: 0.96 }}
                  onClick={() => setConfirmClear('today')}
                  style={dangerBtn}
                >
                  清空今日
                </motion.button>
                <motion.button
                  whileTap={{ scale: 0.96 }}
                  onClick={() => setConfirmClear('all')}
                  style={dangerBtn}
                >
                  清空全部
                </motion.button>
              </div>
            </Section>
          </>
        ) : (
          <>
            {/* 07 阶段：7 天折线图 */}
            <Section title="7 天总量">
              {weekly ? (
                <div
                  style={{
                    background: 'rgba(255, 255, 255, 0.5)',
                    borderRadius: 10,
                    padding: 16,
                    border: '1px solid rgba(0, 0, 0, 0.04)',
                  }}
                >
                  <TrendChart data={weekly} goal={s.dailyGoalMl} width={400} height={180} />
                </div>
              ) : (
                <div style={{ color: '#999', textAlign: 'center', padding: 24 }}>加载中…</div>
              )}
              <div
                style={{
                  marginTop: 12,
                  display: 'flex',
                  justifyContent: 'space-around',
                  padding: '8px 0',
                  fontSize: 12,
                  color: '#666',
                }}
              >
                <div>
                  7 天总量
                  <div style={{ fontSize: 18, fontWeight: 600, color: '#1A1A1A', marginTop: 2 }}>
                    {weekly?.reduce((sum, d) => sum + d.totalMl, 0) ?? 0} ml
                  </div>
                </div>
                <div>
                  日均
                  <div style={{ fontSize: 18, fontWeight: 600, color: '#1A1A1A', marginTop: 2 }}>
                    {weekly
                      ? Math.round(weekly.reduce((sum, d) => sum + d.totalMl, 0) / 7)
                      : 0}{' '}
                    ml
                  </div>
                </div>
                <div>
                  达标天数
                  <div style={{ fontSize: 18, fontWeight: 600, color: '#1A1A1A', marginTop: 2 }}>
                    {weekly?.filter((d) => d.totalMl >= s.dailyGoalMl).length ?? 0} / 7
                  </div>
                </div>
              </div>
            </Section>
          </>
        )}
      </div>

      <ConfirmDialog
        open={confirmClear !== null}
        title={confirmClear === 'today' ? '清空今日记录？' : '清空所有记录？'}
        message={
          confirmClear === 'today'
            ? '今日的喝水记录将被全部删除，但历史记录保留。此操作不可撤销。'
            : '所有历史喝水记录将被全部删除。此操作不可撤销。'
        }
        confirmText="清空"
        danger
        onConfirm={async () => {
          try {
            if (confirmClear === 'today') await commands.clearToday();
            else await commands.clearAll();
          } catch (e) {
            console.error('[settings] clear failed:', e);
          }
          setConfirmClear(null);
        }}
        onCancel={() => setConfirmClear(null)}
      />
    </VibrancyCard>
  );
}

const dangerBtn: React.CSSProperties = {
  flex: 1,
  padding: '8px 12px',
  borderRadius: 8,
  background: 'rgba(255, 59, 48, 0.08)',
  color: '#FF3B30',
  border: '1px solid rgba(255, 59, 48, 0.2)',
  fontSize: 13,
  fontWeight: 500,
  cursor: 'pointer',
  fontFamily: 'inherit',
};

const CupAmountControl = ({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
}) => (
  <div
    style={{
      minWidth: 0,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 8,
      padding: '6px 4px',
      borderRadius: 8,
      background: 'rgba(255, 255, 255, 0.35)',
    }}
  >
    <div style={{ fontSize: 12, color: '#1A1A1A', fontWeight: 500 }}>{label}</div>
    <NumberStepper value={value} min={min} max={max} step={step} onChange={onChange} />
  </div>
);

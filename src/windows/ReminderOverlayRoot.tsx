import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { emit } from '@tauri-apps/api/event';
import { commands, getCurrentWindow, listen } from '@/lib/tauri';

type ReminderOverlayPayload = {
  todayTotal: number;
  remaining: number;
};

const DEFAULT_PAYLOAD: ReminderOverlayPayload = {
  todayTotal: 300,
  remaining: 1700,
};

const AUTO_HIDE_MS = 20_000;
const SNOOZE_MS = 5 * 60 * 1000;

export default function ReminderOverlayRoot() {
  const [payload, setPayload] = useState<ReminderOverlayPayload>(DEFAULT_PAYLOAD);
  const [hovered, setHovered] = useState(false);
  const [busyAction, setBusyAction] = useState<'drink' | 'snooze' | 'skip' | null>(null);
  const hideTimerRef = useRef<number | null>(null);
  const reduceMotion = useReducedMotion();
  const win = useMemo(() => getCurrentWindow(), []);

  const clearHideTimer = () => {
    if (hideTimerRef.current !== null) {
      window.clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  };

  const hide = async () => {
    clearHideTimer();
    try {
      await win.hide();
    } catch (e) {
      console.error('[reminder-overlay] hide failed:', e);
    }
  };

  useEffect(() => {
    const unlisten = listen<ReminderOverlayPayload>('reminder-overlay-show', (event) => {
      setPayload({
        todayTotal: Math.max(0, event.payload.todayTotal),
        remaining: Math.max(0, event.payload.remaining),
      });
      setBusyAction(null);
    });

    return () => {
      unlisten.then((fn) => fn()).catch(() => {});
    };
  }, []);

  useEffect(() => {
    clearHideTimer();
    if (!hovered) {
      hideTimerRef.current = window.setTimeout(() => {
        void hide();
      }, AUTO_HIDE_MS);
    }
    return clearHideTimer;
  }, [hovered, payload.todayTotal, payload.remaining]);

  const openPopover = async () => {
    try {
      await emit('reminder-overlay-open-popover', {});
    } catch (e) {
      console.error('[reminder-overlay] open popover failed:', e);
    } finally {
      await hide();
    }
  };

  const drink = async () => {
    setBusyAction('drink');
    try {
      const settings = await commands.getSettings();
      const amount = Number(settings.cup_medium_ml ?? 300);
      await commands.addRecord(Number.isFinite(amount) && amount > 0 ? amount : 300, 'notification-action');
    } catch (e) {
      console.error('[reminder-overlay] add record failed:', e);
    } finally {
      await hide();
    }
  };

  const snooze = async () => {
    setBusyAction('snooze');
    try {
      await commands.setSetting('snooze_until', String(Date.now() + SNOOZE_MS));
    } catch (e) {
      console.error('[reminder-overlay] snooze failed:', e);
    } finally {
      await hide();
    }
  };

  const skip = async () => {
    setBusyAction('skip');
    await hide();
  };

  const goal = Math.max(1, payload.todayTotal + payload.remaining);
  const percent = Math.min(100, Math.round((payload.todayTotal / goal) * 100));

  return (
    <motion.main
      role="alertdialog"
      aria-label="Hydropace 喝水提醒"
      tabIndex={0}
      onClick={() => void openPopover()}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      initial={reduceMotion ? false : { opacity: 0, y: -18, scale: 0.96 }}
      animate={reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
      transition={{ type: 'spring', stiffness: 420, damping: 30 }}
      style={{
        width: '100vw',
        height: '100vh',
        padding: 10,
        display: 'grid',
        gridTemplateColumns: '78px 1fr',
        gap: 12,
        alignItems: 'center',
        color: '#17324D',
        border: '1px solid rgba(255,255,255,0.72)',
        borderRadius: 26,
        background:
          'linear-gradient(135deg, rgba(233,249,255,0.95), rgba(255,255,255,0.88) 56%, rgba(225,243,235,0.92))',
        boxShadow: '0 18px 46px rgba(38, 123, 173, 0.28), inset 0 1px 0 rgba(255,255,255,0.9)',
        cursor: 'pointer',
        overflow: 'hidden',
        fontFamily:
          '-apple-system, BlinkMacSystemFont, "SF Pro Display", system-ui, sans-serif',
      }}
    >
      <motion.div
        aria-hidden="true"
        animate={
          reduceMotion
            ? undefined
            : {
                y: [0, -4, 0],
              }
        }
        transition={{
          duration: 2.6,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
        style={{
          width: 70,
          height: 92,
          borderRadius: '42px 42px 48px 48px',
          background: 'linear-gradient(180deg, #78D7FF 0%, #2BAAE8 70%, #1676B7 100%)',
          boxShadow: 'inset 0 10px 16px rgba(255,255,255,0.42), 0 12px 24px rgba(43,170,232,0.35)',
          position: 'relative',
          display: 'grid',
          placeItems: 'center',
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: 19,
            left: 18,
            width: 12,
            height: 12,
            borderRadius: 999,
            background: '#083552',
            boxShadow: '23px 0 0 #083552',
          }}
        />
        <div
          style={{
            position: 'absolute',
            top: 48,
            left: 25,
            width: 20,
            height: 8,
            borderBottom: '3px solid #083552',
            borderRadius: '0 0 18px 18px',
          }}
        />
        <div
          style={{
            position: 'absolute',
            top: 9,
            left: 16,
            width: 18,
            height: 28,
            borderRadius: '999px',
            transform: 'rotate(28deg)',
            background: 'rgba(255,255,255,0.48)',
          }}
        />
      </motion.div>

      <section
        style={{
          minWidth: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: 9,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'start', justifyContent: 'space-between', gap: 8 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 17, fontWeight: 720, lineHeight: 1.15 }}>该喝水了</div>
            <div
              style={{
                marginTop: 4,
                fontSize: 12,
                color: '#496777',
                lineHeight: 1.35,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              今日 {payload.todayTotal} ml，还差 {payload.remaining} ml
            </div>
          </div>
          <div
            aria-label={`今日目标完成 ${percent}%`}
            style={{
              flex: '0 0 auto',
              minWidth: 44,
              padding: '5px 8px',
              borderRadius: 999,
              fontSize: 12,
              fontWeight: 700,
              color: '#0E6F9E',
              background: 'rgba(255,255,255,0.74)',
              textAlign: 'center',
            }}
          >
            {percent}%
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 46px', gap: 7 }}>
          <OverlayButton busy={busyAction === 'drink'} label="我喝了" onClick={drink} />
          <OverlayButton busy={busyAction === 'snooze'} label="5 分钟后" onClick={snooze} />
          <OverlayButton busy={busyAction === 'skip'} label="跳过" quiet onClick={skip} />
        </div>
      </section>
    </motion.main>
  );
}

function OverlayButton({
  busy,
  label,
  onClick,
  quiet,
}: {
  busy: boolean;
  label: string;
  onClick: () => Promise<void>;
  quiet?: boolean;
}) {
  return (
    <button
      type="button"
      aria-busy={busy}
      onClick={(event) => {
        event.stopPropagation();
        void onClick();
      }}
      disabled={busy}
      style={{
        minWidth: 0,
        height: 34,
        border: quiet ? '1px solid rgba(55,95,120,0.18)' : '1px solid rgba(23,119,166,0.22)',
        borderRadius: 13,
        color: quiet ? '#5C7280' : '#0A5B85',
        background: quiet ? 'rgba(255,255,255,0.52)' : 'rgba(255,255,255,0.82)',
        boxShadow: quiet ? 'none' : '0 6px 14px rgba(43,170,232,0.13)',
        cursor: busy ? 'wait' : 'pointer',
        fontSize: quiet ? 12 : 13,
        fontWeight: quiet ? 600 : 700,
        whiteSpace: 'nowrap',
      }}
    >
      {label}
    </button>
  );
}

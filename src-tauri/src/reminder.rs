// 智能提醒后台任务
//
// 启动后 spawn 一个 tokio 任务，循环：
//   1. 读 settings
//   2. 读 last_record / today_total / snooze_until / idle_seconds
//   3. should_remind() 判定
//   4. 命中 → notification::send_water_reminder()
//   5. sleep 60-90 分钟随机
//
// should_remind 拆出来作为纯函数（不读 DB），方便测试。

use std::collections::HashMap;
use std::time::Duration;

use serde::Serialize;
use tauri::{async_runtime, AppHandle, Manager};

use crate::commands;
use crate::db::{DbResult, DbState};
use crate::notification;
use crate::platform;

#[derive(Debug, Clone, Serialize)]
pub struct Settings {
    pub reminder_enabled: bool,
    pub weekend_enabled: bool,
    pub work_start: String,
    pub work_end: String,
    pub reminder_min_interval_min: u32,
    pub reminder_max_interval_min: u32,
    pub daily_goal_ml: i32,
    pub snooze_until: i64,
}

/// test_reminder 返回给前端的结果，让用户能看到"为什么没弹通知"
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TestReminderResult {
    pub notified: bool,
    pub message: String,
}

fn test_reminder_message(notified: bool) -> &'static str {
    if notified {
        "已弹出喝水提醒"
    } else {
        "提醒未弹出：请重启 App，或到 系统设置 → 通知 → Hydropace 检查权限"
    }
}

/// 纯函数：判定是否该发提醒
///
/// 入参全部是已读出的值（不查 DB），便于测试
pub fn should_remind(
    now_ms: i64,
    last_record_ms: Option<i64>,
    snooze_until_ms: i64,
    settings: &Settings,
    idle_seconds: u64,
    today_total_ml: i32,
) -> bool {
    if !settings.reminder_enabled {
        return false;
    }
    if now_ms < snooze_until_ms {
        return false;
    }
    if !is_work_hour_or_weekend(now_ms, settings) {
        return false;
    }
    if let Some(last) = last_record_ms {
        if now_ms - last < 30 * 60 * 1000 {
            return false;
        }
    }
    if today_total_ml >= settings.daily_goal_ml {
        return false;
    }
    // 离开较久（≥5min）不打扰；1min 太激进——去倒杯水回来就不提醒了
    if idle_seconds >= 300 {
        return false;
    }
    true
}

/// 判定 now 是否落在提醒时段内。
///
/// - 周末：weekend_enabled 关 → 直接 false；开 → 同样按 work_start/work_end 时段判定
///   （与设置页 hint "周六周日 9:00-18:00" 一致，不再全天提醒）
/// - 时段用数值（自午夜起的分钟数）比较，避免字符串字典序在非两位数时出错
/// - 支持跨日区间：若 end <= start（如 22:00-08:00），命中条件为 now >= start || now <= end
pub fn is_work_hour_or_weekend(now_ms: i64, settings: &Settings) -> bool {
    use chrono::{TimeZone, Timelike};

    let now = chrono::Local
        .timestamp_millis_opt(now_ms)
        .single()
        .unwrap_or_else(chrono::Local::now);

    let weekday = now.format("%A").to_string();
    let is_weekend = matches!(weekday.as_str(), "Saturday" | "Sunday");

    if is_weekend && !settings.weekend_enabled {
        return false;
    }

    let now_min = now.hour() * 60 + now.minute();
    in_time_window(now_min, &settings.work_start, &settings.work_end)
}

/// "HH:MM" → 自午夜起的分钟数（合法则 Some，否则 None）
fn parse_hhmm(s: &str) -> Option<u32> {
    let (h, m) = s.split_once(':')?;
    let h: u32 = h.parse().ok()?;
    let m: u32 = m.parse().ok()?;
    if h < 24 && m < 60 {
        Some(h * 60 + m)
    } else {
        None
    }
}

/// now_min 是否落在 [start, end] 时段内（支持跨日：end <= start 时为跨夜区间）
fn in_time_window(now_min: u32, start_str: &str, end_str: &str) -> bool {
    let start = parse_hhmm(start_str).unwrap_or(9 * 60); // 默认 09:00
    let end = parse_hhmm(end_str).unwrap_or(18 * 60); // 默认 18:00
    if end <= start {
        // 跨日：22:00-08:00 → now >= 22:00 或 now <= 08:00
        now_min >= start || now_min <= end
    } else {
        // 同日：09:00-18:00
        now_min >= start && now_min <= end
    }
}

/// 从 DB 读 settings + 解析成结构体
fn load_settings(app: &AppHandle) -> Result<Settings, crate::db::DbError> {
    let db = app.state::<DbState>();
    let raw: HashMap<String, String> = commands::get_settings(db)?;

    Ok(Settings {
        reminder_enabled: parse_bool(&raw, "reminder_enabled", true),
        weekend_enabled: parse_bool(&raw, "weekend_enabled", true),
        work_start: parse_str(&raw, "work_start", "09:00"),
        work_end: parse_str(&raw, "work_end", "18:00"),
        reminder_min_interval_min: parse_u32(&raw, "reminder_min_interval_min", 60),
        reminder_max_interval_min: parse_u32(&raw, "reminder_max_interval_min", 90),
        daily_goal_ml: parse_i32(&raw, "daily_goal_ml", 2000),
        snooze_until: parse_i64(&raw, "snooze_until", 0),
    })
}

fn parse_bool(m: &HashMap<String, String>, k: &str, default: bool) -> bool {
    m.get(k).map(|s| s == "true").unwrap_or(default)
}
fn parse_str(m: &HashMap<String, String>, k: &str, default: &str) -> String {
    m.get(k).cloned().unwrap_or_else(|| default.to_string())
}
fn parse_u32(m: &HashMap<String, String>, k: &str, default: u32) -> u32 {
    m.get(k).and_then(|s| s.parse().ok()).unwrap_or(default)
}
fn parse_i32(m: &HashMap<String, String>, k: &str, default: i32) -> i32 {
    m.get(k).and_then(|s| s.parse().ok()).unwrap_or(default)
}
fn parse_i64(m: &HashMap<String, String>, k: &str, default: i64) -> i64 {
    m.get(k).and_then(|s| s.parse().ok()).unwrap_or(default)
}

/// 手动触发一次提醒（设置页"测试提醒"按钮调用）
///
/// 不受 should_remind 各条件限制。返回结构化结果，前端据此提示
/// "已发送" / "权限未开" 等状态——避免通知静默失败时用户无从排查。
#[tauri::command]
pub fn test_reminder(app: AppHandle) -> DbResult<TestReminderResult> {
    let settings = load_settings(&app)?;
    let total = {
        let db = app.state::<DbState>();
        commands::get_today_total(db).unwrap_or(0)
    };
    let remaining = (settings.daily_goal_ml - total).max(0);
    let notified = notification::send_water_reminder(&app, total, remaining);
    let message = test_reminder_message(notified).to_string();
    Ok(TestReminderResult { notified, message })
}

/// 启动后台循环（tauri::async_runtime::spawn，fire-and-forget）
///
/// 用 Tauri 2 的 async_runtime（内部 tokio + 自动 init），不用直接 tokio::spawn
/// （Tauri 2 默认不启动 tokio runtime，直接调会 panic "no reactor running"）
pub fn start_loop(app: AppHandle) {
    async_runtime::spawn(async move {
        #[cfg(debug_assertions)]
        eprintln!("[reminder] background loop started, first check in 60s");
        // 启动后等 60s（避免启动就弹通知）
        tokio::time::sleep(Duration::from_secs(60)).await;

        loop {
            // 1. 读 settings
            let settings = match load_settings(&app) {
                Ok(s) => s,
                Err(e) => {
                    eprintln!("[reminder] load_settings failed: {e}");
                    tokio::time::sleep(Duration::from_secs(60)).await;
                    continue;
                }
            };

            // 2. 读 last_record / today_total
            let last_record_ms = {
                let db = app.state::<DbState>();
                commands::get_last_record(db).ok().flatten().map(|r| r.timestamp)
            };
            let today_total_ml = {
                let db = app.state::<DbState>();
                commands::get_today_total(db).unwrap_or(0)
            };

            let now_ms = chrono::Utc::now().timestamp_millis();
            let idle_seconds = platform::get_idle_seconds();

            // 3. 判定
            let will_remind = should_remind(
                now_ms,
                last_record_ms,
                settings.snooze_until,
                &settings,
                idle_seconds,
                today_total_ml,
            );
            #[cfg(debug_assertions)]
            eprintln!(
                "[reminder] check: total={today_total_ml}/{}, last_record={last_record_ms:?}, \
                 snooze_until={}, idle={idle_seconds}s, in_window={} → will_remind={will_remind}",
                settings.daily_goal_ml,
                settings.snooze_until,
                is_work_hour_or_weekend(now_ms, &settings),
            );
            if will_remind {
                let goal = settings.daily_goal_ml;
                let remaining = (goal - today_total_ml).max(0);
                #[cfg(not(debug_assertions))]
                let _ = notification::send_water_reminder(&app, today_total_ml, remaining);
                #[cfg(debug_assertions)]
                let ok = notification::send_water_reminder(&app, today_total_ml, remaining);
                #[cfg(debug_assertions)]
                eprintln!("[reminder] sent reminder, notified={ok}");
            }

            // 4. 随机 sleep 60-90 分钟
            let min = settings.reminder_min_interval_min.max(1);
            let max = settings.reminder_max_interval_min.max(min);
            // rand 0.10 API: random_range 是顶层函数（替换 0.8 的 thread_rng().gen_range）
            let interval_min = rand::random_range(min..=max);
            tokio::time::sleep(Duration::from_secs(interval_min as u64 * 60)).await;
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::TimeZone;

    fn monday_10am_ms() -> i64 {
        chrono::Local
            .with_ymd_and_hms(2026, 6, 29, 10, 0, 0)
            .single()
            .expect("valid local test time")
            .timestamp_millis()
    }

    fn base_settings() -> Settings {
        Settings {
            reminder_enabled: true,
            weekend_enabled: false,
            work_start: "09:00".to_string(),
            work_end: "18:00".to_string(),
            reminder_min_interval_min: 60,
            reminder_max_interval_min: 90,
            daily_goal_ml: 2000,
            snooze_until: 0,
        }
    }

    #[test]
    fn should_remind_when_enabled_in_work_hours_under_goal_and_active() {
        let now = monday_10am_ms();
        let settings = base_settings();

        assert!(should_remind(now, None, 0, &settings, 0, 500));
    }

    #[test]
    fn should_not_remind_when_disabled_snoozed_recently_recorded_idle_or_goal_met() {
        let now = monday_10am_ms();

        let mut disabled = base_settings();
        disabled.reminder_enabled = false;
        assert!(!should_remind(now, None, 0, &disabled, 0, 500));

        let settings = base_settings();
        assert!(!should_remind(now, None, now + 1, &settings, 0, 500));
        assert!(!should_remind(now, Some(now - 10 * 60 * 1000), 0, &settings, 0, 500));
        // idle 阈值 300s：60s 仍提醒，300s 不提醒
        assert!(should_remind(now, None, 0, &settings, 60, 500));
        assert!(!should_remind(now, None, 0, &settings, 300, 500));
        assert!(!should_remind(now, None, 0, &settings, 0, 2000));
    }

    fn monday_ms(hour: u32, min: u32) -> i64 {
        chrono::Local
            .with_ymd_and_hms(2026, 6, 29, hour, min, 0)
            .single()
            .expect("valid local test time")
            .timestamp_millis()
    }

    #[test]
    fn time_window_same_day_09_to_18() {
        let settings = base_settings();
        // 工作日，时段内命中
        assert!(is_work_hour_or_weekend(monday_ms(10, 0), &settings));
        assert!(is_work_hour_or_weekend(monday_ms(9, 0), &settings));
        assert!(is_work_hour_or_weekend(monday_ms(18, 0), &settings));
        // 时段外不命中
        assert!(!is_work_hour_or_weekend(monday_ms(8, 59), &settings));
        assert!(!is_work_hour_or_weekend(monday_ms(18, 1), &settings));
    }

    #[test]
    fn time_window_overnight_22_to_08() {
        let mut settings = base_settings();
        settings.work_start = "22:00".to_string();
        settings.work_end = "08:00".to_string();
        // 跨夜：晚上和凌晨命中，白天不命中
        assert!(is_work_hour_or_weekend(monday_ms(23, 0), &settings));
        assert!(is_work_hour_or_weekend(monday_ms(2, 0), &settings));
        assert!(is_work_hour_or_weekend(monday_ms(22, 0), &settings));
        assert!(is_work_hour_or_weekend(monday_ms(8, 0), &settings));
        // 白天（时段外）不命中
        assert!(!is_work_hour_or_weekend(monday_ms(10, 0), &settings));
        assert!(!is_work_hour_or_weekend(monday_ms(21, 59), &settings));
    }

    #[test]
    fn parse_hhmm_valid_and_invalid() {
        assert_eq!(parse_hhmm("09:00"), Some(540));
        assert_eq!(parse_hhmm("00:00"), Some(0));
        assert_eq!(parse_hhmm("23:59"), Some(1439));
        assert_eq!(parse_hhmm("9:0"), Some(540)); // 非两位数也能解析
        assert_eq!(parse_hhmm("24:00"), None);
        assert_eq!(parse_hhmm("09:60"), None);
        assert_eq!(parse_hhmm("garbage"), None);
    }

    #[test]
    fn test_reminder_message_matches_overlay_first_behavior() {
        assert_eq!(test_reminder_message(true), "已弹出喝水提醒");
        assert!(test_reminder_message(false).contains("提醒未弹出"));
        assert!(test_reminder_message(false).contains("Hydropace"));
    }
}

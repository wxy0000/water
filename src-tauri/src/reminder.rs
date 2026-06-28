// 智能提醒后台任务（05 阶段）
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
use crate::db::DbState;
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
    if idle_seconds >= 60 {
        return false;
    }
    true
}

/// 工作日按 work_start/work_end 判定；周末按 weekend_enabled
pub fn is_work_hour_or_weekend(now_ms: i64, settings: &Settings) -> bool {
    use chrono::TimeZone;

    let now = chrono::Local
        .timestamp_millis_opt(now_ms)
        .single()
        .unwrap_or_else(chrono::Local::now);

    let weekday = now.format("%A").to_string();
    let is_weekend = matches!(weekday.as_str(), "Saturday" | "Sunday");

    if is_weekend {
        return settings.weekend_enabled;
    }

    let now_hms = now.format("%H:%M").to_string();
    now_hms.as_str() >= settings.work_start.as_str()
        && now_hms.as_str() <= settings.work_end.as_str()
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

/// 启动后台循环（tauri::async_runtime::spawn，fire-and-forget）
///
/// 用 Tauri 2 的 async_runtime（内部 tokio + 自动 init），不用直接 tokio::spawn
/// （Tauri 2 默认不启动 tokio runtime，直接调会 panic "no reactor running"）
pub fn start_loop(app: AppHandle) {
    async_runtime::spawn(async move {
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
            if should_remind(
                now_ms,
                last_record_ms,
                settings.snooze_until,
                &settings,
                idle_seconds,
                today_total_ml,
            ) {
                let goal = settings.daily_goal_ml;
                let remaining = (goal - today_total_ml).max(0);
                notification::send_water_reminder(&app, today_total_ml, remaining);
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
        assert!(!should_remind(now, None, 0, &settings, 60, 500));
        assert!(!should_remind(now, None, 0, &settings, 0, 2000));
    }
}

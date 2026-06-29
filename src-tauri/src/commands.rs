// Tauri commands（03 阶段）
//
// 所有命令都返回 Result<T, DbError>，Tauri 自动转成 JS Error：
// - 前端 invoke() 失败时拿到 Error 对象，message 字段是 #[error(...)] 的格式
// - 单事件 'today-changed'（payload {}）：add_record / undo_last 触发 → tray 数字刷新
// - 字段全部 #[serde(rename_all = "camelCase")]，前端用驼峰

use crate::db::{DbResult, DbState};
use chrono::Local;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use tauri::{AppHandle, Emitter, State};

// ===== DTOs =====

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Record {
    pub id: i64,
    pub timestamp: i64,
    pub amount_ml: i32,
    pub source: String,
}

// ===== Records =====

#[tauri::command]
pub fn add_record(
    app: AppHandle,
    db: State<DbState>,
    amount: i32,
    source: String,
) -> DbResult<i64> {
    let now = chrono::Utc::now().timestamp_millis();
    let id = db.with_lock(|conn| {
        conn.execute(
            "INSERT INTO records (timestamp, amount_ml, source) VALUES (?1, ?2, ?3)",
            rusqlite::params![now, amount, source],
        )?;
        Ok(conn.last_insert_rowid())
    })?;
    let _ = app.emit("today-changed", ());
    Ok(id)
}

#[tauri::command]
pub fn get_today_total(db: State<DbState>) -> DbResult<i32> {
    let start = start_of_today_ms();
    db.with_lock(|conn| {
        let total: i32 = conn.query_row(
            "SELECT COALESCE(SUM(amount_ml), 0) FROM records WHERE timestamp >= ?1",
            rusqlite::params![start],
            |row| row.get(0),
        )?;
        Ok(total)
    })
}

#[tauri::command]
pub fn get_last_record(db: State<DbState>) -> DbResult<Option<Record>> {
    db.with_lock(|conn| {
        let mut stmt = conn.prepare(
            "SELECT id, timestamp, amount_ml, source FROM records ORDER BY timestamp DESC LIMIT 1",
        )?;
        let mut rows = stmt.query([])?;
        if let Some(row) = rows.next()? {
            Ok(Some(Record {
                id: row.get(0)?,
                timestamp: row.get(1)?,
                amount_ml: row.get(2)?,
                source: row.get(3)?,
            }))
        } else {
            Ok(None)
        }
    })
}

#[tauri::command]
pub fn undo_last(app: AppHandle, db: State<DbState>) -> DbResult<()> {
    db.with_lock(|conn| {
        conn.execute(
            "DELETE FROM records WHERE id = (SELECT id FROM records ORDER BY timestamp DESC LIMIT 1)",
            [],
        )?;
        Ok(())
    })?;
    let _ = app.emit("today-changed", ());
    Ok(())
}

/// 今日全部记录（倒序）。供面板历史列表展示
#[tauri::command]
pub fn get_today_records(db: State<DbState>) -> DbResult<Vec<Record>> {
    let start = start_of_today_ms();
    db.with_lock(|conn| {
        let mut stmt = conn.prepare(
            "SELECT id, timestamp, amount_ml, source FROM records \
             WHERE timestamp >= ?1 ORDER BY timestamp DESC, id DESC",
        )?;
        let rows = stmt.query_map(rusqlite::params![start], |row| {
            Ok(Record {
                id: row.get(0)?,
                timestamp: row.get(1)?,
                amount_ml: row.get(2)?,
                source: row.get(3)?,
            })
        })?;
        let mut out = Vec::new();
        for r in rows {
            out.push(r?);
        }
        Ok(out)
    })
}

/// 删除指定 id 的记录（面板历史列表逐条删除）
#[tauri::command]
pub fn delete_record(app: AppHandle, db: State<DbState>, id: i64) -> DbResult<()> {
    db.with_lock(|conn| {
        conn.execute("DELETE FROM records WHERE id = ?1", rusqlite::params![id])?;
        Ok(())
    })?;
    let _ = app.emit("today-changed", ());
    Ok(())
}

// ===== Settings =====

#[tauri::command]
pub fn get_settings(db: State<DbState>) -> DbResult<HashMap<String, String>> {
    db.with_lock(|conn| {
        let mut stmt = conn.prepare("SELECT key, value FROM settings")?;
        let rows = stmt.query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })?;
        let mut map = HashMap::new();
        for r in rows {
            let (k, v) = r?;
            map.insert(k, v);
        }
        Ok(map)
    })
}

#[tauri::command]
pub fn set_setting(app: AppHandle, db: State<DbState>, key: String, value: String) -> DbResult<()> {
    db.with_lock(|conn| {
        conn.execute(
            "INSERT OR REPLACE INTO settings (key, value) VALUES (?1, ?2)",
            rusqlite::params![key, value],
        )?;
        Ok(())
    })?;
    // 06 阶段：emit 让 tray / widget / popover 实时刷新（如 dailyGoal 变化后 tray 数字重算）
    let _ = app.emit("settings-changed", (&key, &value));
    Ok(())
}

// ===== Data Management（06 阶段）=====

#[tauri::command]
pub fn clear_today(app: AppHandle, db: State<DbState>) -> DbResult<()> {
    let start = start_of_today_ms();
    db.with_lock(|conn| {
        conn.execute(
            "DELETE FROM records WHERE timestamp >= ?1",
            rusqlite::params![start],
        )?;
        Ok(())
    })?;
    let _ = app.emit("today-changed", ());
    Ok(())
}

#[tauri::command]
pub fn clear_all(app: AppHandle, db: State<DbState>) -> DbResult<()> {
    db.with_lock(|conn| {
        conn.execute("DELETE FROM records", [])?;
        Ok(())
    })?;
    let _ = app.emit("today-changed", ());
    Ok(())
}

// ===== Trend (07 阶段) =====

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DailyTotal {
    /// YYYY-MM-DD 字符串（本地时区）
    pub date: String,
    pub total_ml: i32,
}

#[tauri::command]
pub fn get_weekly_totals(db: State<DbState>) -> DbResult<Vec<DailyTotal>> {
    use chrono::Local;
    let now = Local::now();
    let today = now.date_naive();

    // 7 天：今天 + 前 6 天
    let days: Vec<chrono::NaiveDate> = (0..7)
        .rev()
        .map(|i| today - chrono::Duration::days(i))
        .collect();

    db.with_lock(|conn| {
        let mut out: Vec<DailyTotal> = Vec::with_capacity(7);
        for day in &days {
            let start_local = day.and_hms_opt(0, 0, 0).expect("midnight");
            let end_local = day.and_hms_opt(23, 59, 59).expect("end of day");
            let start_ms = start_local
                .and_local_timezone(Local)
                .unwrap()
                .timestamp_millis();
            let end_ms = end_local
                .and_local_timezone(Local)
                .unwrap()
                .timestamp_millis();
            let total: i32 = conn.query_row(
                "SELECT COALESCE(SUM(amount_ml), 0) FROM records WHERE timestamp >= ?1 AND timestamp <= ?2",
                rusqlite::params![start_ms, end_ms],
                |row| row.get(0),
            )?;
            out.push(DailyTotal {
                date: day.format("%Y-%m-%d").to_string(),
                total_ml: total,
            });
        }
        Ok(out)
    })
}

// ===== Widget =====

#[tauri::command]
pub fn get_widget_pos(db: State<DbState>) -> DbResult<(i32, i32)> {
    db.with_lock(|conn| {
        let (x, y): (i32, i32) = conn.query_row(
            "SELECT x, y FROM widget_state WHERE id = 1",
            [],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )?;
        Ok((x, y))
    })
}

#[tauri::command]
pub fn save_widget_pos(db: State<DbState>, x: i32, y: i32) -> DbResult<()> {
    db.with_lock(|conn| {
        conn.execute(
            "UPDATE widget_state SET x = ?1, y = ?2 WHERE id = 1",
            rusqlite::params![x, y],
        )?;
        Ok(())
    })
}

#[tauri::command]
pub fn set_widget_visible(db: State<DbState>, visible: bool) -> DbResult<()> {
    let v: i32 = if visible { 1 } else { 0 };
    db.with_lock(|conn| {
        conn.execute(
            "UPDATE widget_state SET visible = ?1 WHERE id = 1",
            rusqlite::params![v],
        )?;
        Ok(())
    })
}

// ===== Helpers =====

/// 本地时区今天 0 点的毫秒时间戳
fn start_of_today_ms() -> i64 {
    let now = Local::now();
    let midnight = now
        .date_naive()
        .and_hms_opt(0, 0, 0)
        .expect("midnight is always valid");
    midnight
        .and_local_timezone(Local)
        .unwrap()
        .timestamp_millis()
}

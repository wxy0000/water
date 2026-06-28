// L01 Water App — Tauri 2 入口
//
// 02 阶段：tray 图标
// 03 阶段：数据库 + commands + 事件订阅
// 04/05 阶段：popover / widget 窗口 / 智能提醒

mod commands;
mod db;
mod notification;
mod platform;
mod popover;
mod reminder;
mod settings;
mod tray;
mod widget;

use tauri::{Listener, Manager};
use tauri_plugin_notification::NotificationExt;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_log::Builder::default().build())
        .plugin(tauri_plugin_notification::init())
        .setup(|app| {
            // 03 阶段：初始化数据库
            let app_data_dir = app.path().app_data_dir().map_err(|e| {
                tauri::Error::from(std::io::Error::new(
                    std::io::ErrorKind::NotFound,
                    format!("app_data_dir: {e}"),
                ))
            })?;
            let db_state = db::DbState::init(&app_data_dir)?;
            app.manage(db_state);

            // 02 阶段：菜单栏图标
            tray::init(app.handle())?;

            // 04 阶段：popover 窗口（紧贴 tray）+ widget 窗口（桌面浮窗）
            popover::init(app.handle())?;
            widget::init(app.handle())?;

            // 06 阶段：设置窗口
            settings::init(app.handle())?;

            // 03 阶段：用 DB 真实数据刷一次 tray 数字（之前是硬编码 0%）
            refresh_tray_from_db(app.handle());

            // 03 阶段：订阅 today-changed 事件（add_record / undo_last 触发）
            let handle = app.handle().clone();
            app.listen("today-changed", move |_event| {
                refresh_tray_from_db(&handle);
            });

            // 07 阶段：settings 改 widget_visible → 立即显隐 widget
            // Rust 端已经存了 widget_visible 字符串到 settings 表，
            // 需要从 DB 读再 compare —— 简单做法：每次 setSetting emit 后都查一次当前值
            let handle = app.handle().clone();
            app.listen("settings-changed", move |event| {
                // payload 是 JSON 字符串，需要 serde_json::from_str 解析
                // emit 的 payload 是 (&key, &value) 序列化成 ["key", "value"]
                if let Ok((key, value)) =
                    serde_json::from_str::<(String, String)>(event.payload())
                {
                    if key == "widget_visible" {
                        widget::set_visible(&handle, value == "true");
                    }
                    if key == "daily_goal_ml" {
                        refresh_tray_from_db(&handle);
                    }
                }
            });

            // 04 阶段：widget 单击 → 通知 Rust 开 popover
            let handle = app.handle().clone();
            app.listen("widget-clicked", move |_event| {
                popover::show(&handle);
            });

            // 06 阶段：tray / 其它来源触发 → 开设置窗口
            let handle = app.handle().clone();
            app.listen("open-settings", move |_event| {
                settings::show(&handle);
            });

            // 05 阶段：申请通知权限 + 启动 reminder 后台循环
            #[cfg(target_os = "macos")]
            {
                use tauri_plugin_notification::PermissionState;
                match app.notification().request_permission() {
                    Ok(PermissionState::Granted) => {}
                    Ok(other) => eprintln!("[setup] notification permission: {other:?}"),
                    Err(e) => eprintln!("[setup] permission request err: {e}"),
                }
            }
            reminder::start_loop(app.handle().clone());

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::add_record,
            commands::get_today_total,
            commands::get_last_record,
            commands::undo_last,
            commands::get_settings,
            commands::set_setting,
            commands::get_widget_pos,
            commands::save_widget_pos,
            commands::set_widget_visible,
            commands::clear_today,
            commands::clear_all,
            commands::get_weekly_totals,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

/// 从 DB 读今日总量 + 从 settings 读 daily_goal_ml → 算百分比 → 更新 tray
fn refresh_tray_from_db<R: tauri::Runtime>(app: &tauri::AppHandle<R>) {
    let state = app.state::<db::DbState>();
    let total = match commands::get_today_total(state.clone()) {
        Ok(t) => t,
        Err(e) => {
            eprintln!("[tray] refresh: get_today_total failed: {e}");
            return;
        }
    };
    // 07 阶段：从 settings.daily_goal_ml 读（不再 hardcode 2000）
    let goal: i32 = commands::get_settings(state)
        .ok()
        .and_then(|m| m.get("daily_goal_ml").cloned())
        .and_then(|s| s.parse().ok())
        .unwrap_or(2000);
    let pct = ((total as f64 / goal as f64) * 100.0) as u32;
    tray::set_tray_count(app, pct.min(100), total, goal);
}

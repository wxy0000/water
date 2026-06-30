// Hydropace — Tauri 2 入口

mod commands;
mod db;
mod notification;
mod app_menu;
mod platform;
mod popover;
mod reminder;
mod reminder_overlay;
mod settings;
mod tray;
mod widget;

#[cfg(target_os = "macos")]
mod native_notify;

use tauri::{Listener, Manager};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
        .setup(|app| {
            // 初始化数据库
            let app_data_dir = app.path().app_data_dir().map_err(|e| {
                tauri::Error::from(std::io::Error::new(
                    std::io::ErrorKind::NotFound,
                    format!("app_data_dir: {e}"),
                ))
            })?;
            let db_state = db::DbState::init(&app_data_dir)?;
            app.manage(db_state);

            // 菜单栏图标
            tray::init(app.handle())?;

            // Popover 窗口 + 桌面浮窗 + 自控提醒浮层
            popover::init(app.handle())?;
            widget::init(app.handle())?;
            reminder_overlay::init(app.handle())?;

            // 设置窗口
            settings::init(app.handle())?;
            app_menu::init(app)?;

            // 用 DB 真实数据刷一次 tray 数字
            refresh_tray_from_db(app.handle());

            // 订阅 today-changed 事件，刷新 tray 数字。
            let handle = app.handle().clone();
            app.listen("today-changed", move |_event| {
                refresh_tray_from_db(&handle);
            });

            // 设置变化会影响 widget 显隐和 tray 进度。
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

            // widget 单击 → 打开 popover
            let handle = app.handle().clone();
            app.listen("widget-clicked", move |_event| {
                popover::show(&handle);
            });

            // reminder overlay 主体点击 → 打开 popover，并收起 overlay
            let handle = app.handle().clone();
            app.listen("reminder-overlay-open-popover", move |_event| {
                reminder_overlay::hide(&handle);
                popover::show(&handle);
            });

            // tray / App 菜单触发 → 开设置窗口
            let handle = app.handle().clone();
            app.listen("open-settings", move |_event| {
                settings::show(&handle);
            });

            // 申请通知权限 + 启动 reminder 后台循环
            #[cfg(target_os = "macos")]
            {
                // 原生 UNUserNotificationCenter：注册 delegate/category（前台弹横幅 + 动作按钮），
                // 并申请 alert|sound|badge 权限。
                native_notify::setup(app.handle());
            }
            reminder::start_loop(app.handle().clone());

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::add_record,
            commands::get_today_total,
            commands::get_last_record,
            commands::get_today_records,
            commands::undo_last,
            commands::delete_record,
            commands::get_settings,
            commands::set_setting,
            commands::clear_today,
            commands::clear_all,
            commands::get_weekly_totals,
            reminder::test_reminder,
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
    // 从 settings.daily_goal_ml 读目标，避免设置改了 tray 仍按 2000 计算。
    let goal: i32 = commands::get_settings(state)
        .ok()
        .and_then(|m| m.get("daily_goal_ml").cloned())
        .and_then(|s| s.parse().ok())
        .unwrap_or(2000);
    let pct = ((total as f64 / goal as f64) * 100.0) as u32;
    tray::set_tray_count(app, pct.min(100), total, goal);
}

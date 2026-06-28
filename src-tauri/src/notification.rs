// 系统通知（05 阶段）
//
// MVP 妥协：
// - 系统通知用 tauri-plugin-notification 显示，**没有**真正的 action buttons
//   （plugin 2.3 不支持 actions，要 UNUserNotificationCenter 私有 API；06+ 阶段再说）
// - 通知发出后，emit('notification-pending', payload) 给 popover
// - popover 顶部显示 banner 模拟"我喝了 / 5min / 跳过" 3 个按钮
// - 用户在 popover 里点按钮 → 处理 + 关 banner
//
// 这样验收 05 阶段 5 个 action 行为（我喝了/5min/跳过）能在 popover 内完整跑通。

use serde::Serialize;
use tauri::{AppHandle, Emitter};
use tauri_plugin_notification::NotificationExt;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NotificationPayload {
    pub today_total: i32,
    pub remaining: i32,
}

/// 发送"该喝水了"通知 + emit event 给 popover 显示 banner
pub fn send_water_reminder(app: &AppHandle, today_total: i32, remaining: i32) {
    let body = format!("今天已经 {} ml，还差 {} ml", today_total, remaining);

    // 系统通知
    let _ = app
        .notification()
        .builder()
        .title("该喝水了 💧")
        .body(&body)
        .show();

    // emit event：让 popover 顶部显示 banner
    let _ = app.emit(
        "notification-pending",
        NotificationPayload {
            today_total,
            remaining,
        },
    );
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn notification_payload_serializes_for_typescript_consumers() {
        let payload = NotificationPayload {
            today_total: 300,
            remaining: 1700,
        };

        let value = serde_json::to_value(payload).expect("payload serializes");

        assert_eq!(value.get("todayTotal"), Some(&serde_json::json!(300)));
        assert_eq!(value.get("remaining"), Some(&serde_json::json!(1700)));
        assert!(value.get("today_total").is_none());
    }
}

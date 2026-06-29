// 系统通知（05 阶段）
//
// macOS 桌面端走 native_notify.rs 的 UNUserNotificationCenter delegate：
// - 普通提醒直接弹系统横幅，不再通过 popover banner 模拟
// - 通知主体点击 → 打开 popover
// - "我喝了" → 记录 1 杯，不主动打开 popover
// - "5 分钟后" → 写 snooze_until
// - "跳过" → 关闭通知，不改状态

use tauri::AppHandle;
use tauri_plugin_notification::{NotificationExt, PermissionState};

/// 发送"该喝水了"系统通知。
///
/// 返回 true = 系统通知已提交；false = 权限未授予或 show 报错（不再静默吞掉）。
/// 调用方可据此给用户反馈（如 test_reminder 把结果回传前端）。
pub fn send_water_reminder(app: &AppHandle, today_total: i32, remaining: i32) -> bool {
    let body = format!("今天已经 {} ml，还差 {} ml", today_total, remaining);
    let title = "该喝水了 💧";

    #[cfg(target_os = "macos")]
    let notified = {
        // macOS 优先走 native_notify（delegate 处理前台横幅和动作按钮）
        let native_ok = crate::native_notify::send(app, title, &body);
        if native_ok {
            true
        } else {
            send_with_tauri_plugin(app, title, &body)
        }
    };
    #[cfg(not(target_os = "macos"))]
    let notified = {
        // 其他平台用 plugin（无前台抑制问题）
        send_with_tauri_plugin(app, title, &body)
    };
    notified
}

fn send_with_tauri_plugin(app: &AppHandle, title: &str, body: &str) -> bool {
    if matches!(
        app.notification().permission_state(),
        Ok(PermissionState::Prompt | PermissionState::PromptWithRationale)
    ) {
        if let Err(e) = app.notification().request_permission() {
            eprintln!("[notification] request permission failed: {e}");
        }
    }

    let granted = matches!(app.notification().permission_state(), Ok(PermissionState::Granted));
    if !granted {
        eprintln!("[notification] permission not granted");
        return false;
    }

    match app
        .notification()
        .builder()
        .title(title)
        .body(body)
        .sound("default")
        .show()
    {
        Ok(()) => true,
        Err(e) => {
            eprintln!("[notification] show failed: {e}");
            false
        }
    }
}

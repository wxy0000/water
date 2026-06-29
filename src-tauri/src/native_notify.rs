// macOS 原生通知
//
// Tauri notification 插件的 Rust desktop builder 只稳定覆盖普通通知。
// 这里用 UserNotifications.framework 投递真正的系统提醒：
// - app 前台时也展示系统横幅
// - 通知正文点击才打开 popover
// - "我喝了" 只记录 300 ml，不主动弹出面板
// - "5 分钟后" 写 snooze_until
// - "跳过" / 关闭通知不改状态

#![cfg(target_os = "macos")]

use std::ffi::CStr;
use std::os::raw::c_char;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Once, OnceLock};
use tauri::{AppHandle, Manager};

use crate::db::DbState;
use crate::{commands, popover};

static SETUP: Once = Once::new();
static APP_HANDLE: OnceLock<AppHandle> = OnceLock::new();
static NATIVE_NOTIFICATIONS_AVAILABLE: AtomicBool = AtomicBool::new(true);

const SNOOZE_5_MIN_MS: i64 = 5 * 60 * 1000;

extern "C" {
    fn hydropace_native_notify_setup() -> bool;
    fn hydropace_native_notify_send(title: *const c_char, body: *const c_char) -> bool;
}

/// 启动时调一次：注册 UNUserNotificationCenter delegate、category 和权限请求。
pub fn setup(app: &AppHandle) {
    let _ = APP_HANDLE.set(app.clone());

    SETUP.call_once(|| {
        let ok = unsafe { hydropace_native_notify_setup() };
        if !ok {
            eprintln!("[native-notify] UNUserNotificationCenter setup failed; using plugin fallback");
        }
    });
}

/// 发送一条系统通知。返回 true 表示已经交给 macOS 通知中心排队。
pub fn send(app: &AppHandle, title: &str, body: &str) -> bool {
    setup(app);

    if !native_notifications_available() {
        eprintln!("[native-notify] unavailable after authorization failure");
        return false;
    }

    let title = match std::ffi::CString::new(title) {
        Ok(s) => s,
        Err(_) => return false,
    };
    let body = match std::ffi::CString::new(body) {
        Ok(s) => s,
        Err(_) => return false,
    };

    match app.run_on_main_thread(move || unsafe {
        if !hydropace_native_notify_send(title.as_ptr(), body.as_ptr()) {
            eprintln!("[native-notify] UNUserNotificationCenter send failed");
        }
    }) {
        Ok(()) => true,
        Err(e) => {
            eprintln!("[native-notify] schedule on main thread failed: {e}");
            false
        }
    }
}

#[no_mangle]
pub extern "C" fn hydropace_notification_authorization_changed(granted: bool) {
    set_native_notifications_available(granted);
}

/// Objective-C delegate 回调入口。
#[no_mangle]
pub extern "C" fn hydropace_notification_action(action: *const c_char) {
    if action.is_null() {
        return;
    }

    let action = unsafe { CStr::from_ptr(action).to_string_lossy().into_owned() };
    let Some(action) = NotificationAction::from_identifier(&action) else {
        eprintln!("[native-notify] unknown action ignored: {action}");
        return;
    };
    handle_action(action);
}

fn native_notifications_available() -> bool {
    NATIVE_NOTIFICATIONS_AVAILABLE.load(Ordering::SeqCst)
}

fn set_native_notifications_available(available: bool) {
    NATIVE_NOTIFICATIONS_AVAILABLE.store(available, Ordering::SeqCst);
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum NotificationAction {
    OpenPopover,
    Drink,
    Snooze,
    Skip,
}

impl NotificationAction {
    fn from_identifier(identifier: &str) -> Option<Self> {
        match identifier {
            "open" => Some(Self::OpenPopover),
            "drink" => Some(Self::Drink),
            "snooze" => Some(Self::Snooze),
            "skip" => Some(Self::Skip),
            _ => None,
        }
    }
}

fn handle_action(action: NotificationAction) {
    let Some(app) = APP_HANDLE.get().cloned() else {
        eprintln!("[native-notify] action ignored: app handle not initialized");
        return;
    };

    let _ = app.clone().run_on_main_thread(move || match action {
        NotificationAction::OpenPopover => {
            popover::show(&app);
        }
        NotificationAction::Drink => {
            let db = app.state::<DbState>();
            if let Err(e) = commands::add_record(
                app.clone(),
                db,
                300,
                "notification-action".to_string(),
            ) {
                eprintln!("[native-notify] add notification record failed: {e}");
            }
        }
        NotificationAction::Snooze => {
            let until = chrono::Utc::now().timestamp_millis() + SNOOZE_5_MIN_MS;
            let db = app.state::<DbState>();
            if let Err(e) = commands::set_setting(
                app.clone(),
                db,
                "snooze_until".to_string(),
                until.to_string(),
            ) {
                eprintln!("[native-notify] snooze failed: {e}");
            }
        }
        NotificationAction::Skip => {}
    });
}

#[cfg(test)]
mod tests {
    use super::{native_notifications_available, set_native_notifications_available, NotificationAction};

    #[test]
    fn maps_native_action_identifiers() {
        assert_eq!(
            NotificationAction::from_identifier("open"),
            Some(NotificationAction::OpenPopover)
        );
        assert_eq!(
            NotificationAction::from_identifier("drink"),
            Some(NotificationAction::Drink)
        );
        assert_eq!(
            NotificationAction::from_identifier("snooze"),
            Some(NotificationAction::Snooze)
        );
        assert_eq!(
            NotificationAction::from_identifier("skip"),
            Some(NotificationAction::Skip)
        );
        assert_eq!(NotificationAction::from_identifier("unknown"), None);
    }

    #[test]
    fn authorization_failure_disables_native_notifications() {
        set_native_notifications_available(true);
        assert!(native_notifications_available());

        set_native_notifications_available(false);

        assert!(!native_notifications_available());
    }
}

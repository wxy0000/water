// Hydropace 自控提醒浮层
//
// 系统通知仍保留为兜底，但可见提醒优先走这个独立窗口，避免 macOS
// Notification Center / Focus / 临时横幅样式把提醒藏起来。

use serde::Serialize;
use tauri::{
    AppHandle, Emitter, Manager, PhysicalPosition, Position, Runtime, WebviewUrl,
    WebviewWindow, WebviewWindowBuilder,
};

pub struct ReminderOverlayState<R: Runtime>(pub WebviewWindow<R>);

const LABEL: &str = "reminder-overlay";
const WIDTH: f64 = 360.0;
const HEIGHT: f64 = 168.0;
const RIGHT_GAP: f64 = 18.0;
const TOP_GAP: f64 = 64.0;

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReminderOverlayPayload {
    pub today_total: i32,
    pub remaining: i32,
}

pub fn init<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
    let win = WebviewWindowBuilder::new(app, LABEL, WebviewUrl::App("index.html".into()))
        .title("Hydropace Reminder")
        .inner_size(WIDTH, HEIGHT)
        .decorations(false)
        .transparent(true)
        .always_on_top(true)
        .skip_taskbar(true)
        .resizable(false)
        .visible(false)
        .focused(false)
        .build()?;

    #[cfg(target_os = "macos")]
    {
        use window_vibrancy::{apply_vibrancy, NSVisualEffectMaterial, NSVisualEffectState};
        let _ = apply_vibrancy(
            &win,
            NSVisualEffectMaterial::HudWindow,
            Some(NSVisualEffectState::Active),
            Some(18.0),
        );
    }

    app.manage(ReminderOverlayState(win));
    Ok(())
}

/// 显示 Hydropace 自控提醒浮层。
///
/// 返回 true 表示 overlay 已经 show；如果窗口不存在或 show 失败，调用方仍可
/// 继续走系统通知兜底。
pub fn show<R: Runtime>(app: &AppHandle<R>, today_total: i32, remaining: i32) -> bool {
    let state = app.state::<ReminderOverlayState<R>>();
    let win = &state.0;

    if let Err(e) = win.show() {
        eprintln!("[reminder-overlay] show failed: {e}");
        return false;
    }
    position_top_right(app, win);
    let _ = win.set_always_on_top(true);
    let payload = build_payload(today_total, remaining);
    if let Err(e) = win.emit("reminder-overlay-show", payload) {
        eprintln!("[reminder-overlay] emit failed: {e}");
    }
    let _ = win.set_focus();
    true
}

pub fn hide<R: Runtime>(app: &AppHandle<R>) {
    let state = app.state::<ReminderOverlayState<R>>();
    let _ = state.0.hide();
}

fn build_payload(today_total: i32, remaining: i32) -> ReminderOverlayPayload {
    ReminderOverlayPayload {
        today_total: today_total.max(0),
        remaining: remaining.max(0),
    }
}

fn position_top_right<R: Runtime>(app: &AppHandle<R>, win: &WebviewWindow<R>) {
    if let Some((x, y)) = physical_top_right_from_widget_monitor(app, win) {
        let _ = win.set_position(Position::Physical(PhysicalPosition::new(x, y)));
        return;
    }

    let _ = win.set_position(Position::Physical(PhysicalPosition::new(100, 100)));
}

fn physical_top_right_from_widget_monitor<R: Runtime>(
    app: &AppHandle<R>,
    win: &WebviewWindow<R>,
) -> Option<(i32, i32)> {
    let monitor = app
        .get_webview_window("widget")
        .and_then(|widget| widget.current_monitor().ok().flatten())
        .or_else(|| win.current_monitor().ok().flatten())?;
    let scale = monitor.scale_factor();
    let pos = monitor.position();
    let size = monitor.size();
    let width = (WIDTH * scale).round() as i32;
    let right_gap = (RIGHT_GAP * scale).round() as i32;
    let top_gap = (TOP_GAP * scale).round() as i32;
    let x = pos.x + size.width as i32 - width - right_gap;
    let y = pos.y + top_gap;
    Some((x.max(pos.x), y.max(pos.y)))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn payload_clamps_negative_values() {
        assert_eq!(
            build_payload(-1, -20),
            ReminderOverlayPayload {
                today_total: 0,
                remaining: 0,
            }
        );
    }

    #[test]
    fn payload_preserves_today_and_remaining() {
        assert_eq!(
            build_payload(900, 1100),
            ReminderOverlayPayload {
                today_total: 900,
                remaining: 1100,
            }
        );
    }
}

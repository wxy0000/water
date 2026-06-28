// 设置窗口（06 阶段）
//
// 行为：
// - 默认隐藏（visible=false）
// - 菜单栏"设置"或 tray 右键"设置" → show
// - 失焦（blur）→ 自动 hide（macOS 通用 popover 行为）
// - 居中显示：主显示器中央
// - vibrancy：NSVisualEffectMaterial::Popover（与 popover 风格一致）

use tauri::{AppHandle, LogicalPosition, Manager, Position, Runtime, WebviewUrl, WebviewWindow, WebviewWindowBuilder};

pub struct SettingsState<R: Runtime>(pub WebviewWindow<R>);

const SETTINGS_W: f64 = 480.0;
const SETTINGS_H: f64 = 560.0;

pub fn init<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
    let win = WebviewWindowBuilder::new(
        app,
        "settings",
        WebviewUrl::App("index.html".into()),
    )
    .title("L01 Water 设置")
    .inner_size(SETTINGS_W, SETTINGS_H)
    .decorations(false)
    .transparent(true)
    .always_on_top(true)
    .skip_taskbar(true)
    .resizable(false)
    .visible(false)
    .focused(false)
    .build()?;

    // macOS vibrancy
    #[cfg(target_os = "macos")]
    {
        use window_vibrancy::{apply_vibrancy, NSVisualEffectMaterial, NSVisualEffectState};
        let _ = apply_vibrancy(
            &win,
            NSVisualEffectMaterial::Popover,
            Some(NSVisualEffectState::Active),
            Some(12.0),
        );
    }

    // 失焦自动隐藏
    let win_for_event = win.clone();
    win.on_window_event(move |event| {
        if let tauri::WindowEvent::Focused(false) = event {
            let _ = win_for_event.hide();
        }
    });

    app.manage(SettingsState(win));
    Ok(())
}

/// 显示 settings 窗口：居中 + show + set_focus
pub fn show<R: Runtime>(app: &AppHandle<R>) {
    let state = app.state::<SettingsState<R>>();
    position_center(&state.0);
    let _ = state.0.show();
    let _ = state.0.set_focus();
}

fn position_center<R: Runtime>(win: &WebviewWindow<R>) {
    let Ok(Some(monitor)) = win.current_monitor() else { return };
    let scale = monitor.scale_factor();
    let pos = monitor.position();
    let size = monitor.size();
    let x = pos.x as f64 / scale + (size.width as f64 / scale - SETTINGS_W) / 2.0;
    let y = pos.y as f64 / scale + (size.height as f64 / scale - SETTINGS_H) / 2.0;
    let _ = win.set_position(Position::Logical(LogicalPosition::new(x, y)));
}

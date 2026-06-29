// Popover 窗口（04 阶段）
//
// 行为：
// - 默认隐藏（visible=false）
// - tray 左键 / 右键"显示面板" → show
// - 窗口失焦（blur）→ 自动 hide
// - 位置：紧贴 tray icon 下方居中（macOS，从 TrayIcon::rect() 算）
// - vibrancy：NSVisualEffectMaterial::Popover（macOS 半透明原生质感）

use tauri::{
    AppHandle, LogicalPosition, Manager, Position, Runtime, WebviewUrl, WebviewWindow,
    WebviewWindowBuilder,
};

pub struct PopoverState<R: Runtime>(pub WebviewWindow<R>);

const POPOVER_W: f64 = 320.0;
const POPOVER_H: f64 = 540.0;
const TRAY_ID: &str = "main-tray";

pub fn init<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
    let win = WebviewWindowBuilder::new(
        app,
        "popover",
        WebviewUrl::App("index.html".into()),
    )
    .title("Hydropace")
    .inner_size(POPOVER_W, POPOVER_H)
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

    // blur 自动隐藏：窗口失焦 → hide
    let win_for_event = win.clone();
    win.on_window_event(move |event| {
        if let tauri::WindowEvent::Focused(false) = event {
            let _ = win_for_event.hide();
        }
    });

    app.manage(PopoverState(win));
    Ok(())
}

/// 显示 popover：定位 + show + set_focus
pub fn show<R: Runtime>(app: &AppHandle<R>) {
    let state = app.state::<PopoverState<R>>();
    position_next_to_tray(app, &state.0);
    let _ = state.0.show();
    let _ = state.0.set_focus();
}

/// 切换 popover 显隐
pub fn toggle<R: Runtime>(app: &AppHandle<R>) {
    let state = app.state::<PopoverState<R>>();
    let visible = state.0.is_visible().unwrap_or(false);
    if visible {
        let _ = state.0.hide();
    } else {
        show(app);
    }
}

/// 从 tray icon 位置算 popover 居中位置
///
/// 3 个 fallback 链：
/// 1. tray.rect() 物理坐标 → 紧贴 tray icon 下方
/// 2. 失败 → 居中到主屏幕
/// 3. 还失败 → 屏幕 (100, 100)
fn position_next_to_tray<R: Runtime>(app: &AppHandle<R>, win: &WebviewWindow<R>) {
    let scale = win.scale_factor().unwrap_or(1.0);

    // 1. 试 tray icon 位置
    if let Some(tray) = app.tray_by_id(TRAY_ID) {
        if let Ok(Some(rect)) = tray.rect() {
            if let (tauri::Position::Physical(p), tauri::Size::Physical(s)) = (rect.position, rect.size) {
                let popover_x = (p.x as f64 + s.width as f64 / 2.0) / scale - POPOVER_W / 2.0;
                let popover_y = (p.y as f64 + s.height as f64) / scale + 4.0;
                eprintln!(
                    "[popover::pos] tray icon phys=({},{} {}x{}) -> logical=({},{})",
                    p.x, p.y, s.width, s.height, popover_x, popover_y
                );
                let _ = win.set_position(Position::Logical(LogicalPosition::new(
                    popover_x, popover_y,
                )));
                return;
            }
        }
    }

    // 2. Fallback：主屏幕中央
    if let Ok(Some(monitor)) = win.current_monitor() {
        let pos = monitor.position();
        let size = monitor.size();
        let popover_x = pos.x as f64 / scale + (size.width as f64 / scale - POPOVER_W) / 2.0;
        let popover_y = pos.y as f64 / scale + (size.height as f64 / scale - POPOVER_H) / 2.0;
        let _ = win.set_position(Position::Logical(LogicalPosition::new(
            popover_x, popover_y,
        )));
    } else {
        // 3. 兜底：屏幕 (100, 100)
        let _ = win.set_position(Position::Logical(LogicalPosition::new(100.0, 100.0)));
    }
}

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
const POPOVER_H: f64 = 420.0;
const TRAY_ID: &str = "main-tray";

pub fn init<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
    let win = WebviewWindowBuilder::new(
        app,
        "popover",
        WebviewUrl::App("index.html".into()),
    )
    .title("L01 Water")
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

/// 隐藏 popover
pub fn hide<R: Runtime>(app: &AppHandle<R>) {
    let state = app.state::<PopoverState<R>>();
    let _ = state.0.hide();
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

/// 从 tray icon 位置算 popover 居中位置：popover 中心 X = icon 中心 X，popover 顶 = icon 底 + 4px
///
/// Tauri 2 的 `TrayIcon::rect()` 返回物理像素 Rect；我们用 Logical 位置设置（避免 DPI 缩放算错）
fn position_next_to_tray<R: Runtime>(app: &AppHandle<R>, win: &WebviewWindow<R>) {
    let Some(tray) = app.tray_by_id(TRAY_ID) else {
        return;
    };
    let Ok(Some(rect)) = tray.rect() else {
        return;
    };

    let scale = win.scale_factor().unwrap_or(1.0);

    // Tauri 2 的 tray::Rect 字段是 enum（Position::Physical/Logical + Size::Physical/Logical）
    // tray icon 总是物理像素
    let (tx, ty, tw, th) = match (rect.position, rect.size) {
        (tauri::Position::Physical(p), tauri::Size::Physical(s)) => {
            (p.x as f64, p.y as f64, s.width as f64, s.height as f64)
        }
        _ => return, // tray rect 应是 physical，其他情况忽略
    };

    // 物理坐标 → logical
    let tray_center_x_logical = (tx + tw / 2.0) / scale;
    let tray_bottom_y_logical = (ty + th) / scale + 4.0;

    let popover_x = tray_center_x_logical - POPOVER_W / 2.0;
    let _ = win.set_position(Position::Logical(LogicalPosition::new(
        popover_x,
        tray_bottom_y_logical,
    )));
}

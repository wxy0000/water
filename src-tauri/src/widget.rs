// 桌面浮窗 Widget（04 阶段）
//
// 行为：
// - 启动时从 widget_state 读位置 + 边界检查
// - always_on_top + transparent + 90×56
// - 拖动：Tauri startDragging()（前端），Rust 端监听 onMoved → save + clamp 回弹
// - 边界检查：主屏幕 work_area 范围内，至少留 10px 边距

use tauri::{
    AppHandle, Manager, PhysicalPosition, Position, Runtime, WebviewUrl, WebviewWindow,
    WebviewWindowBuilder,
};

pub struct WidgetState<R: Runtime>(pub WebviewWindow<R>);

const WIDGET_W: f64 = 90.0;
const WIDGET_H: f64 = 56.0;
const EDGE_MARGIN: i32 = 10;
const DEFAULT_X: i32 = 100;
const DEFAULT_Y: i32 = 100;

pub fn init<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
    // 读上次位置（DB 默认行 id=1）
    let (x, y) = load_pos(app).unwrap_or((DEFAULT_X, DEFAULT_Y));

    // 07 阶段：启动时按 settings['widget_visible'] 决定初始 visible
    let initially_visible = load_visible(app).unwrap_or(true);

    let win = WebviewWindowBuilder::new(app, "widget", WebviewUrl::App("index.html".into()))
        .title("L01 Water Widget")
        .inner_size(WIDGET_W, WIDGET_H)
        .position(x as f64, y as f64)
        .decorations(false)
        .transparent(true)
        .always_on_top(true)
        .skip_taskbar(true)
        .resizable(false)
        .visible(initially_visible)
        .focused(false)
        .build()?;

    // 启动时 clamp 一次（防止上次保存的位置在多屏变化后超出当前 work_area）
    if let Some(clamped) = clamp_to_main_screen(&win, &PhysicalPosition::new(x, y)) {
        if clamped.x != x || clamped.y != y {
            let _ = win.set_position(Position::Physical(clamped));
        }
    }

    // macOS vibrancy
    #[cfg(target_os = "macos")]
    {
        use window_vibrancy::{apply_vibrancy, NSVisualEffectMaterial, NSVisualEffectState};
        let _ = apply_vibrancy(
            &win,
            NSVisualEffectMaterial::Popover,
            Some(NSVisualEffectState::Active),
            Some(10.0),
        );
    }

    // 拖动结束（onMoved）→ clamp + 保存
    let app_handle = app.clone();
    let win_for_event = win.clone();
    win.on_window_event(move |event| {
        if let tauri::WindowEvent::Moved(pos) = event {
            let pos = *pos;
            // 1. 边界 clamp
            let final_pos = clamp_to_main_screen(&win_for_event, &pos).unwrap_or(pos);
            // 2. 如果 clamp 改了位置，set 回去（视觉回弹）
            if final_pos.x != pos.x || final_pos.y != pos.y {
                let _ = win_for_event.set_position(Position::Physical(final_pos));
            }
            // 3. 保存到 DB
            save_pos(&app_handle, final_pos.x, final_pos.y);
        }
    });

    app.manage(WidgetState(win));
    Ok(())
}

/// 从 DB 读 widget 位置
fn load_pos<R: Runtime>(app: &AppHandle<R>) -> Option<(i32, i32)> {
    let db = app.state::<crate::db::DbState>();
    db.with_lock(|conn| {
        Ok(conn.query_row(
            "SELECT x, y FROM widget_state WHERE id = 1",
            [],
            |row| Ok((row.get::<_, i32>(0)?, row.get::<_, i32>(1)?)),
        )?)
    })
    .ok()
}

/// 从 DB 读 widget visible 状态
fn load_visible<R: Runtime>(app: &AppHandle<R>) -> Option<bool> {
    let db = app.state::<crate::db::DbState>();
    db.with_lock(|conn| {
        let v: i64 = conn.query_row(
            "SELECT visible FROM widget_state WHERE id = 1",
            [],
            |row| row.get(0),
        )?;
        Ok::<_, crate::db::DbError>(v != 0)
    })
    .ok()
}

/// 设置 widget 显隐（07 阶段：set_widget_visible 联动）
pub fn set_visible<R: Runtime>(app: &AppHandle<R>, visible: bool) {
    let state = app.state::<WidgetState<R>>();
    if visible {
        let _ = state.0.show();
    } else {
        let _ = state.0.hide();
    }
}

/// 保存 widget 位置到 DB
fn save_pos<R: Runtime>(app: &AppHandle<R>, x: i32, y: i32) {
    let db = app.state::<crate::db::DbState>();
    let _ = db.with_lock(|conn| {
        conn.execute(
            "UPDATE widget_state SET x = ?1, y = ?2 WHERE id = 1",
            rusqlite::params![x, y],
        )?;
        Ok::<_, crate::db::DbError>(())
    });
}

/// 边界检查：clamp 到主屏幕 frame，留 EDGE_MARGIN 边距 + widget 不超出右/下
fn clamp_to_main_screen<R: Runtime>(
    win: &WebviewWindow<R>,
    pos: &PhysicalPosition<i32>,
) -> Option<PhysicalPosition<i32>> {
    let monitor = win.current_monitor().ok().flatten()?;
    let scale = monitor.scale_factor();
    let origin = monitor.position();
    let size = monitor.size();

    let min_x = origin.x + EDGE_MARGIN;
    let min_y = origin.y + EDGE_MARGIN;
    let max_x = origin.x + size.width as i32 - (WIDGET_W * scale) as i32 - EDGE_MARGIN;
    let max_y = origin.y + size.height as i32 - (WIDGET_H * scale) as i32 - EDGE_MARGIN;

    Some(PhysicalPosition::new(
        pos.x.max(min_x).min(max_x.max(min_x)),
        pos.y.max(min_y).min(max_y.max(min_y)),
    ))
}

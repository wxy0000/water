// 菜单栏图标（tray）
//
// 02 阶段目标：
//   - 启动后 macOS 菜单栏出现水滴图标 + 数字 "0%"
//   - 左键 → toggle_popover()（TODO 04 实现真实 popover 切换）
//   - 右键 → 菜单（设置 disabled / 退出 / 关于）
//   - 预留接口：show_popover / hide_popover / toggle_popover / set_tray_count
//
// 03 阶段：set_tray_count 接 today-changed 事件
// 04 阶段：show/hide/toggle 调 popover::show/hide/toggle

use tauri::{
    image::Image,
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIcon, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager, Runtime,
};

/// 把 TrayIcon 存到 AppHandle state，让 set_tray_count 能从任意地方调用
pub struct TrayState<R: Runtime>(pub TrayIcon<R>);

/// 初始化：建图标 + 菜单 + 事件回调
pub fn init<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
    let icon = build_tray_icon();

    // 菜单项
    let show_item = MenuItem::with_id(app, "show_popover", "显示面板", true, None::<&str>)?;
    // 06 阶段：设置项 enabled
    let settings_item = MenuItem::with_id(app, "settings", "设置…", true, None::<&str>)?;
    let about_item = PredefinedMenuItem::about(
        app,
        Some("L01 Water"),
        None::<tauri::menu::AboutMetadata>,
    )?;
    let quit_item = PredefinedMenuItem::quit(app, None::<&str>)?;
    let sep = PredefinedMenuItem::separator(app)?;

    let menu = Menu::with_items(
        app,
        &[
            &show_item,
            &sep,
            &settings_item,
            &PredefinedMenuItem::separator(app)?,
            &about_item,
            &PredefinedMenuItem::separator(app)?,
            &quit_item,
        ],
    )?;

    let tray = TrayIconBuilder::with_id("main-tray")
        .icon(icon)
        // .icon_as_template(true) // macOS template image 自适应暗色；MVP 用彩色图，先不开
        .title("0%")
        .tooltip("L01 Water — 今日 0 / 2000 ml")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button,
                button_state,
                ..
            } = event
            {
                if button_state == MouseButtonState::Up {
                    match button {
                        MouseButton::Left => {
                            println!("[tray] left click → toggle popover (TODO 04)");
                            // Tauri 2: on_tray_icon_event 第一个参数是 &TrayIcon<R>，用 app_handle() 拿 AppHandle
                            toggle_popover(tray.app_handle());
                        }
                        MouseButton::Right => {
                            println!("[tray] right click → context menu");
                        }
                        _ => {}
                    }
                }
            }
        })
        .on_menu_event(|app, event| match event.id.as_ref() {
            "show_popover" => {
                println!("[tray] menu: show_popover");
                show_popover(app);
            }
            "settings" => {
                println!("[tray] menu: settings");
                // 06 阶段：emit 让 Rust listen 后调 settings::show
                let _ = app.emit("open-settings", ());
            }
            _ => {}
        })
        .build(app)?;

    app.manage(TrayState(tray));
    Ok(())
}

// ===== popover 接口（04 阶段：调 popover 模块）=====

/// 显示 popover 窗口
pub fn show_popover<R: Runtime>(app: &AppHandle<R>) {
    crate::popover::show(app);
}

/// 隐藏 popover 窗口
pub fn hide_popover<R: Runtime>(app: &AppHandle<R>) {
    crate::popover::hide(app);
}

/// 切换 popover 显隐
pub fn toggle_popover<R: Runtime>(app: &AppHandle<R>) {
    crate::popover::toggle(app);
}

/// 更新菜单栏数字（百分比）
/// percent: 0..=100 的整数，会被 clamp 到 0..=999
pub fn set_tray_count<R: Runtime>(app: &AppHandle<R>, percent: u32) {
    let state = app.state::<TrayState<R>>();
    let pct = percent.min(999);
    let text = format!("{pct}%");
    if let Err(e) = state.0.set_title(Some(&text)) {
        eprintln!("[tray] set_title failed: {e}");
    }
    let tip = format!("L01 Water — 今日 0 / 2000 ml（{pct}%）");
    if let Err(e) = state.0.set_tooltip(Some(&tip)) {
        eprintln!("[tray] set_tooltip failed: {e}");
    }
}

// ===== 占位图标 =====

/// 程序化生成 32×32 蓝色圆形 PNG
///
/// 不依赖外部 PNG 文件，MVP 阶段立即可跑。
/// 后续接入正式图标（`npx @tauri-apps/cli icon icons/source.png`）后，
/// 把 `tauri::image::Image::from_bytes(include_bytes!("../../icons/32x32.png"))` 那行启用即可。
fn build_tray_icon() -> Image<'static> {
    const SIZE: u32 = 32;
    let mut data = vec![0u8; (SIZE * SIZE * 4) as usize];

    let cx = SIZE as f32 / 2.0 - 0.5;
    let cy = SIZE as f32 / 2.0 - 0.5;
    let r = 13.0_f32;

    for y in 0..SIZE {
        for x in 0..SIZE {
            let dx = x as f32 - cx;
            let dy = y as f32 - cy;
            let d = (dx * dx + dy * dy).sqrt();
            let i = ((y * SIZE + x) * 4) as usize;
            if d < r {
                // #4A9EFF
                data[i] = 0x4A;
                data[i + 1] = 0x9E;
                data[i + 2] = 0xFF;
                data[i + 3] = 0xFF;
            }
            // 边缘抗锯齿：1px 渐变
            else if d < r + 1.0 {
                let alpha = ((r + 1.0 - d) * 255.0) as u8;
                data[i] = 0x4A;
                data[i + 1] = 0x9E;
                data[i + 2] = 0xFF;
                data[i + 3] = alpha;
            }
        }
    }
    Image::new_owned(data, SIZE, SIZE)
}

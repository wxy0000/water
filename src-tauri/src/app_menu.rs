use tauri::{
    menu::{MenuBuilder, MenuItem, PredefinedMenuItem, SubmenuBuilder},
    App, AppHandle,
};

use crate::{popover, reminder, settings};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MenuAction {
    ShowPopover,
    OpenSettings,
    TestReminder,
}

impl MenuAction {
    pub fn from_id(id: &str) -> Option<Self> {
        match id {
            "show_popover" => Some(Self::ShowPopover),
            "settings" => Some(Self::OpenSettings),
            "test_reminder" => Some(Self::TestReminder),
            _ => None,
        }
    }
}

pub fn init(app: &mut App) -> tauri::Result<()> {
    let show_item = MenuItem::with_id(app, "show_popover", "显示面板", true, None::<&str>)?;
    let settings_item = MenuItem::with_id(app, "settings", "设置…", true, Some("CmdOrCtrl+,"))?;
    let test_item = MenuItem::with_id(app, "test_reminder", "测试提醒", true, None::<&str>)?;
    let about_item = PredefinedMenuItem::about(
        app,
        Some("Hydropace"),
        None::<tauri::menu::AboutMetadata>,
    )?;
    let quit_item = PredefinedMenuItem::quit(app, None::<&str>)?;

    let hydropace_menu = SubmenuBuilder::new(app, "Hydropace")
        .item(&about_item)
        .separator()
        .item(&show_item)
        .item(&settings_item)
        .item(&test_item)
        .separator()
        .item(&quit_item)
        .build()?;
    let menu = MenuBuilder::new(app).item(&hydropace_menu).build()?;
    app.set_menu(menu)?;

    app.on_menu_event(|app, event| {
        if let Some(action) = MenuAction::from_id(event.id().0.as_str()) {
            handle_action(app, action);
        }
    });

    Ok(())
}

fn handle_action(app: &AppHandle, action: MenuAction) {
    match action {
        MenuAction::ShowPopover => popover::show(app),
        MenuAction::OpenSettings => settings::show(app),
        MenuAction::TestReminder => {
            if let Err(e) = reminder::test_reminder(app.clone()) {
                eprintln!("[app-menu] test reminder failed: {e}");
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::MenuAction;

    #[test]
    fn maps_app_menu_item_ids_to_actions() {
        assert_eq!(MenuAction::from_id("settings"), Some(MenuAction::OpenSettings));
        assert_eq!(
            MenuAction::from_id("test_reminder"),
            Some(MenuAction::TestReminder)
        );
        assert_eq!(MenuAction::from_id("show_popover"), Some(MenuAction::ShowPopover));
        assert_eq!(MenuAction::from_id("quit"), None);
        assert_eq!(MenuAction::from_id("unknown"), None);
    }
}

// System tray: left click toggles the main window, menu offers show/quit.
// The user can disable the tray entirely from Settings; when disabled,
// closing the window exits the app instead of hiding to the tray.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIcon, TrayIconBuilder, TrayIconEvent},
    AppHandle, Manager, State,
};

pub struct TrayState {
    pub enabled: AtomicBool,
    pub icon: Mutex<Option<TrayIcon>>,
}

impl TrayState {
    pub fn new() -> Self {
        Self {
            enabled: AtomicBool::new(true),
            icon: Mutex::new(None),
        }
    }
}

pub fn build_tray(app: &AppHandle) -> Result<TrayIcon, String> {
    let show = MenuItem::with_id(app, "fv-show", "显示窗口 / SHOW", true, None::<&str>)
        .map_err(|e| e.to_string())?;
    let quit = MenuItem::with_id(app, "fv-quit", "退出 / QUIT", true, None::<&str>)
        .map_err(|e| e.to_string())?;
    let menu = Menu::with_items(app, &[&show, &quit]).map_err(|e| e.to_string())?;
    let icon = app
        .default_window_icon()
        .cloned()
        .ok_or("no default window icon")?;

    TrayIconBuilder::with_id("fv-tray")
        .icon(icon)
        .tooltip("FIELD VAULT · 场站验证库")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "fv-show" => show_main_window(app),
            "fv-quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                toggle_main_window(tray.app_handle());
            }
        })
        .build(app)
        .map_err(|e| e.to_string())
}

fn show_main_window(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.show();
        let _ = w.unminimize();
        let _ = w.set_focus();
    }
}

fn toggle_main_window(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let visible = w.is_visible().unwrap_or(false);
        let focused = w.is_focused().unwrap_or(false);
        if visible && focused {
            let _ = w.hide();
        } else {
            let _ = w.show();
            let _ = w.unminimize();
            let _ = w.set_focus();
        }
    }
}

#[tauri::command]
pub fn set_tray_enabled(app: AppHandle, state: State<TrayState>, enabled: bool) -> Result<(), String> {
    state.enabled.store(enabled, Ordering::SeqCst);
    let mut guard = state.icon.lock().unwrap();
    if enabled {
        if guard.is_none() {
            *guard = Some(build_tray(&app)?);
        }
    } else if let Some(icon) = guard.take() {
        drop(icon); // dropping a TrayIcon removes it from the system tray
    }
    Ok(())
}

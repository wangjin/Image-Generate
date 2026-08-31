mod api;
mod config;
mod error;
mod history;
mod updater;

use std::sync::Mutex;
use tauri::Manager;

use config::AppContext;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            let config_dir = app.path().app_config_dir()?;
            let mut state = config::load_state(config_dir)?;
            if state.output_dir.is_empty() {
                let pictures = app
                    .path()
                    .picture_dir()
                    .unwrap_or_else(|_| app.path().home_dir().unwrap_or_default());
                let out = pictures.join("ImageGenerate");
                state.output_dir = out.to_string_lossy().to_string();
                let _ = std::fs::create_dir_all(&out);
            }
            app.manage(AppContext {
                config_dir: app.path().app_config_dir()?,
                data: Mutex::new(state),
            });
            app.manage(updater::PendingUpdate::default());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            config::get_state,
            config::upsert_provider,
            config::delete_provider,
            config::set_active_provider,
            config::set_output_dir,
            config::set_update_proxy_prefix,
            api::generate_image,
            api::edit_image,
            api::read_image_data_url,
            api::reveal_path,
            history::list_history,
            updater::check_update,
            updater::download_update,
            updater::install_update,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

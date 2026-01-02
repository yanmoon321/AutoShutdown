use serde::Serialize;
use sysinfo::{System, Pid};
use std::process::Command;
use std::collections::HashMap;
use std::sync::Mutex;

#[cfg(windows)]
use windows::{
    core::PCWSTR,
    Win32::Foundation::{BOOL, HWND, LPARAM},
    Win32::UI::WindowsAndMessaging::{
        EnumWindows, GetWindowTextW, GetWindowTextLengthW, 
        IsWindowVisible, GetWindowThreadProcessId,
        HICON, DestroyIcon
    },
    Win32::UI::Shell::ExtractIconExW,
    Win32::Graphics::Gdi::{
        CreateCompatibleDC, CreateCompatibleBitmap, SelectObject, DeleteDC, DeleteObject,
        GetDC, ReleaseDC, GetDIBits, BITMAPINFO, BITMAPINFOHEADER, BI_RGB, DIB_RGB_COLORS,
    },
};

#[derive(Serialize, Clone)]
pub struct ProcessInfo {
    pid: u32,
    name: String,
    title: String,
    icon: Option<String>, // base64 encoded PNG
}

struct WindowInfo {
    pid: u32,
    title: String,
}

#[cfg(windows)]
fn get_process_icon(exe_path: &str) -> Option<String> {
    use base64::Engine;
    use image::{RgbaImage, Rgba};
    
    unsafe {
        let wide_path: Vec<u16> = exe_path.encode_utf16().chain(std::iter::once(0)).collect();
        
        let mut large_icon: HICON = HICON::default();
        let mut small_icon: HICON = HICON::default();
        
        let count = ExtractIconExW(
            PCWSTR::from_raw(wide_path.as_ptr()),
            0,
            Some(&mut large_icon),
            Some(&mut small_icon),
            1
        );
        
        if count == 0 || large_icon.is_invalid() {
            return None;
        }
        
        // 获取图标信息
        let icon_size = 32i32;
        
        let hdc_screen = GetDC(HWND::default());
        let hdc_mem = CreateCompatibleDC(hdc_screen);
        let hbm = CreateCompatibleBitmap(hdc_screen, icon_size, icon_size);
        let old_bm = SelectObject(hdc_mem, hbm);
        
        // 绘制图标到位图
        let _ = windows::Win32::UI::WindowsAndMessaging::DrawIconEx(
            hdc_mem,
            0, 0,
            large_icon,
            icon_size, icon_size,
            0,
            None,
            windows::Win32::UI::WindowsAndMessaging::DI_NORMAL,
        );
        
        // 获取位图数据
        let mut bmi = BITMAPINFO {
            bmiHeader: BITMAPINFOHEADER {
                biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
                biWidth: icon_size,
                biHeight: -icon_size, // 负值表示从上到下
                biPlanes: 1,
                biBitCount: 32,
                biCompression: BI_RGB.0,
                ..Default::default()
            },
            ..Default::default()
        };
        
        let mut pixels: Vec<u8> = vec![0u8; (icon_size * icon_size * 4) as usize];
        
        GetDIBits(
            hdc_mem,
            hbm,
            0,
            icon_size as u32,
            Some(pixels.as_mut_ptr() as *mut _),
            &mut bmi,
            DIB_RGB_COLORS,
        );
        
        // 清理
        SelectObject(hdc_mem, old_bm);
        let _ = DeleteObject(hbm);
        let _ = DeleteDC(hdc_mem);
        let _ = ReleaseDC(HWND::default(), hdc_screen);
        let _ = DestroyIcon(large_icon);
        if !small_icon.is_invalid() {
            let _ = DestroyIcon(small_icon);
        }
        
        // 转换 BGRA 到 RGBA
        let mut img = RgbaImage::new(icon_size as u32, icon_size as u32);
        for y in 0..icon_size as u32 {
            for x in 0..icon_size as u32 {
                let idx = ((y * icon_size as u32 + x) * 4) as usize;
                let b = pixels[idx];
                let g = pixels[idx + 1];
                let r = pixels[idx + 2];
                let a = pixels[idx + 3];
                img.put_pixel(x, y, Rgba([r, g, b, if a == 0 { 255 } else { a }]));
            }
        }
        
        // 编码为 PNG base64
        let mut png_data: Vec<u8> = Vec::new();
        {
            use image::ImageEncoder;
            let encoder = image::codecs::png::PngEncoder::new(&mut png_data);
            if encoder.write_image(
                img.as_raw(),
                icon_size as u32,
                icon_size as u32,
                image::ExtendedColorType::Rgba8
            ).is_ok() {
                let base64_str = base64::engine::general_purpose::STANDARD.encode(&png_data);
                return Some(format!("data:image/png;base64,{}", base64_str));
            }
        }
        
        None
    }
}

#[cfg(windows)]
#[tauri::command]
fn get_running_apps() -> Vec<ProcessInfo> {
    use std::ffi::OsString;
    use std::os::windows::ffi::OsStringExt;
    
    let windows_data: Mutex<Vec<WindowInfo>> = Mutex::new(Vec::new());
    
    unsafe {
        let _ = EnumWindows(
            Some(enum_window_callback),
            LPARAM(&windows_data as *const _ as isize),
        );
    }
    
    let windows = windows_data.into_inner().unwrap();
    
    // 根据 PID 去重
    let mut pid_map: HashMap<u32, WindowInfo> = HashMap::new();
    for w in windows {
        if let Some(existing) = pid_map.get(&w.pid) {
            if w.title.len() > existing.title.len() {
                pid_map.insert(w.pid, w);
            }
        } else {
            pid_map.insert(w.pid, w);
        }
    }
    
    let mut sys = System::new();
    sys.refresh_processes(sysinfo::ProcessesToUpdate::All, true);
    
    let mut apps: Vec<ProcessInfo> = Vec::new();
    
    for (pid, window) in pid_map {
        if let Some(process) = sys.process(Pid::from_u32(pid)) {
            let name = process.name().to_string_lossy().to_string();
            if !name.contains("explorer") 
                && !name.contains("TextInputHost")
                && !name.contains("SearchHost")
                && !name.contains("ShellExperienceHost")
                && !name.contains("StartMenuExperienceHost")
                && !name.contains("autoshutdownapp")
            {
                // 获取图标
                let icon = if let Some(exe_path) = process.exe() {
                    get_process_icon(&exe_path.to_string_lossy())
                } else {
                    None
                };
                
                apps.push(ProcessInfo {
                    pid,
                    name,
                    title: window.title,
                    icon,
                });
            }
        }
    }
    
    apps.sort_by(|a, b| a.title.to_lowercase().cmp(&b.title.to_lowercase()));
    apps
}

#[cfg(windows)]
unsafe extern "system" fn enum_window_callback(hwnd: HWND, lparam: LPARAM) -> BOOL {
    use std::ffi::OsString;
    use std::os::windows::ffi::OsStringExt;
    
    if !IsWindowVisible(hwnd).as_bool() {
        return BOOL(1);
    }
    
    let length = GetWindowTextLengthW(hwnd);
    if length == 0 {
        return BOOL(1);
    }
    
    let mut buffer: Vec<u16> = vec![0; (length + 1) as usize];
    let actual_length = GetWindowTextW(hwnd, &mut buffer);
    if actual_length == 0 {
        return BOOL(1);
    }
    
    let title = OsString::from_wide(&buffer[..actual_length as usize])
        .to_string_lossy()
        .to_string();
    
    if title.is_empty() 
        || title == "Program Manager" 
        || title == "Windows Input Experience"
        || title.starts_with("MSCTFIME")
    {
        return BOOL(1);
    }
    
    let mut pid: u32 = 0;
    GetWindowThreadProcessId(hwnd, Some(&mut pid));
    
    if pid == 0 {
        return BOOL(1);
    }
    
    let data = &*(lparam.0 as *const Mutex<Vec<WindowInfo>>);
    if let Ok(mut windows) = data.lock() {
        windows.push(WindowInfo { pid, title });
    }
    
    BOOL(1)
}

#[cfg(not(windows))]
#[tauri::command]
fn get_running_apps() -> Vec<ProcessInfo> {
    Vec::new()
}

#[tauri::command]
fn kill_process(pid: u32) -> bool {
    let sys = System::new_all();
    if let Some(process) = sys.process(Pid::from_u32(pid)) {
        process.kill();
        true
    } else {
        false
    }
}

#[tauri::command]
fn system_shutdown() {
    #[cfg(target_os = "windows")]
    {
        Command::new("shutdown").args(["/s", "/t", "0"]).spawn().ok();
    }
}

#[tauri::command]
fn system_restart() {
    #[cfg(target_os = "windows")]
    {
        Command::new("shutdown").args(["/r", "/t", "0"]).spawn().ok();
    }
}

#[tauri::command]
fn system_sleep() {
    #[cfg(target_os = "windows")]
    {
        Command::new("rundll32.exe").args(["powrprof.dll,SetSuspendState", "0,1,0"]).spawn().ok();
    }
}

#[cfg(windows)]
mod window_watcher {
    use std::sync::atomic::{AtomicBool, Ordering};
    use std::sync::OnceLock;
    use std::thread;
    use std::time::Duration;
    use tauri::{AppHandle, Emitter};
    use windows::Win32::UI::Accessibility::{SetWinEventHook, UnhookWinEvent, HWINEVENTHOOK};
    use windows::Win32::UI::WindowsAndMessaging::{
        GetMessageW, MSG, EVENT_OBJECT_CREATE, EVENT_OBJECT_DESTROY,
        EVENT_OBJECT_SHOW, EVENT_OBJECT_HIDE, WINEVENT_OUTOFCONTEXT,
        OBJID_WINDOW,
    };
    use windows::Win32::Foundation::HWND;

    static RUNNING: AtomicBool = AtomicBool::new(false);
    static APP_HANDLE: OnceLock<AppHandle> = OnceLock::new();
    static DEBOUNCE_FLAG: AtomicBool = AtomicBool::new(false);

    unsafe extern "system" fn win_event_proc(
        _hook: HWINEVENTHOOK,
        event: u32,
        _hwnd: HWND,
        id_object: i32,
        _id_child: i32,
        _id_event_thread: u32,
        _dwms_event_time: u32,
    ) {
        // 只处理窗口对象
        if id_object != OBJID_WINDOW.0 {
            return;
        }

        // 检查是否是我们关心的事件
        if event == EVENT_OBJECT_CREATE 
            || event == EVENT_OBJECT_DESTROY
            || event == EVENT_OBJECT_SHOW
            || event == EVENT_OBJECT_HIDE
        {
            // 防抖：避免短时间内多次触发
            if DEBOUNCE_FLAG.compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst).is_ok() {
                if let Some(app) = APP_HANDLE.get() {
                    let _ = app.emit("window-changed", ());
                }
                
                // 500ms 后重置标志
                thread::spawn(|| {
                    thread::sleep(Duration::from_millis(500));
                    DEBOUNCE_FLAG.store(false, Ordering::SeqCst);
                });
            }
        }
    }

    pub fn start_watching(app: AppHandle) {
        if RUNNING.compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst).is_err() {
            return; // 已经在运行
        }

        let _ = APP_HANDLE.set(app);

        thread::spawn(|| {
            unsafe {
                let hook = SetWinEventHook(
                    EVENT_OBJECT_CREATE,
                    EVENT_OBJECT_HIDE,
                    None,
                    Some(win_event_proc),
                    0,
                    0,
                    WINEVENT_OUTOFCONTEXT,
                );

                if hook.is_invalid() {
                    RUNNING.store(false, Ordering::SeqCst);
                    return;
                }

                // 消息循环
                let mut msg = MSG::default();
                while RUNNING.load(Ordering::SeqCst) {
                    if GetMessageW(&mut msg, HWND::default(), 0, 0).as_bool() {
                        // 处理消息
                    }
                }

                let _ = UnhookWinEvent(hook);
            }
        });
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            get_running_apps,
            kill_process,
            system_shutdown,
            system_restart,
            system_sleep
        ])
        .setup(|app| {
            #[cfg(windows)]
            {
                window_watcher::start_watching(app.handle().clone());
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

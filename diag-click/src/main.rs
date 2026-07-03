//! click-diag —— 独立的自动点击注入诊断工具。
//! 探测为什么 SendInput 系列的合成点击对某些进程（游戏、webview 套壳等）无效。
//!
//! 用法：在 `diag-click` 目录下 `cargo run --release`，
//! 或 `cargo build --release` 后运行 `target/release/click-diag.exe`。

use std::ffi::c_void;
use std::io::{self, Write};
use std::mem;
use std::thread;
use std::time::Duration;

use windows_sys::Win32::Foundation::{CloseHandle, HANDLE, POINT};
use windows_sys::Win32::Security::{
    GetTokenInformation, TokenElevation, TOKEN_ELEVATION, TOKEN_QUERY,
};
use windows_sys::Win32::System::Console::{SetConsoleCP, SetConsoleOutputCP};
use windows_sys::Win32::System::Registry::{
    RegCloseKey, RegOpenKeyExW, RegQueryValueExW, HKEY, HKEY_LOCAL_MACHINE, KEY_READ,
};
use windows_sys::Win32::System::Threading::{
    GetCurrentProcess, OpenProcess, OpenProcessToken, PROCESS_QUERY_LIMITED_INFORMATION,
    QueryFullProcessImageNameW,
};
use windows_sys::Win32::Graphics::Gdi::ScreenToClient;
use windows_sys::Win32::UI::Input::KeyboardAndMouse::{
    mouse_event, SendInput, INPUT, INPUT_0, INPUT_MOUSE, MOUSEINPUT, MOUSEEVENTF_ABSOLUTE,
    MOUSEEVENTF_LEFTDOWN, MOUSEEVENTF_LEFTUP, MOUSEEVENTF_MOVE, MOUSEEVENTF_VIRTUALDESK,
};
use windows_sys::Win32::UI::WindowsAndMessaging::{
    GetClassNameW, GetCursorPos, GetSystemMetrics, GetWindowThreadProcessId, GetWindowTextW,
    PostMessageW, SetCursorPos, SetForegroundWindow, WindowFromPoint, SM_CXVIRTUALSCREEN,
    SM_CYVIRTUALSCREEN, SM_XVIRTUALSCREEN, SM_YVIRTUALSCREEN, WM_LBUTTONDOWN, WM_LBUTTONUP,
};

const AUTOCLICKER_EXTRA_INFO: usize = 0x800D_A5A5;
const MK_LBUTTON: usize = 0x0001;
// windows-sys 0.61 中 HWND = *mut c_void；统一用裸指针别名。
type Hwnd = *mut c_void;

struct TargetInfo {
    hwnd: Hwnd,
    class: String,
    title: String,
    pid: u32,
    proc_name: Option<String>,
    elevated: Option<bool>,
}

struct Strategy {
    name: &'static str,
    desc: &'static str,
    run: fn(i32, i32, Hwnd),
}

fn main() {
    set_utf8_console();
    println!("====================================================");
    println!("     自动点击注入诊断工具  click-diag");
    println!("====================================================");
    println!("探测为什么 SendInput 系列合成点击对某些进程无效。\n");

    println!("━━━ 第 1 步：本工具运行权限 ━━━");
    let self_elevated = is_current_elevated();
    if self_elevated {
        println!("  本工具: 管理员权限 ✓");
    } else {
        println!("  本工具: 普通用户权限");
        println!("  ⚠ 建议先关闭，右键【以管理员身份运行】再测，以排除 UIPI 拦截。");
    }

    println!("\n━━━ 第 2 步：定位目标坐标 ━━━");
    println!("  把鼠标移到目标窗口（例如游戏里的某个按钮）上。");
    println!("  准备好后回到此控制台按回车，你有 5 秒把鼠标移到位。");
    pause();
    print!("  ");
    countdown(5);
    let (tx, ty, info) = probe_under_cursor();
    println!("\n  目标坐标: ({}, {})", tx, ty);
    println!("  窗口标题: {}", if info.title.is_empty() { "(空)" } else { &info.title });
    println!("  窗口类名: {}", if info.class.is_empty() { "(空)" } else { &info.class });
    if info.pid != 0 {
        println!(
            "  进程: {} (PID {})",
            info.proc_name.as_deref().unwrap_or("(未知)"),
            info.pid
        );
        match info.elevated {
            Some(true) => println!("  进程权限: 管理员"),
            Some(false) => println!("  进程权限: 普通"),
            None => println!("  进程权限: (无法读取，可能权限比本工具高)"),
        }
    } else {
        println!("  ⚠ 没拿到窗口进程（鼠标可能在桌面/任务栏？）");
    }

    let uipi_hit = matches!(info.elevated, Some(true)) && !self_elevated;
    if uipi_hit {
        println!("\n  ★★★ UIPI 命中：目标是管理员权限，本工具是普通权限。");
        println!("        Windows UIPI 会静默拦截跨权限边界的 SendInput。");
        println!("        这极可能就是失效原因 —— 请以管理员身份重新运行验证。");
    } else if matches!(info.elevated, None) && !self_elevated {
        println!("\n  ★ 提示：无法读取目标进程权限（OpenProcess 被拒），");
        println!("    通常说明它权限更高 —— 同样建议提权后再测。");
    }

    println!("\n━━━ 第 3 步：反作弊 / 驱动过滤检测 ━━━");
    let upper = read_upper_filters();
    let extra: Vec<&String> = upper.iter().filter(|f| f.to_lowercase() != "mouclass").collect();
    println!(
        "  鼠标类 UpperFilters: [{}]",
        if upper.is_empty() { "无（默认仅 mouclass）".to_string() } else { upper.join(", ") }
    );
    if !extra.is_empty() {
        println!("  ★ 鼠标驱动链上挂了非默认过滤驱动: {:?}", extra);
        println!("    合成鼠标输入极可能在驱动层被它吞掉。");
    }
    let cheats = scan_known_anticheats();
    if cheats.is_empty() {
        println!("  已知反作弊服务: 未发现");
    } else {
        println!("  ★ 发现反作弊组件: {}", cheats.join(", "));
        println!("    它们通常在驱动层过滤合成输入（SendInput / mouse_event 都会被拦）。");
    }

    println!("\n━━━ 第 4 步：注入策略实测 ━━━");
    println!("  将对坐标 ({},{}) 依次执行 5 种点击注入方式。", tx, ty);
    println!("  每次前会 3 秒倒计时，期间请按 Alt+Tab 把目标窗口切到前台。");
    println!("  执行后观察目标是否反应（按钮按下/菜单弹出/角色移动等），用 y/n 记录。\n");

    let strategies: Vec<Strategy> = vec![
        Strategy {
            name: "SetCursorPos + SendInput (dwExtraInfo=0)",
            desc: "标准合成点击、无标记 —— 多数 GUI 接受",
            run: s1,
        },
        Strategy {
            name: "SetCursorPos + SendInput (项目标记 0x800DA5A5)",
            desc: "你项目当前用的方式，带合成输入标记",
            run: s2,
        },
        Strategy {
            name: "纯 SendInput 绝对移动 + 点击 (无标记)",
            desc: "不调 SetCursorPos，仅靠 SendInput 的 ABSOLUTE 移动",
            run: s3,
        },
        Strategy {
            name: "SetCursorPos + mouse_event (旧API)",
            desc: "底层老 API，Win10+ 行为与 SendInput 基本一致",
            run: s4,
        },
        Strategy {
            name: "SetCursorPos + PostMessage WM_LBUTTON*",
            desc: "直接投到窗口消息队列，绕过输入管线（对照用）",
            run: s5,
        },
    ];

    let mut results: Vec<(&str, bool)> = Vec::new();
    for (i, s) in strategies.iter().enumerate() {
        println!("── 策略 {}/{}: {} ──", i + 1, strategies.len(), s.name);
        println!("  {}", s.desc);
        println!("  请把目标窗口切到前台...");
        print!("  ");
        countdown(3);
        if !info.hwnd.is_null() {
            unsafe { SetForegroundWindow(info.hwnd) };
        }
        thread::sleep(Duration::from_millis(120));
        (s.run)(tx, ty, info.hwnd);
        thread::sleep(Duration::from_millis(300));
        let ok = read_yn("  ★ 目标有反应吗? (y/n): ");
        results.push((s.name, ok));
        println!();
    }

    println!("━━━ 第 5 步：诊断结论 ━━━");
    let worked: Vec<&str> = results.iter().filter(|(_, ok)| *ok).map(|(n, _)| *n).collect();
    let failed: Vec<&str> = results.iter().filter(|(_, ok)| !*ok).map(|(n, _)| *n).collect();
    println!("  生效: {}", if worked.is_empty() { "无".into() } else { worked.join(" | ") });
    println!("  无效: {}", if failed.is_empty() { "无".into() } else { failed.join(" | ") });
    println!();

    if worked.is_empty() {
        println!("  ★ 所有用户态注入都失败。");
        if !cheats.is_empty() || !extra.is_empty() {
            println!("  结合驱动检测，几乎可以确定：目标进程在驱动层过滤了合成输入。");
        } else {
            println!("  即便没检测到反作弊驱动，目标也很可能走 Raw Input 并忽略合成事件。");
        }
        println!();
        println!("  结论：SendInput / mouse_event / PostMessage 这类用户态注入对它无效。");
        println!("  能稳定工作的只有【硬件级注入】：");
        println!("    1) 外接 USB HID 设备（kmbox / Arduino Pro Micro HID / CH9329 串口鼠标）");
        println!("       —— 操作系统从驱动层收到'真实'硬件输入，游戏无法区分。");
        println!("    2) 这是游戏脚本/按键精灵能稳定工作的主流方式。");
        if uipi_hit {
            println!("\n  另：UIPI 也命中，提权后可能仍无效（因为根因是驱动层过滤）。");
        }
    } else if worked.len() == strategies.len() {
        println!("  ★ 所有策略都生效 —— 你这台环境下注入路径本身没问题。");
        println!("  若项目里仍点不动，差异最可能在：");
        println!("    - 项目的 dwExtraInfo 标记（对比策略1 和 策略2 的结果即可定位）");
        println!("    - 项目的点击时序 / 目标坐标计算不准 / 运行权限");
    } else {
        println!("  ★ 部分策略生效，按差异定位：");
        let s1_ok = results[0].1;
        let s2_ok = results[1].1;
        let s3_ok = results[2].1;
        let s4_ok = results[3].1;
        let s5_ok = results[4].1;
        if s1_ok && !s2_ok {
            println!("  · 策略1(无标记)生效、策略2(带项目标记 0x800DA5A5)无效");
            println!("    => 关键！项目给 SendInput 加了 0x800DA5A5 的 dwExtraInfo，");
            println!("       被目标识别为合成输入而丢弃。");
            println!("       修复方向：mouse.rs 里点击 down/up 的 dwExtraInfo 改为 0。");
            println!("       注意：该标记被 hotkey 自防触发逻辑用到，需同步改造。");
        }
        if !s3_ok && s1_ok {
            println!("  · 策略1(SetCursorPos)生效、策略3(纯 ABSOLUTE)无效");
            println!("    => 目标信 SetCursorPos 的真实光标位置，不信 SendInput 的 ABSOLUTE 移动。");
            println!("       修复方向：点击前显式 SetCursorPos，不要只靠 SendInput MOVE。");
        }
        if s5_ok && !s1_ok {
            println!("  · 策略5(PostMessage)生效、策略1(SendInput)无效");
            println!("    => 目标只读窗口消息队列。可改用 PostMessage 给目标 HWND 发");
            println!("       WM_LBUTTONDOWN/UP（需先拿到目标窗口句柄 + 客户区坐标）。");
        }
        if s4_ok && !s1_ok {
            println!("  · 策略4(mouse_event)生效、策略1(SendInput)无效 —— 较罕见");
            println!("    （Win10+ 两者底层同源，建议复查观察是否偶发）。");
        }
    }

    println!("\n----------------------------------------------------");
    println!("诊断完成。把上面的【生效/无效】结果贴出来，可进一步精确定位。");
    pause();
}

// ---------- 策略实现 ----------

fn s1(tx: i32, ty: i32, _h: Hwnd) {
    unsafe { SetCursorPos(tx, ty) };
    thread::sleep(Duration::from_millis(20));
    click_sendinput(0);
}

fn s2(tx: i32, ty: i32, _h: Hwnd) {
    unsafe { SetCursorPos(tx, ty) };
    thread::sleep(Duration::from_millis(20));
    click_sendinput(AUTOCLICKER_EXTRA_INFO);
}

fn s3(tx: i32, ty: i32, _h: Hwnd) {
    let (nx, ny) = normalize_virtual(tx, ty);
    let mv = make_abs_move(nx, ny);
    unsafe {
        SendInput(1, &mv, mem::size_of::<INPUT>() as i32);
    }
    thread::sleep(Duration::from_millis(20));
    click_sendinput(0);
}

fn s4(tx: i32, ty: i32, _h: Hwnd) {
    unsafe {
        SetCursorPos(tx, ty);
        thread::sleep(Duration::from_millis(20));
        mouse_event(MOUSEEVENTF_LEFTDOWN, 0, 0, 0, 0);
        thread::sleep(Duration::from_millis(40));
        mouse_event(MOUSEEVENTF_LEFTUP, 0, 0, 0, 0);
    }
}

fn s5(tx: i32, ty: i32, h: Hwnd) {
    unsafe {
        SetCursorPos(tx, ty);
        thread::sleep(Duration::from_millis(20));
        if !h.is_null() {
            let mut client = POINT { x: tx, y: ty };
            ScreenToClient(h, &mut client);
            let lparam = (((client.y as u32) << 16) | (client.x as u32 & 0xFFFF)) as isize;
            PostMessageW(h, WM_LBUTTONDOWN, MK_LBUTTON, lparam);
            thread::sleep(Duration::from_millis(40));
            PostMessageW(h, WM_LBUTTONUP, 0, lparam);
        }
    }
}

fn click_sendinput(extra: usize) {
    unsafe {
        let down = make_click(MOUSEEVENTF_LEFTDOWN, extra);
        let up = make_click(MOUSEEVENTF_LEFTUP, extra);
        SendInput(1, &down, mem::size_of::<INPUT>() as i32);
        thread::sleep(Duration::from_millis(40));
        SendInput(1, &up, mem::size_of::<INPUT>() as i32);
    }
}

fn make_abs_move(nx: i32, ny: i32) -> INPUT {
    INPUT {
        r#type: INPUT_MOUSE,
        Anonymous: INPUT_0 {
            mi: MOUSEINPUT {
                dx: nx,
                dy: ny,
                mouseData: 0,
                dwFlags: MOUSEEVENTF_ABSOLUTE | MOUSEEVENTF_MOVE | MOUSEEVENTF_VIRTUALDESK,
                time: 0,
                dwExtraInfo: 0,
            },
        },
    }
}

fn make_click(flags: u32, extra: usize) -> INPUT {
    INPUT {
        r#type: INPUT_MOUSE,
        Anonymous: INPUT_0 {
            mi: MOUSEINPUT {
                dx: 0,
                dy: 0,
                mouseData: 0,
                dwFlags: flags,
                time: 0,
                dwExtraInfo: extra,
            },
        },
    }
}

fn normalize_virtual(x: i32, y: i32) -> (i32, i32) {
    unsafe {
        let left = GetSystemMetrics(SM_XVIRTUALSCREEN);
        let top = GetSystemMetrics(SM_YVIRTUALSCREEN);
        let w = GetSystemMetrics(SM_CXVIRTUALSCREEN);
        let h = GetSystemMetrics(SM_CYVIRTUALSCREEN);
        if w <= 0 || h <= 0 {
            return (0, 0);
        }
        let nx = (((x - left) as f64 / w as f64) * 65535.0).round() as i32;
        let ny = (((y - top) as f64 / h as f64) * 65535.0).round() as i32;
        (nx, ny)
    }
}

// ---------- 探测 ----------

fn probe_under_cursor() -> (i32, i32, TargetInfo) {
    let mut pt = POINT { x: 0, y: 0 };
    unsafe { GetCursorPos(&mut pt) };
    let hwnd = unsafe { WindowFromPoint(pt) };
    let mut class_buf = [0u16; 256];
    let clen = unsafe { GetClassNameW(hwnd, class_buf.as_mut_ptr(), class_buf.len() as i32) };
    let class = String::from_utf16_lossy(&class_buf[..clen.max(0) as usize]);
    let mut title_buf = [0u16; 256];
    let tlen = unsafe { GetWindowTextW(hwnd, title_buf.as_mut_ptr(), title_buf.len() as i32) };
    let title = String::from_utf16_lossy(&title_buf[..tlen.max(0) as usize]);
    let mut pid = 0u32;
    unsafe { GetWindowThreadProcessId(hwnd, &mut pid) };
    let proc_name = if pid != 0 { process_name(pid) } else { None };
    let elevated = if pid != 0 { process_elevation(pid) } else { None };
    (pt.x, pt.y, TargetInfo { hwnd, class, title, pid, proc_name, elevated })
}

fn process_name(pid: u32) -> Option<String> {
    unsafe {
        let h = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid);
        if h.is_null() {
            return None;
        }
        let mut buf = [0u16; 1024];
        let mut size = buf.len() as u32;
        let ok = QueryFullProcessImageNameW(h, 0, buf.as_mut_ptr(), &mut size);
        CloseHandle(h);
        if ok == 0 {
            return None;
        }
        let path = String::from_utf16_lossy(&buf[..size as usize]);
        let name = path.rsplit(|c| c == '\\' || c == '/').next().unwrap_or(&path);
        Some(name.to_string())
    }
}

fn is_current_elevated() -> bool {
    unsafe {
        let me = GetCurrentProcess();
        let mut token: HANDLE = std::ptr::null_mut();
        if OpenProcessToken(me, TOKEN_QUERY, &mut token) == 0 {
            return false;
        }
        let r = query_elevation(token);
        CloseHandle(token);
        r.unwrap_or(false)
    }
}

fn process_elevation(pid: u32) -> Option<bool> {
    unsafe {
        let h = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid);
        if h.is_null() {
            return None;
        }
        let mut token: HANDLE = std::ptr::null_mut();
        let mut result = None;
        if OpenProcessToken(h, TOKEN_QUERY, &mut token) != 0 {
            result = query_elevation(token);
            CloseHandle(token);
        }
        CloseHandle(h);
        result
    }
}

unsafe fn query_elevation(token: HANDLE) -> Option<bool> {
    let mut elev = mem::zeroed::<TOKEN_ELEVATION>();
    let mut ret = 0u32;
    let ok = GetTokenInformation(
        token,
        TokenElevation,
        &mut elev as *mut _ as *mut _,
        mem::size_of::<TOKEN_ELEVATION>() as u32,
        &mut ret,
    );
    if ok != 0 {
        Some(elev.TokenIsElevated != 0)
    } else {
        None
    }
}

// ---------- 反作弊检测 ----------

fn read_upper_filters() -> Vec<String> {
    let subkey: Vec<u16> = "SYSTEM\\CurrentControlSet\\Control\\Class\\{4D36E96F-E325-11CE-BFC1-08002BE10318}"
        .encode_utf16()
        .chain(std::iter::once(0))
        .collect();
    let value: Vec<u16> = "UpperFilters".encode_utf16().chain(std::iter::once(0)).collect();
    unsafe {
        let mut hkey: HKEY = 0 as HKEY;
        if RegOpenKeyExW(HKEY_LOCAL_MACHINE, subkey.as_ptr(), 0, KEY_READ, &mut hkey) != 0 {
            return Vec::new();
        }
        let mut size: u32 = 0;
        RegQueryValueExW(
            hkey,
            value.as_ptr(),
            std::ptr::null(),
            std::ptr::null_mut(),
            std::ptr::null_mut(),
            &mut size,
        );
        if size < 2 {
            RegCloseKey(hkey);
            return Vec::new();
        }
        let mut buf = vec![0u8; size as usize];
        let _ = RegQueryValueExW(
            hkey,
            value.as_ptr(),
            std::ptr::null(),
            std::ptr::null_mut(),
            buf.as_mut_ptr(),
            &mut size,
        );
        RegCloseKey(hkey);
        let u16s: Vec<u16> = (0..size as usize / 2)
            .map(|i| (buf[i * 2] as u16) | ((buf[i * 2 + 1] as u16) << 8))
            .collect();
        parse_multi_sz(&u16s)
    }
}

fn parse_multi_sz(buf: &[u16]) -> Vec<String> {
    let mut out = Vec::new();
    let mut start = 0;
    while start < buf.len() {
        if buf[start] == 0 {
            break;
        }
        let end = buf[start..]
            .iter()
            .position(|&c| c == 0)
            .map(|p| p + start)
            .unwrap_or(buf.len());
        let s = String::from_utf16_lossy(&buf[start..end]);
        if !s.is_empty() {
            out.push(s);
        }
        start = end + 1;
    }
    out
}

fn scan_known_anticheats() -> Vec<String> {
    let names = [
        "ACE-BASE", "ACE-Guard", "AntiCheatExpert", "ACE-TRAY", "ACEnterprise", "AQTDrv",
        "TesSafe", "TP3Helper", "SGuard64", "SGuardSvc", "SGuardLite", "SGuardModule",
        "EasyAntiCheat", "EasyAntiCheat_OS", "BattlBe", "BEService", "BEGameService",
        "mhyprot", "mhyprot2", "HoYoProtect", "mihoyoprotect", "AtProtect",
        "XIGNCODE3", "x3", "nprotect", "NPPTNT2", "GameGuard", "wellbia",
        "HipsTray", "HipsMain", "Aegis", "FPService", "sguard",
    ];
    let mut found = Vec::new();
    for n in names {
        let path = format!("SYSTEM\\CurrentControlSet\\Services\\{}", n);
        let pathw: Vec<u16> = path.encode_utf16().chain(std::iter::once(0)).collect();
        unsafe {
            let mut hkey: HKEY = 0 as HKEY;
            if RegOpenKeyExW(HKEY_LOCAL_MACHINE, pathw.as_ptr(), 0, KEY_READ, &mut hkey) == 0 {
                RegCloseKey(hkey);
                found.push(n.to_string());
            }
        }
    }
    found.sort();
    found.dedup();
    found
}

// ---------- 控制台/IO ----------

fn set_utf8_console() {
    unsafe {
        SetConsoleOutputCP(65001);
        SetConsoleCP(65001);
    }
}

fn pause() {
    println!("  [按回车继续]");
    let mut s = String::new();
    let _ = io::stdin().read_line(&mut s);
}

fn countdown(sec: u64) {
    for i in (1..=sec).rev() {
        print!("\r倒计时 {} 秒...   ", i);
        let _ = io::stdout().flush();
        thread::sleep(Duration::from_secs(1));
    }
    println!("\r▶ 执行!           ");
    let _ = io::stdout().flush();
}

fn read_yn(prompt: &str) -> bool {
    loop {
        print!("{}", prompt);
        let _ = io::stdout().flush();
        let mut line = String::new();
        if io::stdin().read_line(&mut line).is_err() {
            return false;
        }
        match line.trim().to_lowercase().as_str() {
            "y" | "yes" | "是" => return true,
            "n" | "no" | "否" => return false,
            _ => println!("  请输入 y 或 n"),
        }
    }
}

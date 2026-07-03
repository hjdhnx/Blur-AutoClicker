pub mod cycle;
pub mod failsafe;
pub mod keyboard;
pub mod mouse;
pub mod process;
pub mod rng;
pub mod stats;
pub mod stop_reason;
pub mod worker;
use std::sync::atomic::{AtomicBool, AtomicI64};
pub use worker::start_clicker;
pub const AUTOCLICKER_EXTRA_INFO: usize = 0x800D_A5A5; //Just a random Identifier

/// 注入期间为 true。兼容模式下低级钩子用它替代 dwExtraInfo 标记识别自身事件。
pub static INJECTING_NOW: AtomicBool = AtomicBool::new(false);

static MARKER_ENABLED: AtomicBool = AtomicBool::new(true);

/// false（游戏兼容模式）→ 注入事件 dwExtraInfo=0，绕过会过滤已知 autoclicker 魔数的应用。
pub fn set_synthetic_marker_enabled(on: bool) {
    MARKER_ENABLED.store(on, std::sync::atomic::Ordering::SeqCst);
}

pub fn synthetic_marker_extra() -> usize {
    if MARKER_ENABLED.load(std::sync::atomic::Ordering::SeqCst) {
        AUTOCLICKER_EXTRA_INFO
    } else {
        0
    }
}

/// 兼容模式（marker 关闭）下为 false。mouse.rs 据此把光标移动从异步的
/// SendInput(MOVE) 切到同步的 SetCursorPos，避免 move/down 之间游戏内部
/// 光标位置尚未更新导致点击落点错误。
pub fn synthetic_marker_enabled() -> bool {
    MARKER_ENABLED.load(std::sync::atomic::Ordering::SeqCst)
}

pub fn injecting_begin() {
    INJECTING_NOW.store(true, std::sync::atomic::Ordering::SeqCst);
}

pub fn injecting_end() {
    INJECTING_NOW.store(false, std::sync::atomic::Ordering::SeqCst);
}

use self::mouse::VirtualScreenRect;

#[derive(Clone, Copy, Debug, PartialEq, Eq, serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub enum ProcessListMode {
    Whitelist,
    Blacklist,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub enum ProcessListBehavior {
    Pause,
    Stop,
}

#[derive(Clone, Debug, serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProcessListEntry {
    pub name: String,
    pub behavior: ProcessListBehavior,
    pub enabled: bool,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct SequenceTarget {
    pub x: i32,
    pub y: i32,
    pub clicks: usize,
}

#[derive(Clone, Debug)]
pub struct ClickerConfig {
    pub interval_secs: f64,
    pub variation: f64,
    pub limit: i32,
    pub duty: f64,
    pub time_limit: f64,
    pub button: i32,
    pub double_click_enabled: bool,
    pub double_click_gap_ms: u32,
    pub sequence_enabled: bool,
    pub sequence_points: Vec<SequenceTarget>,
    pub offset: f64,
    pub offset_chance: f64,
    pub smoothing: i32,
    pub custom_stop_zone_enabled: bool,
    pub custom_stop_zone: VirtualScreenRect,
    pub corner_stop_enabled: bool,
    pub corner_stop_tl: i32,
    pub corner_stop_tr: i32,
    pub corner_stop_bl: i32,
    pub corner_stop_br: i32,
    pub edge_stop_enabled: bool,
    pub edge_stop_top: i32,
    pub edge_stop_right: i32,
    pub edge_stop_bottom: i32,
    pub edge_stop_left: i32,
    pub input_type: i32,
    pub key_code: u16,
    pub keyboard_uppercase: bool,
    pub process_list_enabled: bool,
    pub process_list_mode: ProcessListMode,
    pub process_list_entries: Vec<ProcessListEntry>,
    pub task_switcher_stop_enabled: bool,
    pub game_compatible_mode: bool,
}

#[derive(Clone, Debug, serde::Serialize)]
pub struct RunOutcome {
    pub stop_reason: String,
    pub stop_reason_value: Option<f64>,
    pub click_count: i64,
    pub elapsed_secs: f64,
    pub avg_cpu: f64,
}
static CLICK_COUNT: AtomicI64 = AtomicI64::new(0);

#[link(name = "ntdll")]
extern "system" {
    fn NtSetTimerResolution(
        DesiredResolution: u32,
        SetResolution: u8,
        CurrentResolution: *mut u32,
    ) -> u32;
}

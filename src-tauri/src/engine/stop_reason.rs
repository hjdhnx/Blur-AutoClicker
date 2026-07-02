//! Stable snake_case codes emitted as `stop_reason` / `warning` over IPC.
//! The frontend translates these via the `stopReason` i18n namespace, so these
//! strings must never be human-readable prose. Keep them in sync with
//! `src/locales/{en,zh}/stopReason.json`.

pub const STOPPED: &str = "stopped";
pub const STOPPED_FROM_HOTKEY: &str = "stopped_from_hotkey";
pub const STOPPED_FROM_HOLD_HOTKEY: &str = "stopped_from_hold_hotkey";
pub const STOPPED_FROM_TOGGLE: &str = "stopped_from_toggle";
pub const STOPPED_FOR_HOTKEY_INPUT: &str = "stopped_for_hotkey_input";
pub const BLOCKED_BY_ALT_TAB: &str = "blocked_by_alt_tab";
pub const BLOCKED_BY_PROCESS_LIST: &str = "blocked_by_process_list";
pub const CLICK_LIMIT_REACHED: &str = "click_limit_reached";
pub const TIME_LIMIT_REACHED: &str = "time_limit_reached";
pub const TOP_LEFT_CORNER_FAILSAFE: &str = "top_left_corner_failsafe";
pub const TOP_RIGHT_CORNER_FAILSAFE: &str = "top_right_corner_failsafe";
pub const BOTTOM_LEFT_CORNER_FAILSAFE: &str = "bottom_left_corner_failsafe";
pub const BOTTOM_RIGHT_CORNER_FAILSAFE: &str = "bottom_right_corner_failsafe";
pub const TOP_EDGE_FAILSAFE: &str = "top_edge_failsafe";
pub const RIGHT_EDGE_FAILSAFE: &str = "right_edge_failsafe";
pub const BOTTOM_EDGE_FAILSAFE: &str = "bottom_edge_failsafe";
pub const LEFT_EDGE_FAILSAFE: &str = "left_edge_failsafe";
pub const CUSTOM_STOP_ZONE_FAILSAFE: &str = "custom_stop_zone_failsafe";

pub const WARNING_WHITELIST_EMPTY: &str = "warning_whitelist_empty";

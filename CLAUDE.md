# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

Blur Auto Clicker — a Windows-first desktop auto clicker built with **Tauri 2 + Rust + React 19 + TypeScript**. The defining trait is timing accuracy: the engine drives Windows timer resolution below 1ms via `NtSetTimerResolution` so actual CPS matches the configured value. CPS is capped at 500 (1000 available but not recommended).

## Commands

```powershell
npm run dev              # Tauri dev (launches vite + Rust app together)
npm run dev:nocrash      # Same as dev but without crashpad — for VS 2017-only toolchains (see Windows toolchain below)
npm run build            # Release NSIS installer -> src-tauri/target/release/bundle/nsis/
npm run frontend:build   # tsc -b && vite build (frontend only)
npm test                 # vitest run (one-shot)
npm run test:watch       # vitest watch
npm run lint             # eslint (flat config, ignores src-tauri)
npm run format:check     # prettier check
npm run format:write     # prettier write
npm run check:all        # EVERYTHING: cargo+rust checks + npm checks (run before PR)
npm run fix:all          # auto-fix: cargo fmt + prettier + eslint --fix + npm audit fix
```

Rust commands run against `src-tauri/Cargo.toml`:

```powershell
cargo test --manifest-path src-tauri/Cargo.toml --locked
cargo check --manifest-path src-tauri/Cargo.toml --locked
cargo clippy --manifest-path src-tauri/Cargo.toml
cargo fmt --manifest-path src-tauri/Cargo.toml --check
```

Run a single Rust test: `cargo test --manifest-path src-tauri/Cargo.toml <test_name>`.
Run a single frontend test file: `npx vitest run src/__tests__/main.test.tsx`, or by name `npx vitest run -t "<pattern>"`.

### Windows toolchain (build prerequisites)

`npm run dev` / `npm run build` link the `crashpad-rs` **prebuilt** static library (the `crashpad` cargo feature is on by default in `src-tauri/Cargo.toml`). That prebuilt C++ requires the **MSVC v143 ABI** (VS 2019 16.5+ / VS 2022); linking against the older VS 2017 BuildTools (MSVC 14.16) fails at link time with unresolved `__std_find_trivial_*` / `__CxxFrameHandler4`. `cargo check` passes (no link step), so the failure only surfaces at `tauri dev` / `tauri build` / `cargo test` — do not mistake it for a code error.

- **Fix once, for everything**: install **Visual Studio 2022 BuildTools** with the "Desktop development with C++" workload (MSVC v143 + Windows 10/11 SDK). After that, `npm run dev`, `npm run build`, and `cargo test` all link cleanly.
- **Or develop without crashpad**: run `npm run dev:nocrash` (= `tauri dev --no-default-features`). You lose crash-minidump capture in dev, but every clicker feature works. Release builds still need v143 to link crashpad.

This is a toolchain-version issue, not a macOS/Windows portability problem — the upstream author's CI (`windows-latest`) ships the newer MSVC, which is why their published build works.

## Workflow

- PRs target the **`dev`** branch, not `main`. CI (`.github/workflows/ci.yml`) runs on both.
- Generated files live under `src-tauri/gen/` — only commit them when intentionally updated; review unexpected diffs.
- `src-tauri/gen/schemas/desktop-schema.json` and `windows-schema.json` are regenerated from `capabilities/` + `tauri.conf.json`.

## Architecture

### Two-window Tauri app

1. **`main`** window — the settings UI. Declared in `tauri.conf.json` (`500x150`, transparent, no decorations, custom drag via `TitleBar.tsx`). Resized at runtime per active tab via `getPanelSize()` in `src/App.tsx`.
2. **`overlay`** window — transparent, click-through, full-screen. **Created at runtime** in `src-tauri/src/overlay.rs::init_overlay()` (NOT in `tauri.conf.json`) using a dedicated user-data dir (`EBWebView-overlay`) to sidestep WebView2 issues. Initialized lazily when the frontend emits the `frontend-ready` event. Draws failsafe zones, sequence points, and the custom stop zone; also auto-hides on inactivity (`spawn_overlay_auto_hide`).

**Two HTML entrypoints** — `index.html` (main) and `overlay.html` (overlay). Both MUST be listed in `vite.config.ts` `rollupOptions.input` or the overlay build breaks.

### Frontend (`src/`)

- `App.tsx` is the orchestrator: tab state, panel sizing, status event listener, IPC glue. Tabs: `simple | advanced | zones | settings`, each a **lazy-loaded** panel.
- **Settings schema is descriptor-driven** in `src/settingsSchema.ts` — it is the single source of truth for UI fields, defaults, presets (`buildPresetSnapshot`), and sanitization (`sanitizeSettings`). The Rust mirror is `src-tauri/src/settings/mod.rs::ClickerSettings`; the comment at its top reminds you to keep them in sync. When backend-facing fields change, bump `BACKEND_SETTINGS_SCHEMA_VERSION` in `App.tsx`.
- Persistence: `tauri-plugin-store` writing `settings.json`, wrapped by `src/store.ts`. `sanitizeSettings` runs on both load and save.
- `hotkeys.ts` mirrors the Rust hotkey logic for capture/canonicalization (`canonicalizeHotkeyForBackend`).
- Frontend test setup (`src/test/setup.ts`) mocks `@tauri-apps/plugin-log`; add mocks for other Tauri APIs as tests need them.

### Backend (`src-tauri/src/`)

- **`engine/`** — the clicker core:
  - `worker.rs` — `start_clicker`, the main run loop. Imports `NtSetTimerResolution` and `QueryThreadCycleTime` (CPU measured by thread cycles, not wall-clock, for accuracy on short runs).
  - `cycle.rs` — `ClickCyclePlan` (duty-cycle / interval / variation timing).
  - `mouse.rs` / `keyboard.rs` — Win32 `SendInput` injection. `VirtualScreenRect` is the multi-monitor virtual coordinate space.
  - `failsafe.rs` — stop conditions: edge/corner/custom-zone/process-list/task-switcher. Returns stable **stop-reason codes** (not prose) from `engine/stop_reason.rs`.
  - `stop_reason.rs` — snake_case code constants (e.g. `BLOCKED_BY_ALT_TAB`, `CLICK_LIMIT_REACHED`) emitted over IPC; the frontend translates them via the `stopReason` i18n namespace. Keep codes in sync with `src/locales/{en,zh}/stopReason.json`.
  - `process.rs` — process detection including the **RTSS guard**: `is_process_running("RTSS.exe")` checked in `lib.rs::run()`; if found, `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--disable-gpu` is set to prevent WebView2 crashes.
  - `stats.rs`, `rng.rs`.
- **`hotkeys.rs`** — global-shortcut registration + low-level keyboard hook (largest module by line count besides worker). Bare mouse left/right hotkeys are rejected at parse time (`parse_hotkey_binding`) and mirrored in the frontend (`isBareMouseMainKeyBlocked` in `hotkeys.ts` + guard in `HotkeyCaptureInput.tsx`) — a bare left/right-click hotkey would fire on every click and hijack the mouse. Combos with a modifier (e.g. `Ctrl+mouseleft`) and the middle/side buttons stay allowed.
- **`ui_commands.rs`** — every `#[tauri::command]` exposed to the frontend. **When adding/removing a command, also update the `invoke_handler![...]` list in `lib.rs::run()`** or the frontend `invoke()` will silently fail.
- **`app_state.rs`** — `ClickerState`: `Mutex`/`AtomicXxx` shared state, `.manage()`d by Tauri and accessed via `app.state::<ClickerState>()`. Use `poisoned_inner` (from `error.rs`) to recover from poisoned mutexes.
- **`overlay.rs`** — overlay window lifecycle + zone rendering + pick-mode state (`SEQUENCE_PICK_OVERLAY_ACTIVE`, `CUSTOM_STOP_ZONE_PICK_OVERLAY_ACTIVE`).
- **`custom_stop_zone_picker.rs`**, **`sequence_picker.rs`** — fullscreen pickers.
- **`diagnostics.rs`** — log/panic-report dirs + diagnostics bundle export (`get_diagnostics_info`, `export_diagnostics_bundle`).
- **`crash_handler.rs`** — optional crashpad integration behind the `crashpad` cargo feature (on by default).
- **`updates/update_checker.rs`** — Tauri updater wrapper; endpoint + pubkey in `tauri.conf.json`.

### Frontend ↔ Backend IPC

- **Commands**: `invoke("command_name", { args })` → `ui_commands.rs` (and a few in `overlay.rs`/`updates`).
- **Events**: status updates flow backend→frontend on the **`clicker-status`** event (constant `STATUS_EVENT` in `lib.rs`, typed as `ClickerStatus` in `store.ts`). The frontend→backend **`frontend-ready`** event triggers overlay init.
- **Synthetic-click marker**: `AUTOCLICKER_EXTRA_INFO = 0x800D_A5A5` (in `engine/mod.rs`) is attached to every injected input event so the engine/hook can recognize its own events (used for hotkey self-suppression and failsafe logic).
- **Stop-reason contract** (i18n-aware): the backend emits `stop_reason`/`warning` as **codes** plus a numeric `stop_reason_value` (for the click/time-limit interpolation). The IPC payload `ClickerStatusPayload` (`app_state.rs`) → `ClickerStatus` (`store.ts`) carries both. Frontend maps code → localized string in `TitleBar.tsx::translateStopReason(t, code, value)`. When adding a new stop reason, add a constant in `stop_reason.rs`, a key in both `stopReason.json` files, and handle it in `translateStopReason`.

### Internationalization (i18n)

UI is fully Chinese/English via **react-i18next**. Adding/changing a user-visible string almost always means editing locale JSON, not just code.

- **Bootstrap**: `src/i18n/index.ts` initializes i18next with bundled JSON resources and is called from `src/main.tsx` **before** `createRoot().render(...)` (async boot: `loadSettings → resolveInitialLanguage → initI18n → render`). Language resolution: saved setting → `navigator.language` (`zh*`→zh, else en) → `en`. No `I18nextProvider` needed; `useTranslation()` reads the singleton.
- **7 namespaces**: `common | advanced | zones | settings | hotkeys | stopReason | overlay` — at `src/locales/{en,zh}/<ns>.json`. `common` holds shared primitives (tabs, window controls, units, all enum-option labels under `common.options.*`, shared control labels under `common.controls.*`). Panel-specific strings live in that panel's namespace.
- **Language setting**: a `language` field in `src/settingsSchema.ts` (`SETTINGS_ONLY_FIELDS`, appearance section). It is **frontend-only** — explicitly listed in the "omitted from Rust" comment at `src-tauri/src/settings/mod.rs:108`, so no Rust mirror change and **no `BACKEND_SETTINGS_SCHEMA_VERSION` bump**. Switcher UI is in `SettingsPanel.tsx`; onChange calls `i18n.changeLanguage(v)` + `update({ language: v })`. No restart needed.
- **Translation pattern in components**: `const { t } = useTranslation();` then `t("ns:key")` or `t("ns:key", { var })` for interpolation (`{{var}}` syntax). For enum option arrays (`MODE_OPTIONS`, `MOUSE_BUTTON_OPTIONS`, etc.) keep the raw `value` as data identity and translate at render, e.g. `t(\`common:options.mode.\${value.toLowerCase()}\`)` — never bake translated strings into the arrays.
- **Hotkey labels**: `src/hotkeys.ts::defaultHotkeyLabels` stays as the English fallback (used by tests/non-React paths). In components, build translated labels via `src/i18n/hotkeyLabels.ts::buildHotkeyLabels(t)` and pass to the existing `formatHotkeyForDisplay(value, { labels })` `labels` prop.
- **Overlay window** (not React): `src/overlay/i18n.ts` reads the language from the shared store (`LazyStore("settings.json")`) and applies translations to `data-i18n="ns.key"` elements in `overlay.html`. It also listens for the Tauri `language-changed` event to re-translate live when the user switches language (the main window emits it on change). Keep it React/i18next-free.
- **System tray menu**: localized on the Rust side. `lib.rs::setup_tray` reads `ClickerState.language` to pick `Show`/`Quit` text (`tray_menu_texts`), building the tray with id `main-tray`. The frontend calls the `set_ui_language` command on bootstrap (`main.tsx`) and on switch (`SettingsPanel.tsx`); the command (`ui_commands.rs`) updates `ClickerState.language` and calls `lib.rs::rebuild_tray_menu` to swap the menu live. Tray tooltip stays untranslated (product name). When adding a new tray item, update `tray_menu_texts` + rebuild path.
- **ErrorBoundary.tsx** deliberately keeps its fallback strings English-hardcoded — it must render even if i18next itself is broken.

### Capabilities / permissions

`src-tauri/capabilities/default.json` applies to **both** `main` and `overlay` windows. When a new Tauri core/plugin API needs permission, add it here; the generated schemas in `src-tauri/gen/schemas/` update accordingly.

## Testing notes

- Frontend tests use vitest + jsdom + `@testing-library/react`; co-located `__tests__/` directories. Tauri APIs must be mocked in `src/test/setup.ts` or per-test. `setup.ts` also calls `initI18n("en")` in `beforeAll` so any component using `useTranslation` renders.
- Rust tests use `tempfile` (dev-dependency) for filesystem fixtures.

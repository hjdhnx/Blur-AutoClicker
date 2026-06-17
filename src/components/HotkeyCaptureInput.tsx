import { useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  captureHotkey,
  captureMouseHotkey,
  formatHotkeyForDisplay,
  getKeyboardLayoutMap,
  type HotkeyDisplayLabels,
} from "../hotkeys";

const hotkeyLabels: HotkeyDisplayLabels = {
  empty: "Click and press keys",
  modifiers: {
    ctrl: "Ctrl",
    alt: "Alt",
    shift: "Shift",
    super: "Super",
  },
  keys: {
    up: "Up",
    down: "Down",
    left: "Left",
    right: "Right",
    pageup: "Page Up",
    pagedown: "Page Down",
    backspace: "Backspace",
    delete: "Delete",
    insert: "Insert",
    home: "Home",
    end: "End",
    enter: "Enter",
    tab: "Tab",
    space: "Space",
    escape: "Esc",
    esc: "Esc",
    capslock: "Caps Lock",
    numlock: "Num Lock",
    scrolllock: "Scroll Lock",
    printscreen: "Print Screen",
    pause: "Pause",
    menu: "Menu",
    mouseleft: "Mouse Left",
    mouseright: "Mouse Right",
    mousemiddle: "Scroll Button",
    mouse4: "Mouse Back",
    mouse5: "Mouse Forward",
    numpad0: "Num 0",
    numpad1: "Num 1",
    numpad2: "Num 2",
    numpad3: "Num 3",
    numpad4: "Num 4",
    numpad5: "Num 5",
    numpad6: "Num 6",
    numpad7: "Num 7",
    numpad8: "Num 8",
    numpad9: "Num 9",
    numpadadd: "Num +",
    numpadsubtract: "Num -",
    numpadmultiply: "Num *",
    numpaddivide: "Num /",
    numpaddecimal: "Num .",
  },
};


interface Props {
  value: string;
  onChange: (next: string) => void;
  className: string;
  style?: React.CSSProperties;
}

export default function HotkeyCaptureInput({
  value,
  onChange,
  className,
  style,
}: Props) {
  const [listening, setListening] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const ignorePrimaryInputMouseUntilRef = useRef(0);
  const suppressedMouseButtonRef = useRef<number | null>(null);
  const suppressResetTimerRef = useRef<number | null>(null);
  const [layoutMap, setLayoutMap] =
    useState<Awaited<ReturnType<typeof getKeyboardLayoutMap>>>(null);

  useEffect(() => {
    let active = true;

    getKeyboardLayoutMap().then((map) => {
      if (active) {
        setLayoutMap(map);
      }
    });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    return () => {
      if (suppressResetTimerRef.current !== null) {
        window.clearTimeout(suppressResetTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    invoke("set_hotkey_capture_active", { active: listening }).catch((err) => {
      console.error("Failed to toggle hotkey capture state:", err);
    });

    return () => {
      if (!listening) return;

      invoke("set_hotkey_capture_active", { active: false }).catch((err) => {
        console.error("Failed to clear hotkey capture state:", err);
      });
    };
  }, [listening]);

  useEffect(() => {
    const handleSuppressedMouseEvent = (event: MouseEvent) => {
      if (suppressedMouseButtonRef.current !== event.button) return;

      if (event.cancelable) {
        event.preventDefault();
      }
      event.stopPropagation();
    };

    window.addEventListener("mouseup", handleSuppressedMouseEvent, true);
    window.addEventListener("click", handleSuppressedMouseEvent, true);
    window.addEventListener("auxclick", handleSuppressedMouseEvent, true);
    window.addEventListener("contextmenu", handleSuppressedMouseEvent, true);

    return () => {
      window.removeEventListener("mouseup", handleSuppressedMouseEvent, true);
      window.removeEventListener("click", handleSuppressedMouseEvent, true);
      window.removeEventListener("auxclick", handleSuppressedMouseEvent, true);
      window.removeEventListener("contextmenu", handleSuppressedMouseEvent, true);
    };
  }, []);

  useEffect(() => {
    if (!listening) return;

    const finishCapture = (nextHotkey?: string) => {
      if (nextHotkey !== undefined) {
        onChange(nextHotkey);
      }
      setListening(false);
      inputRef.current?.blur();
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();

      if (event.key === "Escape") {
        finishCapture();
        return;
      }

      if (
        (event.key === "Backspace" || event.key === "Delete") &&
        !event.ctrlKey &&
        !event.altKey &&
        !event.shiftKey &&
        !event.metaKey
      ) {
        finishCapture("");
        return;
      }

      const nextHotkey = captureHotkey(event);
      if (!nextHotkey) return;

      finishCapture(nextHotkey);
    };

    const handleMouseDown = (event: MouseEvent) => {
      const input = inputRef.current;
      const isInputTarget =
        input !== null &&
        event.target instanceof Node &&
        input.contains(event.target);

      if (
        isInputTarget &&
        event.button === 0 &&
        performance.now() < ignorePrimaryInputMouseUntilRef.current
      ) {
        return;
      }

      const nextHotkey = captureMouseHotkey(event);
      if (!nextHotkey) return;

      suppressedMouseButtonRef.current = event.button;
      if (suppressResetTimerRef.current !== null) {
        window.clearTimeout(suppressResetTimerRef.current);
      }
      suppressResetTimerRef.current = window.setTimeout(() => {
        suppressedMouseButtonRef.current = null;
        suppressResetTimerRef.current = null;
      }, 200);

      if (event.cancelable) {
        event.preventDefault();
      }
      event.stopPropagation();

      finishCapture(nextHotkey);
    };

    window.addEventListener("keydown", handleKeyDown, true);
    window.addEventListener("mousedown", handleMouseDown, true);

    return () => {
      window.removeEventListener("keydown", handleKeyDown, true);
      window.removeEventListener("mousedown", handleMouseDown, true);
    };
  }, [listening, onChange]);

  const displayText = useMemo(
    () =>
      listening
        ? "Press keys..."
        : formatHotkeyForDisplay(value, layoutMap, hotkeyLabels),
    [layoutMap, listening, value],
  );

  return (
    <input
      ref={inputRef}
      type="text"
      className={className}
      value={displayText}
      readOnly
      onMouseDown={(event) => {
        if (event.button === 0) {
          ignorePrimaryInputMouseUntilRef.current = performance.now() + 150;
        }
      }}
      onFocus={() => setListening(true)}
      onBlur={() => setListening(false)}
      onContextMenu={(event) => {
        if (listening) {
          event.preventDefault();
        }
      }}
      spellCheck={false}
      style={style}
    />
  );
}

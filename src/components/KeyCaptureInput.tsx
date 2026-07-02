import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { useTranslation } from "react-i18next";
import {
  captureHotkey,
  captureModifierHotkey,
  formatHotkeyForDisplay,
  getKeyboardLayoutMap,
  getStateClass,
} from "../hotkeys";
import { buildHotkeyLabels } from "../i18n/hotkeyLabels";
import { isAlphabeticKeyboardKey } from "../keyboardKeyCase";
import type { KeyboardKeyCase, MouseButton } from "../store";

interface Props {
  value: string;
  onChange: (next: string) => void;
  className?: string;
  style?: CSSProperties;
  keyboardKeyCase?: KeyboardKeyCase;
  onMouseButtonCapture?: (button: MouseButton) => void;
  conflicts?: string[];
}

function applyKeyboardKeyCase(
  value: string,
  displayText: string,
  keyboardKeyCase?: KeyboardKeyCase,
) {
  if (!keyboardKeyCase || !isAlphabeticKeyboardKey(value)) {
    return displayText;
  }

  return keyboardKeyCase === "upper"
    ? displayText.toUpperCase()
    : displayText.toLowerCase();
}

export default function KeyCaptureInput({
  value,
  onChange,
  className,
  style,
  keyboardKeyCase,
  onMouseButtonCapture,
  conflicts,
}: Props) {
  const { t } = useTranslation("hotkeys");
  const labels = useMemo(() => buildHotkeyLabels(t), [t]);
  const [listening, setListening] = useState(false);
  const inputRef = useRef<HTMLButtonElement | null>(null);
  const [layoutMap, setLayoutMap] =
    useState<Awaited<ReturnType<typeof getKeyboardLayoutMap>>>(null);
  const onChangeRef = useRef(onChange);
  const onMouseButtonCaptureRef = useRef(onMouseButtonCapture);

  useEffect(() => {
    onChangeRef.current = onChange;
    onMouseButtonCaptureRef.current = onMouseButtonCapture;
  });

  useEffect(() => {
    let active = true;
    getKeyboardLayoutMap().then((map) => {
      if (active) setLayoutMap(map);
    });
    return () => {
      active = false;
    };
  }, []);

  const displayText = useMemo(() => {
    if (listening) return t("capture.pressAKey");
    if (!value) return t("capture.selectKey");
    return applyKeyboardKeyCase(
      value,
      formatHotkeyForDisplay(value, layoutMap, labels),
      keyboardKeyCase,
    );
  }, [keyboardKeyCase, layoutMap, listening, value, t, labels]);

  useEffect(() => {
    if (!listening) return;

    const finishCapture = (nextValue?: string) => {
      if (nextValue !== undefined) {
        onChangeRef.current(nextValue);
      }
      setListening(false);
      inputRef.current?.blur();
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.repeat) return;

      event.preventDefault();
      event.stopPropagation();

      const modifierHit = captureModifierHotkey(event);
      if (modifierHit) {
        finishCapture(modifierHit);
        return;
      }

      if (event.key === "Escape" || event.code === "Escape") {
        finishCapture("escape");
        return;
      }

      if (event.key === "Backspace") {
        finishCapture("backspace");
        return;
      }

      if (event.key === "Delete") {
        finishCapture("delete");
        return;
      }

      const captured = captureHotkey({
        key: event.key,
        code: event.code,
        location: event.location,
        ctrlKey: false,
        altKey: false,
        shiftKey: false,
        metaKey: false,
      });

      if (captured) {
        const mainKey = captured.split("+").pop() ?? captured;
        finishCapture(mainKey);
      }
    };

    const handleContextMenu = (event: MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();

      onMouseButtonCaptureRef.current?.("Right");
      finishCapture();
    };

    window.addEventListener("keydown", handleKeyDown, true);
    window.addEventListener("contextmenu", handleContextMenu, true);

    return () => {
      window.removeEventListener("keydown", handleKeyDown, true);
      window.removeEventListener("contextmenu", handleContextMenu, true);
    };
  }, [listening]);

  const hasConflict = conflicts !== undefined && conflicts.length > 0;
  const stateClass = getStateClass(listening, hasConflict, !!value);

  return (
    <div
      className={`hk-wrapper ${stateClass} ${className ?? ""}`}
      style={style}
    >
      <button
        ref={inputRef}
        type="button"
        className="hk-button"
        style={{
          paddingRight: value && !listening ? "1.25rem" : undefined,
        }}
        onClick={() => {
          setListening(true);
        }}
        onBlur={() => {
          if (listening) {
            setListening(false);
          }
        }}
        title={
          hasConflict
            ? t("capture.alreadyBound", { conflicts: conflicts!.join(", ") })
            : undefined
        }
      >
        {displayText}
      </button>
      {value && !listening && (
        <button
          type="button"
          className="hk-clear-btn"
          onClick={(e) => {
            e.stopPropagation();
            onChange("");
          }}
          title={t("capture.clearKey")}
        >
          ×
        </button>
      )}
    </div>
  );
}

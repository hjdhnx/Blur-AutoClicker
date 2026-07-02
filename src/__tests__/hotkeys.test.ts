import { describe, expect, it } from "vitest";
import {
  captureMouseHotkey,
  hotkeyMainKey,
  hotkeyModifiers,
  isBareMouseMainKeyBlocked,
} from "../hotkeys";

describe("isBareMouseMainKeyBlocked", () => {
  it("blocks the bare left and right mouse buttons", () => {
    expect(isBareMouseMainKeyBlocked("mouseleft")).toBe(true);
    expect(isBareMouseMainKeyBlocked("mouseright")).toBe(true);
    expect(isBareMouseMainKeyBlocked("MouseLeft")).toBe(true);
  });

  it("allows middle / side buttons and keyboard keys", () => {
    expect(isBareMouseMainKeyBlocked("mousemiddle")).toBe(false);
    expect(isBareMouseMainKeyBlocked("mouse4")).toBe(false);
    expect(isBareMouseMainKeyBlocked("mouse5")).toBe(false);
    expect(isBareMouseMainKeyBlocked("f8")).toBe(false);
    expect(isBareMouseMainKeyBlocked("a")).toBe(false);
  });
});

describe("captureMouseHotkey + bare-mouse guard", () => {
  const mk = (
    button: number,
    mods: Partial<{
      ctrlKey: boolean;
      altKey: boolean;
      shiftKey: boolean;
      metaKey: boolean;
    }> = {},
  ) => ({
    button,
    ctrlKey: !!mods.ctrlKey,
    altKey: !!mods.altKey,
    shiftKey: !!mods.shiftKey,
    metaKey: !!mods.metaKey,
  });

  // Mirrors the guard used in HotkeyCaptureInput.handleMouseDown.
  const isBlocked = (captured: string | null): boolean => {
    if (!captured) return false;
    const main = hotkeyMainKey(captured);
    const hasMods = hotkeyModifiers(captured).length > 0;
    return !!main && isBareMouseMainKeyBlocked(main) && !hasMods;
  };

  it("captures a bare left click but the guard flags it as blocked", () => {
    const captured = captureMouseHotkey(mk(0));
    expect(captured).toBe("mouseleft");
    expect(isBlocked(captured)).toBe(true);
  });

  it("captures a bare right click but the guard flags it as blocked", () => {
    const captured = captureMouseHotkey(mk(2));
    expect(captured).toBe("mouseright");
    expect(isBlocked(captured)).toBe(true);
  });

  it("lets a Ctrl+Left combo through (not blocked)", () => {
    const captured = captureMouseHotkey(mk(0, { ctrlKey: true }));
    expect(captured).toBe("ctrl+mouseleft");
    expect(isBlocked(captured)).toBe(false);
  });

  it("lets the middle and side buttons through (not blocked)", () => {
    expect(isBlocked(captureMouseHotkey(mk(1)))).toBe(false);
    expect(isBlocked(captureMouseHotkey(mk(3)))).toBe(false);
    expect(isBlocked(captureMouseHotkey(mk(4)))).toBe(false);
  });
});

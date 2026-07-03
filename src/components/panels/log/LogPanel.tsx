import { useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { useTranslation } from "react-i18next";
import "./LogPanel.css";

type ClickLogPayload = {
  timestampMs: number;
  x: number;
  y: number;
  pid: number | null;
  exeName: string | null;
  className: string | null;
  windowTitle: string | null;
  clicksInBatch: number;
};

type ClickLogEntry = ClickLogPayload & { id: number };

const MAX_ENTRIES = 200;

function formatTime(ms: number): string {
  const d = new Date(ms);
  const pad2 = (n: number) => String(n).padStart(2, "0");
  const pad3 = (n: number) => String(n).padStart(3, "0");
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}.${pad3(
    d.getMilliseconds(),
  )}`;
}

export default function LogPanel() {
  const { t } = useTranslation();
  const [entries, setEntries] = useState<ClickLogEntry[]>([]);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const pinnedRef = useRef(true);
  const idRef = useRef(0);

  useEffect(() => {
    const off = listen<ClickLogPayload>("clicker-log", (event) => {
      const entry: ClickLogEntry = { ...event.payload, id: idRef.current++ };
      setEntries((prev) => [...prev, entry].slice(-MAX_ENTRIES));
    });
    return () => {
      off.then((un) => un()).catch(() => {});
    };
  }, []);

  useEffect(() => {
    if (pinnedRef.current && viewportRef.current) {
      viewportRef.current.scrollTop = viewportRef.current.scrollHeight;
    }
  }, [entries]);

  const handleScroll = () => {
    const el = viewportRef.current;
    if (!el) return;
    pinnedRef.current = el.scrollTop + el.clientHeight >= el.scrollHeight - 8;
  };

  return (
    <div className="log-panel">
      <div className="log-toolbar">
        <button
          type="button"
          className="log-clear-btn"
          onClick={() => setEntries([])}
        >
          {t("log:clear")}
        </button>
      </div>
      <div ref={viewportRef} className="log-viewport" onScroll={handleScroll}>
        {entries.length === 0 ? (
          <div className="log-empty">{t("log:empty")}</div>
        ) : (
          <table className="log-table">
            <thead>
              <tr>
                <th>{t("log:colTime")}</th>
                <th>{t("log:colCoord")}</th>
                <th>{t("log:colProcess")}</th>
                <th>{t("log:colTitle")}</th>
                <th>{t("log:colPid")}</th>
                <th>{t("log:colClass")}</th>
                <th>{t("log:colClicks")}</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr
                  key={e.id}
                  className={e.clicksInBatch > 1 ? "log-row-batched" : ""}
                >
                  <td className="log-cell-time">{formatTime(e.timestampMs)}</td>
                  <td>
                    ({e.x}, {e.y})
                  </td>
                  <td>{e.exeName ?? t("log:unknown")}</td>
                  <td className="log-cell-title">{e.windowTitle ?? "-"}</td>
                  <td>{e.pid ?? "-"}</td>
                  <td className="log-cell-class">{e.className ?? "-"}</td>
                  <td>{e.clicksInBatch}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

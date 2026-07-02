import "./SettingsPanel.css";
import type {
  AppInfo,
  PresetDefinition,
  PresetId,
  Settings,
} from "../../store";

import { invoke } from "@tauri-apps/api/core";
import { emit } from "@tauri-apps/api/event";
import { error } from "@tauri-apps/plugin-log";
import { open } from "@tauri-apps/plugin-dialog";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import i18n from "../../i18n";
import ConfirmDialog from "../ConfirmDialog";
import { changelogEntries } from "../../changelog";
import ChangelogContent from "../ChangelogContent";
import {
  DEFAULT_MAX_CLICK_SPEED,
  DEFAULT_ACCENT_COLOR,
  LANGUAGE_OPTIONS,
  MAX_PRESETS,
  PRESET_NAME_MAX_LENGTH,
} from "../../settingsSchema";

type PendingAction =
  | "reset-settings"
  | "clear-stats"
  | "extended-click-speed-limit"
  | null;

const IMAGE_FILTERS = [
  {
    name: "Images",
    extensions: ["png", "jpg", "jpeg", "gif", "bmp", "webp"],
  },
];

interface CumulativeStats {
  totalClicks: number;
  totalTimeSecs: number;
  totalSessions: number;
  avgCpu: number;
}

interface Props {
  settings: Settings;
  update: (patch: Partial<Settings>) => void;
  running: boolean;
  appInfo: AppInfo;
  onSavePreset: (name: string) => boolean;
  onApplyPreset: (presetId: PresetId) => boolean;
  onUpdatePreset: (presetId: PresetId) => boolean;
  onRenamePreset: (presetId: PresetId, name: string) => boolean;
  onDeletePreset: (presetId: PresetId) => boolean;
  onToggleAlwaysOnTop: () => Promise<void>;
  onReset: () => Promise<void>;
  updateCheckStatus:
    | "idle"
    | "checking"
    | "available"
    | "unavailable"
    | "error";
  onCheckForUpdate: () => void;
}

function formatTime(
  totalSeconds: number,
  language: string,
  t: TFunction,
): string {
  if (totalSeconds < 0.01)
    return t("settings:usage.timeFormat.seconds", { n: 0 });
  if (totalSeconds < 60) {
    return t("settings:usage.timeFormat.seconds", {
      n: formatNumber(totalSeconds, language),
    });
  }
  if (totalSeconds < 3600) {
    const m = Math.floor(totalSeconds / 60);
    const s = Math.floor(totalSeconds % 60);
    return s > 0
      ? t("settings:usage.timeFormat.minutes", {
          m: formatNumber(m, language),
          s: formatNumber(s, language),
        })
      : t("settings:usage.timeFormat.minutes", {
          m: formatNumber(m, language),
          s: 0,
        });
  }
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  return m > 0
    ? t("settings:usage.timeFormat.hours", {
        h: formatNumber(h, language),
        m: formatNumber(m, language),
      })
    : t("settings:usage.timeFormat.hours", {
        h: formatNumber(h, language),
        m: 0,
      });
}

function formatNumber(n: number, language: string): string {
  return Math.floor(n).toLocaleString(language);
}

function formatCpu(
  cpu: number,
  language: string,
  notAvailable: string,
  percentUnit: string,
): string {
  if (cpu < 0) return notAvailable;
  return `${cpu.toLocaleString(language, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })}${percentUnit}`;
}

function SettingsSectionHeading({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  return (
    <div className="settings-section-heading">
      <span className="settings-section-title">{title}</span>
      {description ? (
        <span className="settings-section-description">{description}</span>
      ) : null}
    </div>
  );
}

function SettingsCard({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="settings-card">
      <SettingsSectionHeading title={title} description={description} />
      <div className="settings-card-content">{children}</div>
    </section>
  );
}

function PresetRow({
  preset,
  isActive,
  isEditing,
  isConfirmingDelete,
  running,
  renameDraft,
  onRenameDraftChange,
  onStartRename,
  onCancelRename,
  onCommitRename,
  onApply,
  onUpdatePreset,
  onRequestDelete,
  onCancelDelete,
  onConfirmDelete,
  t,
}: {
  preset: PresetDefinition;
  isActive: boolean;
  isEditing: boolean;
  isConfirmingDelete: boolean;
  running: boolean;
  renameDraft: string;
  onRenameDraftChange: (value: string) => void;
  onStartRename: () => void;
  onCancelRename: () => void;
  onCommitRename: () => void;
  onApply: () => void;
  onUpdatePreset: () => void;
  onRequestDelete: () => void;
  onCancelDelete: () => void;
  onConfirmDelete: () => void;
  t: TFunction;
}) {
  return (
    <div
      className={`preset-card ${isActive ? "preset-card--active" : ""}`}
      data-preset-id={preset.id}
    >
      <div className="preset-card-head">
        <div className="preset-card-meta">
          {isEditing ? (
            <input
              className="preset-rename-input"
              value={renameDraft}
              maxLength={PRESET_NAME_MAX_LENGTH}
              onChange={(event) => onRenameDraftChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  onCommitRename();
                }
                if (event.key === "Escape") {
                  event.preventDefault();
                  onCancelRename();
                }
              }}
              autoFocus
            />
          ) : (
            <span className="preset-name">{preset.name}</span>
          )}
          <div className="preset-badges">
            {isActive && (
              <span className="preset-badge preset-badge--active">
                {t("settings:presets.active")}
              </span>
            )}
            <span className="preset-badge">
              {new Date(preset.updatedAt).toLocaleDateString()}
            </span>
          </div>
        </div>
        <div className="preset-actions">
          {isEditing ? (
            <>
              <button
                className="settings-btn-secondary"
                onClick={onCommitRename}
                disabled={running}
              >
                {t("settings:presets.save")}
              </button>
              <button className="settings-btn-quiet" onClick={onCancelRename}>
                {t("settings:presets.cancel")}
              </button>
            </>
          ) : isConfirmingDelete ? (
            <>
              <button
                className="settings-btn-danger settings-btn-danger--compact"
                onClick={onConfirmDelete}
                disabled={running}
              >
                {t("settings:presets.confirm")}
              </button>
              <button className="settings-btn-quiet" onClick={onCancelDelete}>
                {t("settings:presets.cancel")}
              </button>
            </>
          ) : (
            <>
              <button
                className="settings-btn-primary"
                onClick={onApply}
                disabled={running}
              >
                {t("settings:presets.apply")}
              </button>
              <button
                className="settings-btn-secondary"
                onClick={onUpdatePreset}
                disabled={running}
              >
                {t("settings:presets.update")}
              </button>
              <button
                className="settings-btn-secondary"
                onClick={onStartRename}
                disabled={running}
              >
                {t("settings:presets.rename")}
              </button>
              <button
                className="settings-btn-danger settings-btn-danger--compact"
                onClick={onRequestDelete}
                disabled={running}
              >
                {t("settings:presets.delete")}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function SettingsPanel({
  settings,
  update,
  running,
  appInfo,
  onSavePreset,
  onApplyPreset,
  onUpdatePreset,
  onRenamePreset,
  onDeletePreset,
  onToggleAlwaysOnTop,
  onReset,
  updateCheckStatus,
  onCheckForUpdate,
}: Props) {
  const { t } = useTranslation();
  const [resetting, setResetting] = useState(false);
  const [resettingStats, setResettingStats] = useState(false);
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [stats, setStats] = useState<CumulativeStats | null>(null);
  const [atBottom, setAtBottom] = useState(false);
  const [presetsAtBottom, setPresetsAtBottom] = useState(true);
  const [autostartEnabled, setAutostartEnabled] = useState<boolean | null>(
    null,
  );
  const [newPresetName, setNewPresetName] = useState("");
  const [editingPresetId, setEditingPresetId] = useState<PresetId | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<PresetId | null>(
    null,
  );
  const [showChangelog, setShowChangelog] = useState(false);
  const [diagnosticsStatus, setDiagnosticsStatus] = useState<string | null>(
    null,
  );
  const [exporting, setExporting] = useState(false);

  const panelRef = useRef<HTMLDivElement>(null);
  const presetsListRef = useRef<HTMLDivElement>(null);
  const language = i18n.language;
  const handleLanguageChange = (v: string) => {
    void i18n.changeLanguage(v);
    void update({ language: v as Settings["language"] });
    void invoke("set_ui_language", { lang: v }).catch(() => {});
    void emit("language-changed", { language: v }).catch(() => {});
  };
  useEffect(() => {
    invoke<CumulativeStats>("get_stats")
      .then(setStats)
      .catch(() => {});
    invoke<boolean>("get_autostart_enabled")
      .then(setAutostartEnabled)
      .catch(() => setAutostartEnabled(false));
  }, []);

  useEffect(() => {
    if (!confirmingDeleteId) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) {
        return;
      }

      const presetCard = target.closest("[data-preset-id]");
      if (presetCard?.getAttribute("data-preset-id") === confirmingDeleteId) {
        return;
      }

      setConfirmingDeleteId(null);
    };

    document.addEventListener("pointerdown", handlePointerDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [confirmingDeleteId]);

  const handleScroll = () => {
    const el = panelRef.current;
    if (!el) return;
    setAtBottom(el.scrollTop + el.clientHeight >= el.scrollHeight - 2);
  };

  const handlePresetsScroll = () => {
    const el = presetsListRef.current;
    if (!el) return;
    setPresetsAtBottom(el.scrollTop + el.clientHeight >= el.scrollHeight - 2);
  };

  const handleSavePreset = () => {
    if (onSavePreset(newPresetName)) {
      setNewPresetName("");
      setConfirmingDeleteId(null);
    }
  };

  const handleStartRename = (preset: PresetDefinition) => {
    setConfirmingDeleteId(null);
    setEditingPresetId(preset.id);
    setRenameDraft(preset.name);
  };

  const handleCommitRename = () => {
    if (!editingPresetId) {
      return;
    }

    if (onRenamePreset(editingPresetId, renameDraft)) {
      setEditingPresetId(null);
      setRenameDraft("");
    }
  };

  const handleCancelRename = () => {
    setEditingPresetId(null);
    setRenameDraft("");
  };

  const handleRequestDelete = (presetId: PresetId) => {
    setEditingPresetId(null);
    setRenameDraft("");
    setConfirmingDeleteId(presetId);
  };

  const handleConfirmDelete = (presetId: PresetId) => {
    if (onDeletePreset(presetId)) {
      setConfirmingDeleteId(null);
    }
  };

  const handleBrowseBackgroundImage = async () => {
    try {
      const selected = await open({
        multiple: false,
        filters: IMAGE_FILTERS,
      });
      if (selected) {
        update({ backgroundImage: selected });
      }
    } catch (err) {
      error(
        JSON.stringify({
          source: "SettingsPanel.pickImage",
          error: String(err),
        }),
      );
    }
  };

  const handleAlwaysOnTopChange = (nextValue: boolean) => {
    if (settings.alwaysOnTop === nextValue) {
      return;
    }

    void onToggleAlwaysOnTop();
  };

  const hasStats = stats !== null && stats.totalSessions > 0;
  const presetLimitReached = settings.presets.length >= MAX_PRESETS;
  const activeEditingPresetId = running ? null : editingPresetId;
  const activeConfirmingDeleteId = running ? null : confirmingDeleteId;
  const onOffOptions = [
    { value: false, label: t("common:toggle.off") },
    { value: true, label: t("common:toggle.on") },
  ];
  const advancedLayoutOptions = [
    { value: "wide" as const, label: t("common:options.advancedLayout.wide") },
    { value: "tall" as const, label: t("common:options.advancedLayout.tall") },
  ];

  const handleConfirmResetSettings = async () => {
    setResetting(true);
    try {
      await onReset();
      setAutostartEnabled(false);
    } finally {
      setResetting(false);
      setPendingAction(null);
    }
  };

  const handleConfirmClearStats = async () => {
    setResettingStats(true);
    try {
      const next = await invoke<CumulativeStats>("reset_stats");
      setStats(next);
    } catch {
      // swallow ? failure leaves stats unchanged
    } finally {
      setResettingStats(false);
      setPendingAction(null);
    }
  };

  const handleExtendedClickSpeedLimitChange = (nextValue: boolean) => {
    if (settings.extendedClickSpeedLimit === nextValue) {
      return;
    }

    if (nextValue) {
      setPendingAction("extended-click-speed-limit");
      return;
    }

    update({
      extendedClickSpeedLimit: false,
      clickSpeed: Math.min(settings.clickSpeed, DEFAULT_MAX_CLICK_SPEED),
    });
  };

  const handleConfirmExtendedClickSpeedLimit = () => {
    update({ extendedClickSpeedLimit: true });
    setPendingAction(null);
  };

  useEffect(() => {
    handlePresetsScroll();
  }, [settings.presets.length]);

  const updateButtonLabel = {
    idle: t("settings:update.checkForUpdate"),
    checking: t("settings:update.checking"),
    available: t("settings:update.updateFound"),
    unavailable: t("settings:update.noUpdate"),
    error: t("settings:update.checkFailed"),
  }[updateCheckStatus];

  return (
    <div className="settings-wrapper">
      <div className="settings-panel" ref={panelRef} onScroll={handleScroll}>
        <SettingsCard
          title={t("settings:about.heading")}
          description={t("settings:about.description")}
        >
          <div className="social-links">
            <span className="settings-label">
              {t("settings:about.supportMe")}
            </span>
            <div className="social-icons">
              <a
                className="social-icon social-icon--kofi"
                href="#"
                title={t("settings:about.ko-fi")}
                onClick={(e) => {
                  e.preventDefault();
                  void openUrl("https://ko-fi.com/Z8Z71T8QD4");
                }}
              >
                <img
                  height="28"
                  style={{ border: 0, height: "28px" }}
                  src="https://storage.ko-fi.com/cdn/kofi3.png?v=6"
                  alt={t("settings:about.buyMeCoffeeAlt")}
                />
              </a>

              <a
                className="social-icon social-icon--youtube"
                href="#"
                title={t("settings:about.youtube")}
                onClick={(e) => {
                  e.preventDefault();
                  void openUrl("https://youtube.com/@Blur009");
                }}
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  width="18"
                  height="18"
                >
                  <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
                </svg>
              </a>
              <a
                className="social-icon social-icon--twitch"
                href="#"
                title={t("settings:about.twitch")}
                onClick={(e) => {
                  e.preventDefault();
                  void openUrl("https://twitch.tv/Blur009");
                }}
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  width="18"
                  height="18"
                >
                  <path d="M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714z" />
                </svg>
              </a>
              <a
                className="social-icon social-icon--github"
                href="#"
                title={t("settings:about.github")}
                onClick={(e) => {
                  e.preventDefault();
                  void openUrl("https://github.com/Blur009/Blur-AutoClicker");
                }}
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  width="18"
                  height="18"
                >
                  <path d="M12 .3a12 12 0 0 0-3.8 23.4c.6.1.8-.2.8-.6v-2c-3.3.7-4-1.4-4-1.4-.5-1.3-1.2-1.7-1.2-1.7-1-.7.1-.7.1-.7 1.1.1 1.7 1.2 1.7 1.2 1 .1.8 1.8 3.4 1.2.1-.7.4-1.2.7-1.5-2.7-.3-5.4-1.3-5.4-6a4.7 4.7 0 0 1 1.2-3.2c-.1-.3-.5-1.5.1-3.2 0 0 1-.3 3.3 1.2a11.2 11.2 0 0 1 6.1 0c2.3-1.5 3.3-1.2 3.3-1.2.6 1.7.2 2.9.1 3.2a4.7 4.7 0 0 1 1.2 3.2c0 4.7-2.8 5.7-5.4 6 .4.3.8 1 .8 2.1v3.1c0 .4.2.7.8.6A12 12 0 0 0 12 .3" />
                </svg>
              </a>
            </div>
          </div>

          <div className="settings-row">
            <div className="settings-label-group settings-label-group--inline">
              <span className="settings-label">
                {t("settings:about.version")}
              </span>
              <span className="settings-value">v{appInfo.version}</span>
            </div>
            <div className="settings-row-actions">
              <button
                className="settings-btn-secondary changelog-toggle-btn"
                onClick={() => setShowChangelog((v) => !v)}
              >
                <svg
                  className={`changelog-arrow${showChangelog ? " open" : ""}`}
                  width="10"
                  height="10"
                  viewBox="0 0 10 10"
                  fill="none"
                >
                  <path
                    d="M3 1L7 5L3 9"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                {showChangelog
                  ? t("settings:changelog.hideChanges")
                  : t("settings:changelog.showChanges")}
              </button>
              <button
                className="settings-btn-secondary check-update-btn"
                onClick={onCheckForUpdate}
                disabled={updateCheckStatus !== "idle"}
              >
                {updateButtonLabel}
              </button>
            </div>
          </div>
          {showChangelog && <ChangelogContent entries={changelogEntries} />}
        </SettingsCard>

        <SettingsCard
          title={t("settings:usage.heading")}
          description={t("settings:usage.description")}
        >
          <div className="settings-row">
            <div className="settings-label-group">
              <span className="settings-label">
                {t("settings:usage.heading")}
              </span>
              <span className="settings-sublabel">
                {t("settings:usage.privacyNote")}
              </span>
            </div>
          </div>
          {hasStats ? (
            <div className="stats-grid">
              <div className="stats-cell">
                <span className="stats-cell-label">
                  {t("settings:usage.totalClicks")}
                </span>
                <span className="stats-cell-value">
                  {formatNumber(stats.totalClicks, language)}
                </span>
              </div>
              <div className="stats-cell">
                <span className="stats-cell-label">
                  {t("settings:usage.totalTime")}
                </span>
                <span className="stats-cell-value">
                  {formatTime(stats.totalTimeSecs, language, t)}
                </span>
              </div>
              <div className="stats-cell">
                <span className="stats-cell-label">
                  {t("settings:usage.averageCpu")}
                </span>
                <span className="stats-cell-value">
                  {formatCpu(
                    stats.avgCpu,
                    language,
                    t("common:unit.notAvailable"),
                    t("common:unit.percent"),
                  )}
                </span>
              </div>
              <div className="stats-cell">
                <span className="stats-cell-label">
                  {t("settings:usage.sessions")}
                </span>
                <span className="stats-cell-value">
                  {formatNumber(stats.totalSessions, language)}
                </span>
              </div>
            </div>
          ) : (
            <div className="stats-empty">{t("settings:usage.empty")}</div>
          )}
          {hasStats && (
            <div className="settings-row">
              <div className="settings-label-group">
                <span className="settings-label">
                  {t("settings:usage.clearStats")}
                </span>
                <span className="settings-sublabel">
                  {t("settings:usage.clearStatsDesc")}
                </span>
              </div>
              <button
                type="button"
                className="settings-btn-danger settings-btn-danger--compact"
                onClick={() => setPendingAction("clear-stats")}
              >
                {t("settings:usage.clearDialog.confirm")}
              </button>
            </div>
          )}
        </SettingsCard>

        <SettingsCard
          title={t("settings:presets.heading")}
          description={t("settings:presets.description")}
        >
          <div className="settings-row settings-row--stacked">
            <div className="settings-label-group">
              <span className="settings-label">
                {t("settings:presets.heading")}
              </span>
              <span className="settings-sublabel">
                {t("settings:presets.description")}
              </span>
            </div>
            <div className="preset-compose">
              <input
                className="preset-name-input"
                placeholder={t("settings:presets.namePlaceholder")}
                value={newPresetName}
                maxLength={PRESET_NAME_MAX_LENGTH}
                onChange={(event) => setNewPresetName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    if (
                      !running &&
                      !presetLimitReached &&
                      newPresetName.trim()
                    ) {
                      handleSavePreset();
                    }
                  }
                  if (event.key === "Escape") {
                    event.preventDefault();
                    setNewPresetName("");
                  }
                }}
                disabled={running}
              />
              <button
                className="settings-btn-primary"
                onClick={handleSavePreset}
                disabled={
                  running ||
                  presetLimitReached ||
                  newPresetName.trim().length === 0
                }
              >
                {t("settings:presets.save")}
              </button>
            </div>
            {presetLimitReached && (
              <span className="settings-note">
                {t("settings:presets.maxAllowed")}
              </span>
            )}
            {running && (
              <span className="settings-note">
                {t("settings:presets.disabledWhileClicking")}
              </span>
            )}
            {settings.presets.length > 0 ? (
              <div className="preset-list-shell">
                <div
                  className="preset-list"
                  ref={presetsListRef}
                  onScroll={handlePresetsScroll}
                >
                  {settings.presets.map((preset) => (
                    <PresetRow
                      key={preset.id}
                      preset={preset}
                      isActive={settings.activePresetId === preset.id}
                      isEditing={activeEditingPresetId === preset.id}
                      isConfirmingDelete={
                        activeConfirmingDeleteId === preset.id
                      }
                      running={running}
                      renameDraft={
                        activeEditingPresetId === preset.id
                          ? renameDraft
                          : preset.name
                      }
                      onRenameDraftChange={setRenameDraft}
                      onStartRename={() => handleStartRename(preset)}
                      onCancelRename={handleCancelRename}
                      onCommitRename={handleCommitRename}
                      onApply={() => {
                        setConfirmingDeleteId(null);
                        onApplyPreset(preset.id);
                      }}
                      onUpdatePreset={() => {
                        setConfirmingDeleteId(null);
                        onUpdatePreset(preset.id);
                      }}
                      onRequestDelete={() => handleRequestDelete(preset.id)}
                      onCancelDelete={() => setConfirmingDeleteId(null)}
                      onConfirmDelete={() => handleConfirmDelete(preset.id)}
                      t={t}
                    />
                  ))}
                </div>
                <div
                  className={`preset-list-fade ${presetsAtBottom ? "preset-list-fade--hidden" : ""}`}
                />
              </div>
            ) : (
              <div className="stats-empty">{t("settings:presets.empty")}</div>
            )}
          </div>
        </SettingsCard>

        <SettingsCard
          title={t("settings:behavior.heading")}
          description={t("settings:behavior.description")}
        >
          <div className="settings-row">
            <div className="settings-label-group">
              <span className="settings-label">
                {t("settings:behavior.alwaysOnTop")}
              </span>
              <span className="settings-sublabel">
                {t("settings:behavior.alwaysOnTopDesc")}
              </span>
            </div>
            <div className="settings-seg-group">
              {onOffOptions.map((option) => (
                <button
                  key={String(option.value)}
                  className={`settings-seg-btn ${settings.alwaysOnTop === option.value ? "active" : ""}`}
                  onClick={() => handleAlwaysOnTopChange(option.value)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <div className="settings-row">
            <div className="settings-label-group">
              <span className="settings-label">
                {t("settings:behavior.stopOverlay")}
              </span>
              <span className="settings-sublabel">
                {t("settings:behavior.stopOverlayDesc")}
              </span>
            </div>
            <div className="settings-seg-group">
              {onOffOptions.map((option) => (
                <button
                  key={String(option.value)}
                  className={`settings-seg-btn ${settings.showStopOverlay === option.value ? "active" : ""}`}
                  onClick={() => update({ showStopOverlay: option.value })}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <div className="settings-row">
            <div className="settings-label-group">
              <span className="settings-label">
                {t("settings:behavior.stopReason")}
              </span>
              <span className="settings-sublabel">
                {t("settings:behavior.stopReasonDesc")}
              </span>
            </div>
            <div className="settings-seg-group">
              {onOffOptions.map((option) => (
                <button
                  key={String(option.value)}
                  className={`settings-seg-btn ${settings.showStopReason === option.value ? "active" : ""}`}
                  onClick={() => update({ showStopReason: option.value })}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <div className="settings-row">
            <div className="settings-label-group">
              <span className="settings-label">
                {t("settings:behavior.strictHotkey")}
              </span>
              <span className="settings-sublabel">
                {t("settings:behavior.strictHotkeyDesc")}
              </span>
            </div>
            <div className="settings-seg-group">
              {onOffOptions.map((option) => (
                <button
                  key={String(option.value)}
                  className={`settings-seg-btn ${settings.strictHotkeyModifiers === option.value ? "active" : ""}`}
                  onClick={() =>
                    update({ strictHotkeyModifiers: option.value })
                  }
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <div className="settings-row">
            <div className="settings-label-group">
              <span className="settings-label">
                {t("settings:behavior.stopOnAltTab")}
              </span>
              <span className="settings-sublabel">
                {t("settings:behavior.stopOnAltTabDesc")}
              </span>
            </div>
            <div className="settings-seg-group">
              {onOffOptions.map((option) => (
                <button
                  key={String(option.value)}
                  className={`settings-seg-btn ${settings.taskSwitcherStopEnabled === option.value ? "active" : ""}`}
                  onClick={() =>
                    update({ taskSwitcherStopEnabled: option.value })
                  }
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <div className="settings-row">
            <div className="settings-label-group">
              <span className="settings-label">
                {t("settings:behavior.extendedSpeed")}
              </span>
              <span className="settings-sublabel">
                {t("settings:behavior.extendedSpeedDesc")}
              </span>
            </div>
            <div className="settings-seg-group">
              {onOffOptions.map((option) => (
                <button
                  key={String(option.value)}
                  className={`settings-seg-btn ${settings.extendedClickSpeedLimit === option.value ? "active" : ""}`}
                  onClick={() =>
                    handleExtendedClickSpeedLimitChange(option.value)
                  }
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        </SettingsCard>

        <SettingsCard
          title={t("settings:startup.heading")}
          description={t("settings:startup.description")}
        >
          <div className="settings-row">
            <div className="settings-label-group">
              <span className="settings-label">
                {t("settings:startup.minimizeToTray")}
              </span>
              <span className="settings-sublabel">
                {t("settings:startup.minimizeToTrayDesc")}
              </span>
            </div>
            <div className="settings-seg-group">
              {onOffOptions.map((option) => (
                <button
                  key={String(option.value)}
                  className={`settings-seg-btn ${settings.minimizeToTray === option.value ? "active" : ""}`}
                  onClick={() => update({ minimizeToTray: option.value })}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <div className="settings-row">
            <div className="settings-label-group">
              <span className="settings-label">
                {t("settings:startup.runOnStartup")}
              </span>
              <span className="settings-sublabel">
                {t("settings:startup.runOnStartupDesc")}
              </span>
            </div>
            <div className="settings-seg-group">
              {onOffOptions.map((option) => (
                <button
                  key={String(option.value)}
                  className={`settings-seg-btn ${autostartEnabled === option.value ? "active" : ""}`}
                  disabled={autostartEnabled === null}
                  onClick={() => {
                    invoke("set_autostart_enabled", { enabled: option.value })
                      .then(() => setAutostartEnabled(option.value))
                      .catch((err) =>
                        error(
                          JSON.stringify({
                            source: "SettingsPanel.setAutostart",
                            error: String(err),
                          }),
                        ),
                      );
                  }}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        </SettingsCard>

        <SettingsCard
          title={t("settings:appearance.heading")}
          description={t("settings:appearance.description")}
        >
          <div className="settings-row">
            <div className="settings-label-group">
              <span className="settings-label">
                {t("settings:appearance.theme")}
              </span>
              <span className="settings-sublabel">
                {t("settings:appearance.themeDesc")}
              </span>
            </div>
            <div className="settings-seg-group">
              {(["dark", "light"] as const).map((theme) => (
                <button
                  key={theme}
                  className={`settings-seg-btn ${settings.theme === theme ? "active" : ""}`}
                  onClick={() => update({ theme })}
                >
                  {theme === "dark"
                    ? t("common:options.theme.dark")
                    : t("common:options.theme.light")}
                </button>
              ))}
            </div>
          </div>

          <div className="settings-row">
            <div className="settings-label-group">
              <span className="settings-label">
                {t("settings:appearance.language")}
              </span>
              <span className="settings-sublabel">
                {t("settings:appearance.languageDesc")}
              </span>
            </div>
            <div className="settings-seg-group">
              {LANGUAGE_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  className={`settings-seg-btn ${settings.language === option.value ? "active" : ""}`}
                  onClick={() => handleLanguageChange(option.value)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <div className="settings-row">
            <div className="settings-label-group">
              <span className="settings-label">
                {t("settings:appearance.advancedLayout")}
              </span>
              <span className="settings-sublabel">
                {t("settings:appearance.advancedLayoutDesc")}
              </span>
            </div>
            <div className="settings-seg-group">
              {advancedLayoutOptions.map((option) => (
                <button
                  key={option.value}
                  className={`settings-seg-btn ${settings.advancedSequenceLayout === option.value ? "active" : ""}`}
                  onClick={() =>
                    update({ advancedSequenceLayout: option.value })
                  }
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <div className="settings-row">
            <div className="settings-label-group">
              <span className="settings-label">
                {t("settings:appearance.accentColor")}
              </span>
              <span className="settings-sublabel">
                {t("settings:appearance.accentColorDesc")}
              </span>
            </div>
            <div className="settings-color-controls">
              <label className="settings-color-picker">
                <input
                  type="color"
                  value={settings.accentColor}
                  onChange={(event) =>
                    update({ accentColor: event.target.value })
                  }
                />
              </label>
              <span className="settings-value settings-value--mono">
                {settings.accentColor.toUpperCase()}
              </span>
              <button
                className="settings-btn-secondary"
                onClick={() => update({ accentColor: DEFAULT_ACCENT_COLOR })}
                disabled={settings.accentColor === DEFAULT_ACCENT_COLOR}
              >
                {t("settings:appearance.resetAccent")}
              </button>
            </div>
          </div>

          <div className="settings-row">
            <div className="settings-label-group">
              <span className="settings-label">
                {t("settings:appearance.backgroundImage")}
              </span>
              <span className="settings-sublabel">
                {t("settings:appearance.backgroundImageDesc")}
              </span>
            </div>
            <div className="settings-bg-image-row">
              <input
                className="settings-bg-input"
                type="text"
                value={settings.backgroundImage}
                onChange={(event) =>
                  update({ backgroundImage: event.target.value })
                }
                placeholder="https://example.com/image.png"
              />
              <div className="settings-bg-buttons">
                <button
                  className="settings-btn-secondary"
                  onClick={handleBrowseBackgroundImage}
                >
                  {t("settings:appearance.browse")}
                </button>
                <button
                  className="settings-btn-danger settings-btn-danger--compact"
                  onClick={() => update({ backgroundImage: "" })}
                  disabled={!settings.backgroundImage}
                >
                  {t("settings:appearance.remove")}
                </button>
              </div>
            </div>
          </div>

          <div className="settings-row">
            <div className="settings-label-group">
              <span className="settings-label">
                {t("settings:appearance.backgroundOpacity")}
              </span>
              <span className="settings-sublabel">
                {t("settings:appearance.backgroundOpacityDesc")}
              </span>
            </div>
            <div className="settings-opacity-controls">
              <input
                type="range"
                className="settings-opacity-slider"
                min="0"
                max="100"
                value={settings.backgroundOpacity}
                disabled={!settings.backgroundImage}
                onChange={(event) =>
                  update({
                    backgroundOpacity: Number(event.target.value),
                  })
                }
              />
              <span className="settings-slider-value">
                {settings.backgroundOpacity}
                {t("common:unit.percent")}
              </span>
            </div>
          </div>

          <div className="settings-row">
            <div className="settings-label-group">
              <span className="settings-label">
                {t("settings:appearance.panelOpacity")}
              </span>
              <span className="settings-sublabel">
                {t("settings:appearance.panelOpacityDesc")}
              </span>
            </div>
            <div className="settings-opacity-controls">
              <input
                type="range"
                className="settings-opacity-slider"
                min="0"
                max="100"
                value={settings.panelOpacity}
                onChange={(event) =>
                  update({
                    panelOpacity: Number(event.target.value),
                  })
                }
              />
              <span className="settings-slider-value">
                {settings.panelOpacity}
                {t("common:unit.percent")}
              </span>
            </div>
          </div>

          <div className="settings-row">
            <div className="settings-label-group">
              <span className="settings-label">
                {t("settings:appearance.panelBlur")}
              </span>
              <span className="settings-sublabel">
                {t("settings:appearance.panelBlurDesc")}
              </span>
            </div>
            <div className="settings-opacity-controls">
              <input
                type="range"
                className="settings-opacity-slider"
                min="0"
                max="20"
                value={settings.panelBlur}
                onChange={(event) =>
                  update({
                    panelBlur: Number(event.target.value),
                  })
                }
              />
              <span className="settings-slider-value">
                {settings.panelBlur}
                {t("common:unit.px")}
              </span>
            </div>
          </div>
        </SettingsCard>

        <SettingsCard
          title={t("settings:reset.heading")}
          description={t("settings:reset.description")}
        >
          <div className="settings-row">
            <div className="settings-label-group">
              <span className="settings-label">
                {t("settings:reset.resetAll")}
              </span>
              <span className="settings-sublabel">
                {t("settings:reset.resetAllDesc")}
              </span>
            </div>
            <button
              className="settings-btn-danger"
              onClick={() => setPendingAction("reset-settings")}
            >
              {t("settings:reset.dialog.confirm")}
            </button>
          </div>
        </SettingsCard>

        <SettingsCard
          title={t("settings:diagnostics.heading")}
          description={t("settings:diagnostics.description")}
        >
          <div className="settings-row">
            <div className="settings-label-group">
              <span className="settings-label">
                {t("settings:diagnostics.heading")}
              </span>
              <span className="settings-sublabel">
                {t("settings:diagnostics.subdescription")}
              </span>
            </div>
            <div className="settings-row-actions">
              <button
                className="settings-btn-secondary"
                onClick={async () => {
                  try {
                    await invoke("open_diagnostics_folder");
                  } catch (err) {
                    error(
                      JSON.stringify({
                        source: "SettingsPanel.openDiagnostics",
                        error: String(err),
                      }),
                    );
                  }
                }}
              >
                {t("settings:diagnostics.openFolder")}
              </button>
              <button
                className="settings-btn-secondary"
                disabled={exporting}
                onClick={async () => {
                  setExporting(true);
                  setDiagnosticsStatus(null);
                  try {
                    const path: string = await invoke(
                      "export_diagnostics_bundle",
                    );
                    setDiagnosticsStatus(
                      t("settings:diagnostics.exportSuccess", { path }),
                    );
                  } catch (err) {
                    setDiagnosticsStatus(
                      t("settings:diagnostics.exportFailed"),
                    );
                    error(
                      JSON.stringify({
                        source: "SettingsPanel.exportDiagnostics",
                        error: String(err),
                      }),
                    );
                  } finally {
                    setExporting(false);
                  }
                }}
              >
                {exporting
                  ? t("settings:diagnostics.exporting")
                  : t("settings:diagnostics.export")}
              </button>
            </div>
          </div>
          {diagnosticsStatus && (
            <span className="settings-note">{diagnosticsStatus}</span>
          )}
        </SettingsCard>
      </div>
      <div
        className={`settings-fade ${atBottom ? "settings-fade--hidden" : ""}`}
      ></div>
      <ConfirmDialog
        open={pendingAction === "reset-settings"}
        title={t("settings:reset.dialog.title")}
        message={t("settings:reset.dialog.message")}
        confirmLabel={t("settings:reset.dialog.confirm")}
        busy={resetting}
        onConfirm={handleConfirmResetSettings}
        onCancel={() => setPendingAction(null)}
      />
      <ConfirmDialog
        open={pendingAction === "clear-stats"}
        title={t("settings:usage.clearDialog.title")}
        message={t("settings:usage.clearDialog.message")}
        confirmLabel={t("settings:usage.clearDialog.confirm")}
        busy={resettingStats}
        onConfirm={handleConfirmClearStats}
        onCancel={() => setPendingAction(null)}
      />
      <ConfirmDialog
        open={pendingAction === "extended-click-speed-limit"}
        title={t("settings:behavior.extendedSpeedDialog.title")}
        message={t("settings:behavior.extendedSpeedDialog.message")}
        confirmLabel={t("settings:behavior.extendedSpeedDialog.confirm")}
        onConfirm={handleConfirmExtendedClickSpeedLimit}
        onCancel={() => setPendingAction(null)}
      />
    </div>
  );
}

import type { ChangeEvent, CSSProperties, FocusEvent, WheelEvent } from "react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import "./panels/advanced/AdvancedPanel.css";
import { RATE_INPUT_MODE_OPTIONS } from "../cadence";
import { convertDurationToRate, convertRateToDuration } from "../cadence";
import { normalizeIntegerRaw } from "../numberInput";
import type { RateInputMode, Settings } from "../store";

import { AdvDropdown } from "./panels/advanced/shared";
import {
  CLICK_INTERVAL_OPTIONS,
  getMaxClickSpeed,
  type ClickInterval,
} from "../settingsSchema";

// TODO: This should really be split up into what is in the advanced panel and what is in the simple panel. Having both in one feels kinda off i feel like.

interface Props {
  settings: Settings;
  update: (patch: Partial<Settings>) => void;
  variant: "simple" | "advanced";
  showInfo?: boolean;
}

function parseIntegerRaw(raw: string) {
  const normalized = normalizeIntegerRaw(raw);
  return normalized === "" || normalized === "-" ? 0 : Number(normalized);
}

function clamp(value: number, min: number, max?: number) {
  const minClamped = Math.max(min, value);
  return max === undefined ? minClamped : Math.min(max, minClamped);
}

function dynamicChWidth(value: number, min = 1, max = 3) {
  return `${clamp(String(Math.abs(value)).length, min, max)}ch`;
}

function handleWheelStep(
  event: WheelEvent<HTMLInputElement>,
  current: number,
  min: number,
  max: number | undefined,
  apply: (next: number) => void,
) {
  event.preventDefault();
  event.stopPropagation();
  event.currentTarget.blur();
  const delta = event.deltaY < 0 ? 1 : -1;
  let step = 1;
  if (event.shiftKey && event.ctrlKey) step = 10;
  else if (event.shiftKey) step = 5;
  apply(clamp(current + delta * step, min, max));
}

function handleNumberChange(
  event: ChangeEvent<HTMLInputElement>,
  apply: (next: number) => void,
) {
  const normalized = normalizeIntegerRaw(event.target.value);
  if (normalized !== event.target.value) {
    event.target.value = normalized;
  }
  apply(parseIntegerRaw(normalized));
}

function handleNumberBlur(
  event: FocusEvent<HTMLInputElement>,
  min: number,
  max: number | undefined,
  apply: (next: number) => void,
) {
  const normalized = normalizeIntegerRaw(event.target.value);
  if (normalized !== event.target.value) {
    event.target.value = normalized;
  }
  apply(clamp(parseIntegerRaw(normalized), min, max));
}

function DurationField({
  value,
  min,
  max,
  onChange,
  style,
  unit,
  className,
}: {
  value: number;
  min: number;
  max?: number;
  onChange: (next: number) => void;
  style?: CSSProperties;
  unit: string;
  className?: string;
}) {
  return (
    <div className={className ?? "adv-numbox-sm"}>
      <input
        type="number"
        className={className ? "simple-inline-input" : "adv-number-sm"}
        value={value}
        min={min}
        max={max}
        onChange={(event) => handleNumberChange(event, onChange)}
        onBlur={(event) => handleNumberBlur(event, min, max, onChange)}
        onWheel={(event) => handleWheelStep(event, value, min, max, onChange)}
        style={style}
      />
      <span className={className ? "postfix" : "adv-unit"}>{unit}</span>
    </div>
  );
}

export default function CadenceInput({ settings, update, variant }: Props) {
  const { t } = useTranslation();
  const maxClickSpeed = getMaxClickSpeed(settings.extendedClickSpeedLimit);

  const intervalOptions = CLICK_INTERVAL_OPTIONS.map((option) => ({
    value: option.value,
    label: t(`common:options.interval.${option.value}`),
  }));

  const simpleRateInputModeOptions = [
    { value: "rate", label: t("common:controls.rate") },
    { value: "duration", label: t("common:controls.delay") },
  ] as const;

  const unitH = t("common:options.durationUnit.h");
  const unitM = t("common:options.durationUnit.m");
  const unitS = t("common:options.durationUnit.s");
  const unitMs = t("common:options.durationUnit.ms");

  const [draftCps, setDraftCps] = useState<string | null>(null);

  const switchMode = (mode: RateInputMode) => {
    if (mode === settings.rateInputMode) return;

    if (mode === "rate") {
      const converted = convertDurationToRate(settings);
      update({
        rateInputMode: mode,
        ...(converted ?? {}),
      });
      return;
    }

    const converted = convertRateToDuration(settings);
    update({
      rateInputMode: mode,
      ...(converted ?? {}),
    });
  };

  const updateSimpleCadence = (patch: Partial<Settings>) => {
    if (variant !== "simple") {
      update(patch);
      return;
    }

    const nextSettings = { ...settings, ...patch };

    if (nextSettings.rateInputMode === "rate") {
      const converted = convertRateToDuration(nextSettings);
      update({
        ...patch,
        ...(converted ?? {}),
      });
      return;
    }

    const converted = convertDurationToRate(nextSettings);
    update({
      ...patch,
      ...(converted ?? {}),
    });
  };

  if (variant === "simple") {
    return (
      <div className="InputBox cadence-box simple-cadence-box">
        {settings.rateInputMode === "rate" ? (
          <div className="simple-cadence-row">
            <input
              type="number"
              className="simple-inline-input simple-cadence-input"
              value={draftCps ?? settings.clickSpeed}
              min={1}
              max={maxClickSpeed}
              aria-label={t("common:cadence.clicksPer")}
              onChange={(event) => {
                const raw = event.target.value;
                if (raw === "") {
                  setDraftCps("");
                } else {
                  const normalized = normalizeIntegerRaw(raw);
                  if (normalized !== raw) event.target.value = normalized;
                  if (normalized === "" || normalized === "-") {
                    setDraftCps(normalized);
                    return;
                  }
                  setDraftCps(null);
                  updateSimpleCadence({ clickSpeed: Number(normalized) });
                }
              }}
              onBlur={(event) => {
                setDraftCps(null);
                handleNumberBlur(event, 1, maxClickSpeed, (next) =>
                  updateSimpleCadence({ clickSpeed: next }),
                );
              }}
              onWheel={(event) =>
                handleWheelStep(
                  event,
                  settings.clickSpeed,
                  1,
                  maxClickSpeed,
                  (next) => updateSimpleCadence({ clickSpeed: next }),
                )
              }
            />
            <div className="vertical-devider vertical-devider--stretch" />
            <span className="simple-control-label">
              {t("common:cadence.clicksPer")}
            </span>
            <div className="vertical-devider vertical-devider--stretch" />
            <AdvDropdown
              value={settings.clickInterval}
              options={intervalOptions}
              allowWindowOverflow
              onChange={(value) =>
                updateSimpleCadence({ clickInterval: value as ClickInterval })
              }
            />
            <div className="vertical-devider vertical-devider--stretch" />
            <AdvDropdown
              value={settings.rateInputMode}
              options={simpleRateInputModeOptions}
              allowWindowOverflow
              onChange={(value) => switchMode(value as RateInputMode)}
            />
          </div>
        ) : (
          <div className="simple-cadence-row">
            <div className="simple-duration-group">
              <DurationField
                className="simple-duration-chip"
                value={settings.durationHours}
                min={0}
                max={999}
                onChange={(next) =>
                  updateSimpleCadence({ durationHours: next })
                }
                style={{
                  width: dynamicChWidth(settings.durationHours, 1, 3),
                  minWidth: "1ch",
                }}
                unit={unitH}
              />
              <DurationField
                className="simple-duration-chip"
                value={settings.durationMinutes}
                min={0}
                max={59}
                onChange={(next) =>
                  updateSimpleCadence({ durationMinutes: next })
                }
                style={{
                  width: dynamicChWidth(settings.durationMinutes, 1, 2),
                  minWidth: "1ch",
                }}
                unit={unitM}
              />
              <DurationField
                className="simple-duration-chip"
                value={settings.durationSeconds}
                min={0}
                max={59}
                onChange={(next) =>
                  updateSimpleCadence({ durationSeconds: next })
                }
                style={{
                  width: dynamicChWidth(settings.durationSeconds, 1, 2),
                  minWidth: "1ch",
                }}
                unit={unitS}
              />
              <DurationField
                className="simple-duration-chip"
                value={settings.durationMilliseconds}
                min={0}
                max={999}
                onChange={(next) =>
                  updateSimpleCadence({ durationMilliseconds: next })
                }
                style={{
                  width: dynamicChWidth(settings.durationMilliseconds, 1, 3),
                  minWidth: "1ch",
                }}
                unit={unitMs}
              />
            </div>
            <div className="vertical-devider vertical-devider--stretch" />
            <span className="simple-control-label">
              {t("common:cadence.perClick")}
            </span>
            <div className="vertical-devider vertical-devider--stretch" />
            <AdvDropdown
              value={settings.rateInputMode}
              options={simpleRateInputModeOptions}
              allowWindowOverflow
              onChange={(value) => switchMode(value as RateInputMode)}
            />
          </div>
        )}
      </div>
    );
  }

  const modeToggle = (
    <div className="adv-seg-group adv-cadence-mode-toggle">
      {RATE_INPUT_MODE_OPTIONS.map((mode) => (
        <button
          key={mode}
          type="button"
          className={`adv-seg-btn ${settings.rateInputMode === mode ? "active" : ""}`}
          onClick={() => switchMode(mode)}
        >
          {mode === "rate"
            ? t("common:controls.rate")
            : t("common:controls.delay")}
        </button>
      ))}
    </div>
  );

  return (
    <div className="adv-cadence-block">
      <div className="adv-row adv-cadence-main-row">
        <div className="adv-cadence-value">
          {settings.rateInputMode === "rate" ? (
            <div className="adv-value-outline">
              <div className="adv-foc">
                <input
                  type="number"
                  className="adv-number-sm"
                  value={draftCps ?? settings.clickSpeed}
                  min={1}
                  max={maxClickSpeed}
                  style={{ width: "40px", textAlign: "right" }}
                  onChange={(event) => {
                    const raw = event.target.value;
                    if (raw === "") {
                      setDraftCps("");
                    } else {
                      const normalized = normalizeIntegerRaw(raw);
                      if (normalized !== raw) event.target.value = normalized;
                      if (normalized === "" || normalized === "-") {
                        setDraftCps(normalized);
                        return;
                      }
                      setDraftCps(null);
                      update({ clickSpeed: Number(normalized) });
                    }
                  }}
                  onBlur={(event) => {
                    setDraftCps(null);
                    handleNumberBlur(event, 1, maxClickSpeed, (next) =>
                      update({ clickSpeed: next }),
                    );
                  }}
                  onWheel={(event) =>
                    handleWheelStep(
                      event,
                      settings.clickSpeed,
                      1,
                      maxClickSpeed,
                      (next) => update({ clickSpeed: next }),
                    )
                  }
                />
              </div>
              <div className="adv-vdivider" />
              <span className="adv-unf">{t("common:cadence.clicksPer")}</span>
              <div className="adv-vdivider" />
              <div className="adv-foc adv-foc-grow">
                <AdvDropdown
                  value={settings.clickInterval}
                  options={intervalOptions}
                  onChange={(v) =>
                    update({ clickInterval: v as ClickInterval })
                  }
                />
              </div>
            </div>
          ) : (
            <div className="adv-value-outline adv-value-outline--duration">
              <div className="adv-foc">
                <input
                  type="number"
                  className="adv-number-sm"
                  value={settings.durationHours}
                  min={0}
                  max={999}
                  style={{ width: "34px", textAlign: "right" }}
                  onChange={(event) =>
                    handleNumberChange(event, (next) =>
                      update({ durationHours: next }),
                    )
                  }
                  onBlur={(event) =>
                    handleNumberBlur(event, 0, 999, (next) =>
                      update({ durationHours: next }),
                    )
                  }
                  onWheel={(event) =>
                    handleWheelStep(
                      event,
                      settings.durationHours,
                      0,
                      999,
                      (next) => update({ durationHours: next }),
                    )
                  }
                />
                <span className="adv-unit">{unitH}</span>
              </div>
              <div className="adv-vdivider" />
              <div className="adv-foc">
                <input
                  type="number"
                  className="adv-number-sm"
                  value={settings.durationMinutes}
                  min={0}
                  max={59}
                  style={{ width: "26px", textAlign: "right" }}
                  onChange={(event) =>
                    handleNumberChange(event, (next) =>
                      update({ durationMinutes: next }),
                    )
                  }
                  onBlur={(event) =>
                    handleNumberBlur(event, 0, 59, (next) =>
                      update({ durationMinutes: next }),
                    )
                  }
                  onWheel={(event) =>
                    handleWheelStep(
                      event,
                      settings.durationMinutes,
                      0,
                      59,
                      (next) => update({ durationMinutes: next }),
                    )
                  }
                />
                <span className="adv-unit">{unitM}</span>
              </div>
              <div className="adv-vdivider" />
              <div className="adv-foc">
                <input
                  type="number"
                  className="adv-number-sm"
                  value={settings.durationSeconds}
                  min={0}
                  max={59}
                  style={{ width: "26px", textAlign: "right" }}
                  onChange={(event) =>
                    handleNumberChange(event, (next) =>
                      update({ durationSeconds: next }),
                    )
                  }
                  onBlur={(event) =>
                    handleNumberBlur(event, 0, 59, (next) =>
                      update({ durationSeconds: next }),
                    )
                  }
                  onWheel={(event) =>
                    handleWheelStep(
                      event,
                      settings.durationSeconds,
                      0,
                      59,
                      (next) => update({ durationSeconds: next }),
                    )
                  }
                />
                <span className="adv-unit">{unitS}</span>
              </div>
              <div className="adv-vdivider" />
              <div className="adv-foc">
                <input
                  type="number"
                  className="adv-number-sm"
                  value={settings.durationMilliseconds}
                  min={0}
                  max={999}
                  style={{ width: "34px", textAlign: "right" }}
                  onChange={(event) =>
                    handleNumberChange(event, (next) =>
                      update({ durationMilliseconds: next }),
                    )
                  }
                  onBlur={(event) =>
                    handleNumberBlur(event, 0, 999, (next) =>
                      update({ durationMilliseconds: next }),
                    )
                  }
                  onWheel={(event) =>
                    handleWheelStep(
                      event,
                      settings.durationMilliseconds,
                      0,
                      999,
                      (next) => update({ durationMilliseconds: next }),
                    )
                  }
                />
                <span className="adv-unit">{unitMs}</span>
              </div>
            </div>
          )}
        </div>
        {modeToggle}
      </div>
    </div>
  );
}

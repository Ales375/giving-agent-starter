import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";

import type { AgentState } from "./types.js";

const STATE_FILENAME = ".agent-state.json";
const STATE_FILE_PATH =
  process.env.STATE_FILE_PATH && process.env.STATE_FILE_PATH.trim() !== ""
    ? process.env.STATE_FILE_PATH
    : resolve(process.cwd(), STATE_FILENAME);

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function getCurrentMonthKey(now: Date = new Date()): string {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}`;
}

function getTodayKey(now: Date = new Date()): string {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function readState(): AgentState | null {
  if (!existsSync(STATE_FILE_PATH)) {
    return null;
  }

  const raw = readFileSync(STATE_FILE_PATH, "utf8");
  return JSON.parse(raw) as AgentState;
}

export function writeState(state: AgentState): void {
  const tempPath = resolve(
    dirname(STATE_FILE_PATH),
    `${basename(STATE_FILE_PATH)}.tmp`,
  );
  const contents = JSON.stringify(state, null, 2);

  writeFileSync(tempPath, contents, "utf8");
  renameSync(tempPath, STATE_FILE_PATH);
}

export function resetBudgetIfNewMonth(state: AgentState): AgentState {
  const currentMonthKey = getCurrentMonthKey();

  if (state.current_month_key === currentMonthKey) {
    return state;
  }

  return {
    ...state,
    current_month_key: currentMonthKey,
    monthly_spent_usdc: 0,
    monthly_evidence_spent_usdc: 0,
  };
}

export function resetDayCounterIfNewDay(state: AgentState): AgentState {
  const todayKey = getTodayKey();

  if (state.today_key === todayKey) {
    return state;
  }

  return {
    ...state,
    today_key: todayKey,
    donations_today_count: 0,
  };
}

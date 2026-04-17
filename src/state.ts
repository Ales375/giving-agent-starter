import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import type { AgentState } from "./types.js";

const STATE_FILENAME = ".agent-state.json";

function getStatePath(): string {
  return resolve(process.cwd(), STATE_FILENAME);
}

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
  const statePath = getStatePath();

  if (!existsSync(statePath)) {
    return null;
  }

  const raw = readFileSync(statePath, "utf8");
  return JSON.parse(raw) as AgentState;
}

export function writeState(state: AgentState): void {
  const statePath = getStatePath();
  const tempPath = `${statePath}.tmp`;
  const contents = JSON.stringify(state, null, 2);

  writeFileSync(tempPath, contents, "utf8");
  renameSync(tempPath, statePath);
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

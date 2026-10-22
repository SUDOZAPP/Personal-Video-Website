import type { ScanOutcome } from "../api";

export const scanOutcomeLabels: Record<ScanOutcome, string> = {
  succeeded: "已完成",
  partial: "部分完成",
  failed: "失敗",
  canceled: "已取消",
  skipped: "已跳過",
};

export const scanOutcomeClasses: Record<ScanOutcome, string> = {
  succeeded: "idle",
  partial: "cooling",
  failed: "error",
  canceled: "queued",
  skipped: "queued",
};

export function isGenerationBusy(state: string): boolean {
  return ["scanning", "uploading", "generating", "cooling", "queued"].includes(state);
}

export const scanResultMetrics = [
  { key: "scannedCount", label: "已掃描" },
  { key: "addedCount", label: "新增" },
  { key: "updatedCount", label: "更新" },
  { key: "skippedCount", label: "跳過" },
  { key: "cleanedCount", label: "清理" },
  { key: "errorCount", label: "錯誤" },
] as const;

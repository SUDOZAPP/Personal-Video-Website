import type { AdminCrawler, CrawlerDryRunResult, DriveGenerationStatus } from "./api";
import { isGenerationBusy } from "./drive/scanResults";

export type CrawlerAction = "run" | "upload" | "stop" | "pause";
export type CrawlerDisplayStatus = {
  text: string;
  tone: "idle" | "queued" | "generating";
};

const idleStatus: CrawlerDisplayStatus = { text: "空閑", tone: "idle" };
const waitingStatus: CrawlerDisplayStatus = { text: "等待中", tone: "queued" };

function activityStatus(state: string | undefined, activeText = "進行中"): CrawlerDisplayStatus {
  if (state === "queued" || state === "cooling") return waitingStatus;
  if (state === "running" || isGenerationBusy(state ?? "")) {
    return { text: activeText, tone: "generating" };
  }
  return idleStatus;
}

export function crawlerGenerationStatus(status?: DriveGenerationStatus): CrawlerDisplayStatus {
  return activityStatus(status?.state);
}

function taskActive<T extends { state: string }>(task: T | undefined): task is T & { state: "queued" | "running" } {
  return task?.state === "queued" || task?.state === "running";
}

export function crawlerBusy(crawler: AdminCrawler) {
  return taskActive(crawler.currentTask) || taskActive(crawler.lastUploadResult) || [
    crawler.scanGenerationStatus,
    crawler.thumbnailGenerationStatus,
    crawler.previewGenerationStatus,
    crawler.fingerprintGenerationStatus,
    crawler.uploadGenerationStatus,
  ].some(status => isGenerationBusy(status?.state ?? ""));
}

export function crawlerTaskStatus(crawler: AdminCrawler): CrawlerDisplayStatus {
  const task = crawler.currentTask;
  if (taskActive(task)) {
    const text = task.stopRequested ? "收尾中"
      : task.stage === "generation" ? "生成中"
      : task.stage === "upload" ? crawler.uploadDriveId ? "上傳中" : "處理中"
      : "抓取中";
    return activityStatus(task.state, text);
  }
  return activityStatus(crawler.scanGenerationStatus?.state, "抓取中");
}

// Generation and upload keep the pipeline busy after acquisition has ended.
// The crawl card reports acquisition activity separately from the row badge.
export function crawlerCrawlStatus(crawler: AdminCrawler): CrawlerDisplayStatus {
  const task = crawler.currentTask;
  if (taskActive(task)) {
    if (task.state === "running" && (task.stage === "generation" || task.stage === "upload")) return idleStatus;
    return activityStatus(task.state);
  }
  if (taskActive(crawler.lastUploadResult) || isGenerationBusy(crawler.uploadGenerationStatus?.state ?? "")) {
    return idleStatus;
  }
  return crawlerGenerationStatus(crawler.scanGenerationStatus);
}

// Active uploads may not have a target ID until their final result is saved.
// Historical results for a different target must not describe the current one.
export function crawlerUploadResult(crawler: AdminCrawler) {
  const result = crawler.lastUploadResult;
  if (!result) return undefined;
  if (taskActive(result)) return result;
  if (!crawler.uploadDriveId) return undefined;
  return !result.targetDriveId || result.targetDriveId === crawler.uploadDriveId ? result : undefined;
}

export function crawlerUploadStatus(crawler: AdminCrawler): CrawlerDisplayStatus {
  const live = crawler.uploadGenerationStatus?.state;
  if (isGenerationBusy(live ?? "")) return activityStatus(live);
  const result = crawlerUploadResult(crawler);
  if (taskActive(result)) return activityStatus(result.state);
  if (crawler.uploadDriveId && taskActive(crawler.currentTask)) return waitingStatus;
  return idleStatus;
}

export function crawlerActivity(crawler: AdminCrawler): CrawlerDisplayStatus | undefined {
  if (taskActive(crawler.currentTask)) return crawlerTaskStatus(crawler);
  if (isGenerationBusy(crawler.uploadGenerationStatus?.state ?? "")) {
    return activityStatus(crawler.uploadGenerationStatus?.state, "上傳中");
  }
  if (taskActive(crawler.lastUploadResult)) return activityStatus(crawler.lastUploadResult.state, "上傳中");
  const generation = [crawler.thumbnailGenerationStatus, crawler.previewGenerationStatus, crawler.fingerprintGenerationStatus]
    .map(crawlerGenerationStatus);
  if (generation.some(status => status.tone === "generating")) {
    return { text: "生成中", tone: "generating" };
  }
  if (generation.some(status => status.tone === "queued")) return waitingStatus;
  if (isGenerationBusy(crawler.scanGenerationStatus?.state ?? "")) return crawlerTaskStatus(crawler);
  return undefined;
}

export function crawlerActionReasons(crawler: AdminCrawler, options: {
  pending?: CrawlerAction;
  maintenanceBusy: boolean;
  uploadTargetAvailable: boolean;
}) {
  const busyReason = options.pending ? "操作處理中，請稍候"
    : crawlerBusy(crawler) ? "目前任務尚未結束，請稍後重試"
    : options.maintenanceBusy ? "管理後台批量任務正在進行，請稍後重試" : "";
  return {
    run: busyReason || (crawler.scriptError ? "腳本不可用，請查看日志" : "") || (!crawler.scriptPath ? "請先導入爬蟲腳本" : ""),
    upload: busyReason || (!crawler.uploadDriveId ? "請先設定上傳雲端硬碟"
      : !options.uploadTargetAvailable ? "上傳目標不可用，請檢查雲端硬碟設定" : ""),
  };
}

export function crawlerTestSummary(result: CrawlerDryRunResult) {
  if (!result.ok) return "腳本測試失敗";
  const protocol = result.validated.includes("protocol");
  const media = result.validated.includes("media_probe");
  if (protocol && media) return "協議與媒體檢查通過";
  if (protocol) return "協議檢查通過";
  if (media) return "媒體檢查通過";
  return "未確認驗證范圍";
}

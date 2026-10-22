import {
  Activity,
  ArrowLeft,
  FolderTree,
  HardDrive,
} from "lucide-react";
import { useSearchParams } from "react-router";
import { StorageSummary } from "./drive/StorageSummary";
import { SkipDirsLoadingIndicator } from "./drive/SkipDirsLoadingIndicator";
import { ScanResultDetails } from "./drive/ScanResultDetails";
import { SkipDirsIcon } from "./icons/SkipDirsIcon";
import { DriveGenerationActions } from "./drive/DriveGenerationActions";

const DRIVE_LIST_SKELETON_COUNT = 6;
const DRIVE_GENERATION_SECTIONS = [
  { label: "掃描來源", showCounts: false },
  { label: "封面", showCounts: true },
  { label: "預覽影片", showCounts: true },
  { label: "影片指紋", showCounts: true },
];
const EMPTY_VALUE = "\u00a0";

export function DriveListSkeleton() {
  return (
    <div
      className="admin-drives-grid admin-drives-grid--skeleton"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <span className="sr-only">正在載入雲端硬碟列表</span>
      {Array.from({ length: DRIVE_LIST_SKELETON_COUNT }, (_, index) => (
        <div
          key={index}
          className="admin-drive-card-skeleton admin-card-skeleton-surface"
          aria-hidden="true"
        />
      ))}
    </div>
  );
}

export function DriveDetailLoading({ driveId, onBack }: { driveId: string; onBack: () => void }) {
  return (
    <section className="admin-page admin-drives-page">
      <header className="admin-drive-detail__header-bar">
        <button
          type="button"
          className="admin-drive-detail__back-btn"
          onClick={onBack}
          title="返回雲端硬碟列表"
        >
          <ArrowLeft size={16} />
        </button>
        <div className="admin-drive-detail__title-wrap">
          <h1 className="admin-drive-detail__title">雲端硬碟詳情</h1>
        </div>
      </header>

      <div
        className="admin-drive-detail-layout admin-drive-detail-loading"
        role="status"
        aria-live="polite"
        aria-busy="true"
      >
        <span className="sr-only">正在載入雲端硬碟詳情</span>
        <div className="admin-drive-detail-layout__info" aria-hidden="true">
          <div className="admin-detail-card">
            <header className="admin-detail-card__title">
              <div className="admin-detail-card__title-left">
                <HardDrive size={16} />
                <span>基本資訊</span>
              </div>
            </header>

            <div className="admin-detail-grid">
              <div className="admin-detail-row">
                <span className="admin-detail-label">雲端硬碟 ID</span>
                <span className="admin-detail-value">{EMPTY_VALUE}</span>
              </div>
              <div className="admin-detail-row">
                <span className="admin-detail-label">根目錄 ID</span>
                <span className="admin-detail-value">{EMPTY_VALUE}</span>
              </div>
            </div>

            <div className="admin-detail-actions">
              <div className="admin-task-controls">
                <button type="button" className="admin-btn" disabled>
                  開始掃描來源
                </button>
                <button type="button" className="admin-btn" disabled>
                  停止任務
                </button>
              </div>
              <button
                type="button"
                className="admin-btn admin-detail-actions__credentials"
                disabled
              >
                編輯憑證
              </button>
              <button
                type="button"
                className="admin-btn admin-detail-actions__danger"
                disabled
              >
                刪除雲端硬碟
              </button>
            </div>
          </div>
        </div>

        <div className="admin-drive-detail-layout__status">
          <div className="admin-detail-card">
            <header className="admin-detail-card__title">
              <div className="admin-detail-card__title-left">
                <Activity size={16} />
                <span>生成狀態</span>
              </div>
            </header>

            <div className="admin-gen-columns" aria-hidden="true">
              {DRIVE_GENERATION_SECTIONS.map((section) => (
                <div key={section.label} className="admin-gen-col">
                  <div className="admin-gen-col__head">
                    <span className="admin-gen-col__label">{section.label}</span>
                  </div>
                  {section.showCounts && (
                    <div className="admin-gen-col__counts">
                      {(["完成", "待生成", "失敗"] as const).map((label) => (
                        <div key={label} className="admin-gen-col__count">
                          <span>{label}</span>
                          <strong>{EMPTY_VALUE}</strong>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>

            <DriveGenerationActions driveId={driveId} />
          </div>

          <ScanResultDetails loading />

          <div className="admin-detail-card">
            <header className="admin-detail-card__title">
              <div className="admin-detail-card__title-left">
                <FolderTree size={16} />
                <span>本機儲存占用</span>
              </div>
            </header>
            <div className="admin-local-storage-metrics">
              {["封面", "預覽影片", "合計"].map((label) => (
                <div key={label} className="admin-local-storage-metric">
                  <span>{label}</span>
                  <strong>{EMPTY_VALUE}</strong>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="admin-drive-detail-layout__skip-dirs" aria-hidden="true">
          <div className="admin-detail-card">
            <header className="admin-detail-card__title">
              <div className="admin-detail-card__title-left">
                <SkipDirsIcon />
                <span>掃描跳過目錄</span>
              </div>
            </header>
            <div className="admin-detail-tree-container">
              <SkipDirsLoadingIndicator />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export function DrivesPageLoading() {
  const [searchParams, setSearchParams] = useSearchParams();
  const driveId = searchParams.get("drive");

  if (driveId) {
    return (
      <DriveDetailLoading
        driveId={driveId}
        onBack={() => {
          setSearchParams(
            (previous) => {
              const next = new URLSearchParams(previous);
              next.delete("drive");
              return next;
            },
            { replace: true }
          );
        }}
      />
    );
  }

  return (
    <section className="admin-page admin-drives-page admin-drives-page--list">
      <StorageSummary storage={null} loading />
      <DriveListSkeleton />
    </section>
  );
}

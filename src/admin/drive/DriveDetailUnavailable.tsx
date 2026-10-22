import { useId } from "react";
import { ArrowLeft, CircleAlert, CloudOff, RefreshCw } from "lucide-react";

type DriveDetailUnavailableProps = {
  notFound: boolean;
  retrying: boolean;
  onBack: () => void;
  onRetry: () => void;
};

export function DriveDetailUnavailable({ notFound, retrying, onBack, onRetry }: DriveDetailUnavailableProps) {
  const titleId = useId();
  const Icon = notFound ? CloudOff : CircleAlert;

  return (
    <section className="admin-page admin-drives-page">
      <header className="admin-drive-detail__header-bar">
        <button
          type="button"
          className="admin-drive-detail__back-btn"
          onClick={onBack}
          aria-label="返回雲端硬碟列表"
          title="返回雲端硬碟列表"
        >
          <ArrowLeft size={16} aria-hidden="true" />
        </button>
        <h1 className="admin-drive-detail__title">雲端硬碟詳情</h1>
      </header>

      <div className="admin-drive-unavailable">
        <div
          className={`admin-drive-unavailable__card${notFound ? "" : " is-error"}`}
          role={notFound ? "status" : "alert"}
          aria-labelledby={titleId}
          aria-busy={retrying || undefined}
        >
          <span className="admin-drive-unavailable__icon" aria-hidden="true">
            <Icon size={28} strokeWidth={1.6} />
          </span>
          <h2 id={titleId} className="admin-drive-unavailable__title">
            {notFound ? "雲端硬碟不存在" : "雲端硬碟資料載入失敗"}
          </h2>
          <div className="admin-drive-unavailable__actions">
            {!notFound && (
              <button type="button" className="admin-btn is-primary" onClick={onRetry} disabled={retrying}>
                <RefreshCw size={14} className={retrying ? "admin-spin" : undefined} aria-hidden="true" />
                {retrying ? "載入中…" : "重新載入"}
              </button>
            )}
            <button type="button" className={`admin-btn${notFound ? " is-primary" : ""}`} onClick={onBack}>
              返回雲端硬碟列表
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

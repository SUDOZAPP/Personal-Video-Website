import { AdminEmptyVisual } from "@/admin/AdminEmptyVisual";

type Props = {
  hasContent: boolean;
  displayedPage?: number;
  onRetry: () => void;
  emptyClassName?: string;
};

export function ListingLoadError({
  hasContent,
  displayedPage,
  onRetry,
  emptyClassName = "",
}: Props) {
  if (hasContent) {
    return (
      <div className="listing-load-error" role="alert">
        <span>
          影片列表載入失敗
          {displayedPage ? `，目前仍顯示第 ${displayedPage} 頁` : "，目前仍顯示舊內容"}
        </span>
        <button type="button" onClick={onRetry}>
          重試
        </button>
      </div>
    );
  }

  return (
    <div
      className={`listing-load-error-empty${emptyClassName ? ` ${emptyClassName}` : ""}`}
      role="alert"
    >
      <AdminEmptyVisual variant="no-results" text="影片列表載入失敗" />
      <button type="button" onClick={onRetry}>
        重新載入
      </button>
    </div>
  );
}

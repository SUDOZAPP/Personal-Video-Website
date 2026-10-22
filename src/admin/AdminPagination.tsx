import type { Dispatch, SetStateAction } from "react";

type AdminPaginationProps = {
  page: number;
  totalPages: number;
  total: number;
  itemLabel: string;
  pending?: boolean;
  onPage: Dispatch<SetStateAction<number>>;
};

/** Shared compact pagination for admin list pages. */
export function AdminPagination({
  page,
  totalPages,
  total,
  itemLabel,
  pending = false,
  onPage,
}: AdminPaginationProps) {
  return (
    <nav className="admin-table-pagination admin-list-pagination" aria-label={`${itemLabel}列表分頁`}>
      <button
        type="button"
        className="admin-btn admin-list-pagination__button"
        onClick={() => onPage(Math.max(1, page - 1))}
        disabled={pending || page <= 1}
      >
        上一頁
      </button>
      <span className="admin-list-pagination__info" aria-live="polite">
        第 {page} / {totalPages} 頁 · 共 {total} 個{itemLabel}
      </span>
      <button
        type="button"
        className="admin-btn admin-list-pagination__button"
        onClick={() => onPage(Math.min(totalPages, page + 1))}
        disabled={pending || page >= totalPages}
      >
        下一頁
      </button>
    </nav>
  );
}

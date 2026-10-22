import { memo } from "react";
import type { SortKey } from "@/types";

type Props = {
  sort: SortKey;
  onSortChange: (s: SortKey) => void;
  sortDisabled?: boolean;
};

const sortOptions: { key: SortKey; label: string }[] = [
  { key: "hot", label: "最熱" },
  { key: "latest", label: "最新" },
  { key: "recent", label: "最近觀看" },
];

export const SortToolbar = memo(function SortToolbar({
  sort,
  onSortChange,
  sortDisabled = false,
}: Props) {
  return (
    <div className="content-tabs sort-toolbar" role="tablist" aria-label="影片排序">
      {sortOptions.map((option) => (
        <button
          key={option.key}
          type="button"
          role="tab"
          className="content-tabs__tab"
          onClick={() => onSortChange(option.key)}
          disabled={sortDisabled}
          aria-selected={sort === option.key}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
});

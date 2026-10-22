export function parseTelegramUserIDs(value: string): number[] {
  if (!value.trim()) return [];
  return [
    ...new Set(
      value
        .split(/[\s,，]+/)
        .filter(Boolean)
        .map((id) => {
          if (
            !/^\d+$/.test(id) ||
            !Number.isSafeInteger(Number(id)) ||
            Number(id) <= 0
          )
            throw new Error("允許的用戶必須是正整數 ID，用逗號或換行分隔");
          return Number(id);
        }),
    ),
  ];
}
export function importStageLabel(job: {
  state: string;
  stage: string;
  cancelRequested?: boolean;
}): string {
  if (job.cancelRequested) return "正在取消";
  if (job.state === "queued" && job.stage === "retry_wait") return "等待重試";
  if (job.state === "downloading")
    return "正在從 TG 獲取";
  return (
    (
      {
        queued: "排隊中",
        validating: "校驗影片",
        saving: "正在入庫",
        completed: "已儲存",
        failed: "失敗",
        canceled: "已取消",
      } as Record<string, string>
    )[job.state] ?? job.state
  );
}

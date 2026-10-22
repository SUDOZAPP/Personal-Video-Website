import * as api from "../api";
import { Modal } from "../Modal";

export function DeleteDriveModal({
  drive,
  deleting,
  onCancel,
  onConfirm,
}: {
  drive: api.AdminDrive | null;
  deleting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const name = drive?.name || drive?.id || "";
  const title = "刪除儲存";
  const primaryText = deleting ? "刪除中..." : "確認";

  return (
    <Modal
      open={!!drive}
      title={title}
      onClose={onCancel}
      className="admin-modal--delete-confirm"
      footer={
        <>
          <button className="admin-btn" onClick={onCancel} disabled={deleting}>
            取消
          </button>
          <button className="admin-btn" onClick={onConfirm} disabled={deleting}>
            {primaryText}
          </button>
        </>
      }
    >
      <div className="admin-confirm is-message-centered">
        <div className="admin-confirm__content">
          <p className="admin-confirm__message">{`確定要刪除「${name}」嗎？正在執行的任務將先自動停止，完全退出後再刪除。`}</p>
        </div>
      </div>
    </Modal>
  );
}

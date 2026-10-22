import { useState, type InputHTMLAttributes } from "react";
import { Eye, EyeOff } from "lucide-react";

type PasswordInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type">;

export function PasswordInput({ className, ...props }: PasswordInputProps) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="admin-password-input">
      <input
        {...props}
        type={visible ? "text" : "password"}
        className={className}
      />
      <button
        type="button"
        className="admin-password-input__toggle"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? "隱藏密碼" : "顯示密碼"}
        title={visible ? "隱藏密碼" : "顯示密碼"}
      >
        {visible ? <EyeOff size={16} /> : <Eye size={16} />}
      </button>
    </div>
  );
}

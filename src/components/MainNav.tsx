import { useEffect, useRef, useState } from "react";
import { NavLink, useLocation } from "react-router";
import {
  LogOut,
  Star,
  Menu,
  X,
} from "lucide-react";
import { useAuth } from "@/admin/AuthContext";
import { UploadIcon } from "@/components/icons/UploadIcon";
import { VideoIcon } from "@/components/icons/VideoIcon";
import { requestShortsFullscreenOnEntry } from "@/shorts/fullscreen";
import { useNativeBackHandler } from "@/lib/useNativeBack";

// Font Awesome Free 7.3.1 by Fonticons, Inc. — https://fontawesome.com/license/free
function ShortVideoIcon({ size = 16 }: { size?: number }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 448 512"
      width={size}
      height={size}
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M448.5 209.9c-44 .1-87-13.6-122.8-39.2l0 178.7c0 33.1-10.1 65.4-29 92.6s-45.6 48-76.6 59.6-64.8 13.5-96.9 5.3-60.9-25.9-82.7-50.8-35.3-56-39-88.9 2.9-66.1 18.6-95.2 40-52.7 69.6-67.7 62.9-20.5 95.7-16l0 89.9c-15-4.7-31.1-4.6-46 .4s-27.9 14.6-37 27.3-14 28.1-13.9 43.9 5.2 31 14.5 43.7 22.4 22.1 37.4 26.9 31.1 4.8 46-.1 28-14.4 37.2-27.1 14.2-28.1 14.2-43.8l0-349.4 88 0c-.1 7.4 .6 14.9 1.9 22.2 3.1 16.3 9.4 31.9 18.7 45.7s21.3 25.6 35.2 34.6c19.9 13.1 43.2 20.1 67 20.1l0 87.4z" />
    </svg>
  );
}

function AdminIcon({ size = 16 }: { size?: number }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 512 512"
      width={size}
      height={size}
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M195.1 9.5C198.1-5.3 211.2-16 226.4-16l59.8 0c15.2 0 28.3 10.7 31.3 25.5L332 79.5c14.1 6 27.3 13.7 39.3 22.8l67.8-22.5c14.4-4.8 30.2 1.2 37.8 14.4l29.9 51.8c7.6 13.2 4.9 29.8-6.5 39.9L447 233.3c.9 7.4 1.3 15 1.3 22.7s-.5 15.3-1.3 22.7l53.4 47.5c11.4 10.1 14 26.8 6.5 39.9l-29.9 51.8c-7.6 13.1-23.4 19.2-37.8 14.4l-67.8-22.5c-12.1 9.1-25.3 16.7-39.3 22.8l-14.4 69.9c-3.1 14.9-16.2 25.5-31.3 25.5l-59.8 0c-15.2 0-28.3-10.7-31.3-25.5l-14.4-69.9c-14.1-6-27.2-13.7-39.3-22.8L73.5 432.3c-14.4 4.8-30.2-1.2-37.8-14.4L5.8 366.1c-7.6-13.2-4.9-29.8 6.5-39.9l53.4-47.5c-.9-7.4-1.3-15-1.3-22.7s.5-15.3 1.3-22.7L12.3 185.8c-11.4-10.1-14-26.8-6.5-39.9L35.7 94.1c7.6-13.2 23.4-19.2 37.8-14.4l67.8 22.5c12.1-9.1 25.3-16.7 39.3-22.8L195.1 9.5zM256.3 336a80 80 0 1 0 -.6-160 80 80 0 1 0 .6 160z" />
    </svg>
  );
}

const navItems = [
  { to: "/shorts", label: "短影片", icon: ShortVideoIcon },
  { to: "/list", label: "影片", icon: VideoIcon },
];

const uploadNavItem = { to: "/upload", label: "上傳", icon: UploadIcon };
const adminNavItem = { to: "/admin", label: "管理後台", icon: AdminIcon };

export function MainNav() {
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLUListElement | null>(null);
  const toggleRef = useRef<HTMLButtonElement | null>(null);
  const { status, isAdmin, logout } = useAuth();
  useNativeBackHandler(open, () => setOpen(false), "menu");

  const libraryItem = {to:"/library",label:"我的影片庫",icon:Star};
  const items = isAdmin ? [...navItems, libraryItem, uploadNavItem, adminNavItem] : [...navItems,libraryItem];

  const handleLogout = async () => {
    try {
      await logout();
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (menuRef.current?.contains(target) || toggleRef.current?.contains(target)) {
        return;
      }
      setOpen(false);
    };

    document.addEventListener("pointerdown", handlePointerDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [open]);

  return (
    <nav className={`main-nav ${open ? "is-open" : ""}`}>
      <div className="container main-nav__inner">
        <NavLink to="/" className="main-nav__logo" title="Personal Video Website" aria-label="Personal Video Website">
          <span className="main-nav__logo-mark">
            <img src="/pvw-icon-512.png" alt="" className="main-nav__logo-img" />
          </span>
          <span className="main-nav__brand"><strong>Personal Video Website</strong><small>你的私人影片空間</small></span>
        </NavLink>

        <ul ref={menuRef} className="main-nav__list" role="menubar">
          {items.map(({ to, label, icon: Icon }) => (
            <li key={to} role="none">
              <NavLink
                to={to}
                // 短视频页会准备首页作为返回落点，避免从首页进入时留下两个首页。
                replace={to === "/shorts" && location.pathname === "/"}
                role="menuitem"
                className={({ isActive }) =>
                  `main-nav__link ${isActive ? "is-active" : ""}`
                }
                onClick={(event) => {
                  setOpen(false);
                  if (to === "/shorts" && event.button === 0 &&
                    !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) {
                    void requestShortsFullscreenOnEntry();
                  }
                }}
              >
                <Icon size={16} />
                {label}
              </NavLink>
            </li>
          ))}
          {status === "authed" && !isAdmin && (
            <li role="none">
              <button
                className="main-nav__link"
                role="menuitem"
                onClick={handleLogout}
              >
                <LogOut size={16} />
                退出
              </button>
            </li>
          )}
        </ul>

        <button
          ref={toggleRef}
          className="main-nav__toggle"
          aria-label={open ? "關閉選單" : "開啟選單"}
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? <X size={22} /> : <Menu size={22} />}
        </button>
      </div>
    </nav>
  );
}

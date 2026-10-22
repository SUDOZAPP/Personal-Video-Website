# Personal Video Website

以瀏覽器管理與播放個人影片的自架網站。基於 [nianzhibai/91](https://github.com/nianzhibai/91) 修改，提供繁體中文介面、Apple 風格外觀與 Windows 使用方式。

## 功能

- 本機資料夾直接索引與播放，毋須再複製原始影片。
- PikPak 專用 API、WebDAV 等影片來源；可用性依服務與帳號權限而定。
- 搜尋、短影片瀏覽、字幕、自動生成封面、預覽與影片指紋。
- 背景任務暫停與繼續、本機增量掃描及來源變動偵測。
- 我的收藏、繼續觀看：儲存在目前瀏覽器，不會跨裝置同步。
- 一般影片與桌面短影片預設音量 20%，播放時可自行調整。
- Windows 維護工具：資料庫備份、預覽空間管理與狀態查詢。

## 技術與需求

React 18、TypeScript、Vite、ArtPlayer；後端使用 Go 與 SQLite。

- Node.js 22.12 以上及 npm。
- Go 1.23.4 以上；後端附有 vendor 相依套件。
- FFmpeg、FFprobe：生成封面、預覽及分析影片時需要，請加入 PATH。
- 本 ZIP 是原始碼包，不含上述工具、已編譯執行檔或 Windows 安裝程式。

## Windows 編譯與啟動

解壓縮後，在專案根目錄開啟 PowerShell：

```powershell
npm ci
npx tsc -b
npx vite build --configLoader native
New-Item -ItemType Directory -Force release | Out-Null
Push-Location backend
go build -mod=vendor -trimpath -o ../release/server.exe ./cmd/server
go build -mod=vendor -trimpath -o ../release/maintenance.exe ./cmd/windows-maintenance
Pop-Location
Copy-Item dist release/dist -Recurse -Force
Copy-Item backend/config.example.yaml release/config.yaml
```

這是首次建立 release 的流程。之後更新請保留原有 config.yaml 與 data，不要以範例設定覆寫私人設定。

編輯 `release/config.yaml`，將 `server.listen` 改為 `127.0.0.1:9191`，先限本機使用。接著：

```powershell
Set-Location release
$env:VIDEO_CONFIG = Join-Path $PWD 'config.yaml'
$env:VIDEO_FRONTEND_DIR = Join-Path $PWD 'dist'
.\server.exe
```

開啟 <http://127.0.0.1:9191>，依首次啟動畫面建立管理員。前景執行時按 Ctrl+C 停止服務。

可在另一個位於 release 的 PowerShell 視窗執行維護：

```powershell
.\maintenance.exe status
.\maintenance.exe backup
.\maintenance.exe watch
```

watch 必須保持執行才會持續維護，並非 Windows 系統服務。維護設定檔為 maintenance.json；原始影片與資料庫應分別備份。

## 加入影片

管理後台 → 雲端硬碟管理 → 新增雲端硬碟。

### 本機儲存

填入實際資料夾，例如 `D:\Videos`，再掃描來源。本機影片不會另存一份，但資料庫、封面、預覽與暫存檔會占用硬碟。

### WebDAV

填入服務提供的完整 HTTPS 網址、帳號密碼及根目錄。連接後先掃描並測試播放，再生成封面與預覽；分析與播放會讀取遠端影片並消耗流量。

目前提供 WebDAV **用戶端**功能，沒有提供 WebDAV 服務端，不能把本網站網址直接當成 Infuse、VidHub、Kodi 的 WebDAV 來源。

### PikPak

可用 PikPak 專用來源，或服務提供的 WebDAV。專用登入可能遇到人機驗證、權杖失效或網路逾時；官方網頁登入不會自動授權本程式，目前人機驗證仍可能需要人工處理。不要在公開 Issue 貼出密碼、權杖或驗證網址。

避免用兩種來源重複掃描同一個資料夾。

## 開發檢查

```powershell
npm run lint
npm test
```

```powershell
Set-Location backend
go test -mod=vendor ./internal/catalog ./internal/scanner
```

本次打包前已通過 TypeScript 檢查與前端正式編譯。部分整合測試依賴外部服務或作業系統能力，不代表所有網盤與全套整合測試皆已驗證。

## 專案結構

| 路徑 | 用途 |
| --- | --- |
| src、public | 前端程式與圖示 |
| backend | Go 後端、資料庫結構、範例設定與 vendor 相依套件 |
| tests | 前端測試 |
| release | 自行編譯後的程式及私人執行資料，勿提交 Git |

## 發布到 GitHub

上傳解壓縮後的專案內容。此 ZIP 已排除私人影片、私人設定、SQLite、日誌、快取、備份、node_modules、編譯產物與 Git 歷史；只保留範例設定。

設定檔、資料庫與備份可能包含帳密及權杖，請勿提交。若需區域網路存取，另行設定監聽位址、防火牆及驗證，並使用電腦的區域網路 IP；其他裝置的 127.0.0.1 不會指向這台電腦。

## 授權與致謝

沿用上游 MIT 授權，見 [LICENSE](LICENSE)，保留原始著作權。此版本為個人用途修改版，並非 PikPak 或 Apple 官方產品。第三方工具與相依套件各自遵循其授權。請僅管理有權存取與使用的內容。

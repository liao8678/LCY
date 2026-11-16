# 支撐架使用個案巡查申請
提供支撐架使用個案的巡查申請表單與清單：申請人填寫工程、地點、支撐架型式、高度、巡查階段及希望巡查日期，送出後狀態為「待審核」。

> 本頁由原「報修登記系統」改版而來；`文件/` 內的 Excel、Word 仍為報修版本，`supabase/schema.sql` 保留原報修資料表結構。

## 網頁使用方式

首頁為根目錄的 `index.html`，使用純 HTML/CSS/JavaScript，隨站提供固定版本 Supabase JS v2.119.0，無須建置。以 `python3 -m http.server 8000` 啟動後開啟 `http://localhost:8000`。

`config.js` 放置 Supabase 網址及可公開的 publishable key。**上線前請由管理者在 Supabase SQL Editor 套用 `supabase/inspection_schema.sql`**，建立 `inspection_requests` 資料表、欄位限制、權限與 RLS；未套用前網頁會顯示載入失敗。前端只新增九個表單欄位，不指定 `id`、`created_at`、`status`，也不提供修改或刪除操作；希望巡查日期須為台北時間今天起一年內（前端與 RLS 均會檢查）。公開清單任何人可讀，請勿填寫電話等個人資料。清單顯示最新 20 筆，時間以台北時區呈現。公開示範請使用虛構資料。

GitHub Pages 請在 Settings → Pages 選擇 Deploy from a branch、`main`、`/ (root)`。預期網址為 https://liao8678.github.io/LCY/ （若設定自訂網域，則以 Pages 顯示的網址為準）。

[報修欄位表與範例資料](文件/報修欄位表.xlsx)

[報修系統操作說明（約一頁半，含填表與最近報修實拍）](文件/報修系統操作說明.docx)

## PWA 安裝與離線使用

部署至 HTTPS（例如 GitHub Pages）後，Android／桌面 Chrome 或 Edge 可由瀏覽器安裝選單加入；瀏覽器提供安裝提示時，頁面也會出現「安裝巡查申請」。iPhone／iPad 請用 Safari 分享選單 →「加入主畫面」。安裝後以獨立視窗開啟。安裝選項依瀏覽器支援而定。

本機測試使用 `python3 -m http.server 8000`，開啟 `http://localhost:8000/`；不要直接用 `file://`。第一次需連線開啟並等待 Service Worker 安裝完成，之後可離線重開表單。申請送出與清單更新仍需網路；離線時會停用送出並顯示提示，恢復連線後請手動送出。沒有離線送出佇列，也不會自動重送。表單只存在目前頁面，關閉／重載不保留。

快取僅包含網頁靜態資源、公開設定、圖示與 Supabase SDK，不儲存申請 API 回應或表單資料。原有資料庫權限不變。Supabase SDK 固定為 v2.119.0（`vendor/`，附 MIT 授權），避免離線啟動依賴 CDN。更新快取資源時請遞增 `sw.js` 的版本；新版本會在舊頁面全部關閉後啟用，不強制重載填寫中的表單。範圍使用相對路徑，支援 GitHub Pages 的 `/LCY/` 子路徑。

自動驗證：`python3 tests/test_pwa.py`（需 Python Playwright 與 Chromium；Chromium 不在 `/usr/bin/chromium` 時以 `CHROMIUM_PATH` 指定）。涵蓋 Chromium 安裝條件、根路徑、`/LCY/` 子路徑、離線重開、恢復連線、模擬送出與靜態快取範圍；API 使用虛構資料模擬，不代表線上 Supabase 權限驗證。

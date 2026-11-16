# Repository Guidelines

## 專案結構與範圍

以 `工地巡查需求筆記.txt` 為準。這份筆記定義了巡查欄位、操作流程、存取規則及交付物：網頁巡查紀錄表單與清單（PWA），以及 Supabase 資料表與存取規則。網頁位於根目錄（`index.html`、`app.js`、`style.css`、`config.js`、`sw.js`、`pwa.js`），資料表結構在 `supabase/site_inspection_schema.sql`，瀏覽器測試在 `tests/`。

## 開發與命名

純 HTML/CSS/JavaScript，無須建置；以 `python3 -m http.server 8000` 啟動。在 PowerShell 中執行 `Get-Content -Encoding utf8 -LiteralPath './工地巡查需求筆記.txt'` 即可閱讀需求。請將文字檔儲存為 UTF-8，並沿用需求筆記中的繁體中文欄位名稱。更新快取資源時請遞增 `sw.js` 的版本。

## 測試與示範存取規則

執行 `python3 tests/test_pwa.py`（需 Python Playwright 與 Chromium，可用 `CHROMIUM_PATH` 指定瀏覽器）。請確認訪客可以送出一筆虛構巡查紀錄、在清單中看到該筆紀錄，並查看系統自動產生的登錄時間。使用前端公開金鑰驗證資料表只允許新增與讀取，禁止修改與刪除。請啟用 Supabase 資料列安全性（RLS），將具管理權限的金鑰留在前端之外，並在所有範例中使用虛構姓名與地點。登入、缺失追蹤及通知留待後續規劃。

## 提交與審查

請使用簡短、明確的提交摘要，例如「新增巡查紀錄表單」。提出合併請求（PR）時，請說明變更內容與驗證方式。有對應議題時請附上連結，表單或清單的畫面有變更時請附上截圖。

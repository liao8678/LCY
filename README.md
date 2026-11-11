# 報修登記系統
提供報修表單與清單，方便同事登記問題並查閱報修紀錄。

雲端任務測試

## 網頁使用方式

首頁為根目錄的 `index.html`，使用純 HTML/CSS/JavaScript，透過 CDN 載入 Supabase JS v2，無須建置。以 `python3 -m http.server 8000` 啟動後開啟 `http://localhost:8000`。

`config.js` 放置 Supabase 網址及可公開的 publishable key。資料表欄位與權限需由管理者先套用 `supabase/schema.sql`；前端只新增五個表單欄位，不指定 `id`、`created_at`、`status`，也不提供修改或刪除操作。清單顯示最新 20 筆，時間以台北時區呈現。公開示範請使用虛構資料。

GitHub Pages 請在 Settings → Pages 選擇 Deploy from a branch、`main`、`/ (root)`。預期網址為 https://liao8678.github.io/LCY/ （若設定自訂網域，則以 Pages 顯示的網址為準）。

[報修欄位表與範例資料](文件/報修欄位表.xlsx)

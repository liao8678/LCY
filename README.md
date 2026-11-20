# 工地巡查紀錄
提供工地巡查紀錄表單與清單：巡查人員登錄巡查日期、工程名稱、巡查區域、巡查項目（支撐架、施工架、開口及墜落防護、電氣設備、機具設備、環境整潔、其他）、巡查結果（合格／需改善／立即停工）及巡查說明，並查看最近 20 筆紀錄。

需求以 `工地巡查需求筆記.txt` 為準。

## 網頁使用方式

首頁為根目錄的 `index.html`，使用純 HTML/CSS/JavaScript，隨站提供固定版本 Supabase JS v2.119.0，無須建置。以 `python3 -m http.server 8000` 啟動後開啟 `http://localhost:8000`。

`config.js` 放置 Supabase 網址及可公開的 publishable key。**上線前請由管理者在 Supabase SQL Editor 套用 `supabase/site_inspection_schema.sql`**，建立 `site_inspections` 資料表、欄位限制、權限與 RLS；未套用前網頁會顯示載入失敗。前端只新增七個表單欄位，不指定 `id`、`created_at`，也不提供修改或刪除操作；巡查日期預設為今天，須為台北時間今天或過去 30 天內（前端與 RLS 均會檢查）。公開清單任何人可讀，請勿填寫電話等個人資料。清單顯示最新 20 筆，時間以台北時區呈現。公開示範請使用虛構資料。

GitHub Pages 請在 Settings → Pages 選擇 Deploy from a branch、`main`、`/ (root)`。預期網址為 https://liao8678.github.io/LCY/ （若設定自訂網域，則以 Pages 顯示的網址為準）。

舊版報修系統的 Supabase 資料表 `repair_requests` 已不使用；確認不需保留後，可在 SQL Editor 執行 `supabase/drop_repair_requests.sql` 永久刪除該表與全部報修資料（無法復原，建議先匯出備份）。

## PWA 安裝與離線使用

部署至 HTTPS（例如 GitHub Pages）後，Android／桌面 Chrome 或 Edge 可由瀏覽器安裝選單加入；瀏覽器提供安裝提示時，頁面也會出現「安裝工地巡查」。iPhone／iPad 請用 Safari 分享選單 →「加入主畫面」。安裝後以獨立視窗開啟。安裝選項依瀏覽器支援而定。

本機測試使用 `python3 -m http.server 8000`，開啟 `http://localhost:8000/`；不要直接用 `file://`。第一次需連線開啟並等待 Service Worker 安裝完成，之後可離線重開表單。紀錄送出與清單更新仍需網路；離線時會停用送出並顯示提示，恢復連線後請手動送出。沒有離線送出佇列，也不會自動重送。表單只存在目前頁面，關閉／重載不保留。

快取僅包含網頁靜態資源、公開設定、圖示與 Supabase SDK，不儲存巡查紀錄 API 回應或表單資料。Supabase SDK 固定為 v2.119.0（`vendor/`，附 MIT 授權），避免離線啟動依賴 CDN。更新快取資源時請遞增 `sw.js` 的版本；新版本會在舊頁面全部關閉後啟用，不強制重載填寫中的表單。範圍使用相對路徑，支援 GitHub Pages 的 `/LCY/` 子路徑。

自動驗證：`python3 tests/test_pwa.py`（需 Python Playwright 與 Chromium；Chromium 不在 `/usr/bin/chromium` 時以 `CHROMIUM_PATH` 指定）。涵蓋 Chromium 安裝條件、根路徑、`/LCY/` 子路徑、離線重開、恢復連線、模擬送出與靜態快取範圍；API 使用虛構資料模擬，不代表線上 Supabase 權限驗證。

## 威力彩歷史開獎分析

獨立頁面 `lottery/`（上線後為 https://liao8678.github.io/LCY/lottery/ ），與工地巡查網頁無關、不使用 Supabase。統計第一區 01–38 與第二區 1–8 的出現次數、冷熱號與未開期數、每期奇數個數，以及「各期號碼總和分析」（平均、中位數、標準差、最小／最大、總和分布與 38 選 6 精確理論值比較、偏低／中間／偏高區間、含第二區的總和、各期總和走勢與移動平均）、各獎項機率表（精確機率與各期銷售推算的理論中獎注數 vs. 實際中獎注數）、理論值與實際值對照（連號、生日號碼、與上期重複等 10 項，並判讀是否在隨機誤差內）、選號方法回測（熱門號、冷門號、最久未開、照抄上期、隨機選號，每期只用之前的資料選號再對照實際開獎，可選參考前 50／100／200 期），並以卡方檢定檢查號碼是否均勻；可切換全部、最近 500／100／50 期。每期開獎是獨立隨機事件，統計結果不會提高中獎機率。

威力彩分析也是獨立的 PWA（名稱「威力彩分析」，範圍限 `lottery/`，與工地巡查 PWA 分開安裝、互不影響）：開啟 https://liao8678.github.io/LCY/lottery/ 後，可按頁面上的「安裝威力彩分析」或瀏覽器選單安裝；iPhone／iPad 請用 Safari 分享選單 →「加入主畫面」。第一次需連線開啟，之後可離線查看；`data.json` 採網路優先，離線時顯示上次下載的資料並提示更新日期。更新網頁檔案時請遞增 `lottery/sw.js` 的版本。自動驗證：`python3 tests/test_lottery_pwa.py`。

開獎資料（號碼、銷售金額、各獎項中獎注數）存於 `lottery/data.json`，來源為台灣彩券官方網站。更新資料：`python3 tools/fetch_power_lottery.py`（需能連線 api.taiwanlottery.com）。

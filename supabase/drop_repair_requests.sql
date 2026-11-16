-- 刪除舊版報修系統的資料表與全部報修資料。
-- ⚠ 無法復原：執行前請確認不再需要，必要時先於 Table Editor 匯出 CSV 備份。
-- 由資料庫管理者於 Supabase SQL Editor 手動執行；不影響 site_inspections。
BEGIN;
DROP TABLE IF EXISTS public.repair_requests;
COMMIT;

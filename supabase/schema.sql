-- 報修登記系統初始結構：僅提供 SQL 檔，本次不執行。
-- 日後由資料庫管理者於 Supabase SQL Editor 手動執行一次；資料表已存在時應停止，另寫遷移。
-- 使用交易讓建表、權限及資料列安全設定一併成功或回復。
BEGIN;

-- 建立報修資料表：所有欄位必填；UUID 與含時區的建立時間由資料庫自動產生。
-- 緊急程度預設為「中」，處理狀態預設為「待處理」。
CREATE TABLE public.repair_requests (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at timestamptz NOT NULL DEFAULT now(),
    reporter_name text NOT NULL,
    location text NOT NULL,
    category text NOT NULL,
    description text NOT NULL,
    urgency text NOT NULL DEFAULT '中',
    status text NOT NULL DEFAULT '待處理',

    -- CHECK 第一部分：以字元數限制姓名 1～100、地點 1～200、說明 1～2,000 字。
    -- 長度包含前後空白，且至少須含一個非空白字元，避免只填空格、換行或定位字元。
    CONSTRAINT repair_requests_reporter_name_check CHECK (
        char_length(reporter_name) BETWEEN 1 AND 100
        AND reporter_name ~ '[^[:space:]]'
    ),
    CONSTRAINT repair_requests_location_check CHECK (
        char_length(location) BETWEEN 1 AND 200
        AND location ~ '[^[:space:]]'
    ),
    CONSTRAINT repair_requests_description_check CHECK (
        char_length(description) BETWEEN 1 AND 2000
        AND description ~ '[^[:space:]]'
    ),

    -- CHECK 第二部分：類別、緊急程度與狀態只接受列出的完整值，也自然限制文字長度。
    CONSTRAINT repair_requests_category_check
        CHECK (category IN ('設備', '網路', '環境', '其他')),
    CONSTRAINT repair_requests_urgency_check
        CHECK (urgency IN ('低', '中', '高')),
    CONSTRAINT repair_requests_status_check
        CHECK (status IN ('待處理', '處理中', '已完成'))
);

-- GRANT：不依賴新資料表的預設授權，先撤銷一般 API 角色及 PUBLIC 的資料表權限。
-- 只授予 anon 使用 public 結構、讀取清單，以及新增表單必要欄位的權限。
-- 不授予 id、created_at、status 的新增權限，也不授予修改、刪除或清空資料表的權限。
-- 前端新增時須省略這三個系統欄位；本次不開放 authenticated 角色的存取。
REVOKE ALL PRIVILEGES ON TABLE public.repair_requests FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA public TO anon;
GRANT SELECT ON TABLE public.repair_requests TO anon;
GRANT INSERT (reporter_name, location, category, description, urgency)
    ON TABLE public.repair_requests TO anon;

-- RLS：啟用資料列安全；任何使用 anon 角色的訪客都能讀取完整清單。
ALTER TABLE public.repair_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY repair_requests_anon_select
    ON public.repair_requests
    FOR SELECT
    TO anon
    USING (true);

-- RLS：訪客可以新增，但新增後的狀態必須是「待處理」。
-- 即使未來誤開 status 欄位的新增權限，此規則仍會擋下其他狀態。
-- 不建立 UPDATE 或 DELETE 政策，配合 GRANT 層禁止訪客修改或刪除。
CREATE POLICY repair_requests_anon_insert
    ON public.repair_requests
    FOR INSERT
    TO anon
    WITH CHECK (status = '待處理');

-- 套用注意：公開清單可能洩露個資，匿名新增仍須另設限流或驗證碼。
-- 具 BYPASSRLS 權限的角色（例如 service_role）不受上述 RLS 保護，管理金鑰不得放在前端。
COMMIT;

-- 報修登記系統結構：僅提供 SQL 檔，本次不執行。
-- 可由資料庫管理者於 Supabase SQL Editor 套用或重複套用，不刪表、不刪除或改寫既有資料。
-- 已有資料表須符合下列欄位型別；結構或資料不相容時整筆交易失敗，應先檢查而非清空資料。
-- 本檔會重設此表全部 RLS 政策，以及 PUBLIC、anon、authenticated 的資料表與欄位權限。
-- 使用交易讓建表、權限及資料列安全設定一併成功或回復。
BEGIN;

-- 建立報修資料表：所有欄位必填；UUID 與含時區的建立時間由資料庫自動產生。
-- 緊急程度預設為「中」，處理狀態預設為「待處理」。
CREATE TABLE IF NOT EXISTS public.repair_requests (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at timestamptz NOT NULL DEFAULT now(),
    reporter_name text NOT NULL,
    location text NOT NULL,
    category text NOT NULL,
    description text NOT NULL,
    urgency text NOT NULL DEFAULT '中',
    status text NOT NULL DEFAULT '待處理'
);

-- 鎖定此表，避免檢查結構與更新限制期間有其他寫入；提交或回復後自動釋放。
LOCK TABLE public.repair_requests IN ACCESS EXCLUSIVE MODE;

-- 既有資料表不能只靠 IF NOT EXISTS：先核對八個欄位及型別，不自動轉型或移除其他欄位。
-- 額外欄位也視為結構不符，避免 SELECT 授權意外公開原本不在本次設計中的資料。
-- 不相容時提供明確錯誤，避免在未知結構上繼續套用；此檢查也不會修改資料。
DO $structure$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM (VALUES
            ('id', 'uuid'::regtype),
            ('created_at', 'timestamptz'::regtype),
            ('reporter_name', 'text'::regtype),
            ('location', 'text'::regtype),
            ('category', 'text'::regtype),
            ('description', 'text'::regtype),
            ('urgency', 'text'::regtype),
            ('status', 'text'::regtype)
        ) AS expected(column_name, column_type)
        LEFT JOIN pg_catalog.pg_attribute AS actual
            ON actual.attrelid = 'public.repair_requests'::regclass
            AND actual.attname = expected.column_name
            AND actual.attnum > 0 AND NOT actual.attisdropped
        WHERE actual.atttypid IS DISTINCT FROM expected.column_type::oid
            OR actual.attgenerated <> '' OR actual.attidentity <> ''
    ) OR (
        SELECT count(*) FROM pg_catalog.pg_attribute
        WHERE attrelid = 'public.repair_requests'::regclass AND attnum > 0 AND NOT attisdropped
    ) <> 8 THEN
        RAISE EXCEPTION 'repair_requests 欄位缺漏、有額外欄位、型別不符或含產生欄位，請先檢查既有結構；未改寫資料';
    END IF;

    -- 已有主鍵必須只包含 id；若尚無主鍵則新增，重複或空值會令整筆交易失敗。
    IF NOT EXISTS (
        SELECT 1 FROM pg_catalog.pg_constraint
        WHERE conrelid = 'public.repair_requests'::regclass AND contype = 'p'
    ) THEN
        ALTER TABLE public.repair_requests ADD PRIMARY KEY (id);
    ELSIF NOT EXISTS (
        SELECT 1 FROM pg_catalog.pg_constraint
        WHERE conrelid = 'public.repair_requests'::regclass AND contype = 'p'
            AND conkey = ARRAY[(
                SELECT attnum FROM pg_catalog.pg_attribute
                WHERE attrelid = 'public.repair_requests'::regclass AND attname = 'id'
            )]::smallint[]
    ) THEN
        RAISE EXCEPTION 'repair_requests 既有主鍵不是單一 id，請先檢查既有結構；未改寫資料';
    END IF;
END;
$structure$;

-- 對新表與既有表一律套用必填及預設值；不以 UPDATE 補值，既有空值將使交易回復。
ALTER TABLE public.repair_requests
    ALTER COLUMN id SET NOT NULL,
    ALTER COLUMN id SET DEFAULT gen_random_uuid(),
    ALTER COLUMN created_at SET NOT NULL,
    ALTER COLUMN created_at SET DEFAULT now(),
    ALTER COLUMN reporter_name SET NOT NULL,
    ALTER COLUMN location SET NOT NULL,
    ALTER COLUMN category SET NOT NULL,
    ALTER COLUMN description SET NOT NULL,
    ALTER COLUMN urgency SET NOT NULL,
    ALTER COLUMN urgency SET DEFAULT '中',
    ALTER COLUMN status SET NOT NULL,
    ALTER COLUMN status SET DEFAULT '待處理';

-- CHECK：重新建立本檔管理的六個具名限制，讓重複套用與已有資料表都獲得相同限制。
-- 新限制會檢查全部既有資料；發現超長、空白或不合法值時停止，不自動刪除或修正資料。
ALTER TABLE public.repair_requests
    DROP CONSTRAINT IF EXISTS repair_requests_reporter_name_check,
    DROP CONSTRAINT IF EXISTS repair_requests_location_check,
    DROP CONSTRAINT IF EXISTS repair_requests_description_check,
    DROP CONSTRAINT IF EXISTS repair_requests_category_check,
    DROP CONSTRAINT IF EXISTS repair_requests_urgency_check,
    DROP CONSTRAINT IF EXISTS repair_requests_status_check;
ALTER TABLE public.repair_requests
    -- CHECK 第一部分：以字元數限制姓名 1～100、地點 1～200、說明 1～2,000 字。
    -- 長度包含前後空白，且至少須含一個非空白字元，避免只填空格、換行或定位字元。
    ADD CONSTRAINT repair_requests_reporter_name_check CHECK (
        char_length(reporter_name) BETWEEN 1 AND 100
        AND reporter_name ~ '[^[:space:]]'
    ),
    ADD CONSTRAINT repair_requests_location_check CHECK (
        char_length(location) BETWEEN 1 AND 200
        AND location ~ '[^[:space:]]'
    ),
    ADD CONSTRAINT repair_requests_description_check CHECK (
        char_length(description) BETWEEN 1 AND 2000
        AND description ~ '[^[:space:]]'
    ),

    -- CHECK 第二部分：類別、緊急程度與狀態只接受列出的完整值，也自然限制文字長度。
    ADD CONSTRAINT repair_requests_category_check
        CHECK (category IN ('設備', '網路', '環境', '其他')),
    ADD CONSTRAINT repair_requests_urgency_check
        CHECK (urgency IN ('低', '中', '高')),
    ADD CONSTRAINT repair_requests_status_check
        CHECK (status IN ('待處理', '處理中', '已完成'));

-- GRANT：不依賴新資料表的預設授權，先撤銷一般 API 角色及 PUBLIC 的資料表權限。
-- 只授予 anon 使用 public 結構、讀取清單，以及新增表單必要欄位的權限。
-- 不授予 id、created_at、status 的新增權限，也不授予修改、刪除或清空資料表的權限。
-- 前端新增時須省略這三個系統欄位；本次不開放 authenticated 角色的存取。
REVOKE ALL PRIVILEGES ON TABLE public.repair_requests FROM PUBLIC, anon, authenticated;

-- 既有欄位授權不會被資料表層級 REVOKE 清除，須另外逐欄撤銷，包含可能存在的額外欄位。
DO $privileges$
DECLARE
    column_names text;
BEGIN
    SELECT string_agg(format('%I', attname), ', ' ORDER BY attnum)
        INTO column_names
    FROM pg_catalog.pg_attribute
    WHERE attrelid = 'public.repair_requests'::regclass AND attnum > 0 AND NOT attisdropped;
    EXECUTE format(
        'REVOKE ALL PRIVILEGES (%s) ON TABLE public.repair_requests FROM PUBLIC, anon, authenticated',
        column_names
    );
END;
$privileges$;

GRANT USAGE ON SCHEMA public TO anon;
GRANT SELECT ON TABLE public.repair_requests TO anon;
GRANT INSERT (reporter_name, location, category, description, urgency)
    ON TABLE public.repair_requests TO anon;

-- RLS：啟用資料列安全；任何使用 anon 角色的訪客都能讀取完整清單。
ALTER TABLE public.repair_requests ENABLE ROW LEVEL SECURITY;

-- 移除此表既有政策後再建本次兩條政策，避免舊的寬鬆新增政策以 OR 合併而繞過狀態限制。
-- 此表的其他自訂政策也會移除；管理員流程日後須以另一份遷移明確新增。
DO $policies$
DECLARE
    policy_name text;
BEGIN
    FOR policy_name IN
        SELECT policyname FROM pg_catalog.pg_policies
        WHERE schemaname = 'public' AND tablename = 'repair_requests'
    LOOP
        EXECUTE format('DROP POLICY %I ON public.repair_requests', policy_name);
    END LOOP;
END;
$policies$;

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

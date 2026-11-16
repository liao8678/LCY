-- 支撐架使用個案巡查申請結構：由資料庫管理者於 Supabase SQL Editor 套用，可重複套用。
-- 不刪表、不刪除或改寫既有資料；結構或資料不相容時整筆交易失敗。
-- 本檔會重設此表全部 RLS 政策，以及 PUBLIC、anon、authenticated 的資料表與欄位權限。
-- 原有 repair_requests 資料表不受影響。
BEGIN;

-- 建立巡查申請資料表：UUID、建立時間與審核狀態由資料庫自動產生。
CREATE TABLE IF NOT EXISTS public.inspection_requests (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at timestamptz NOT NULL DEFAULT now(),
    applicant_name text NOT NULL,
    applicant_unit text NOT NULL,
    project_name text NOT NULL,
    site_location text NOT NULL,
    support_type text NOT NULL,
    support_height text NOT NULL,
    inspection_stage text NOT NULL,
    preferred_date date NOT NULL,
    description text NOT NULL,
    status text NOT NULL DEFAULT '待審核'
);

LOCK TABLE public.inspection_requests IN ACCESS EXCLUSIVE MODE;

-- 核對既有資料表的十二個欄位與型別；額外欄位也視為不符，避免公開讀取到非預期資料。
DO $structure$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM (VALUES
            ('id', 'uuid'::regtype),
            ('created_at', 'timestamptz'::regtype),
            ('applicant_name', 'text'::regtype),
            ('applicant_unit', 'text'::regtype),
            ('project_name', 'text'::regtype),
            ('site_location', 'text'::regtype),
            ('support_type', 'text'::regtype),
            ('support_height', 'text'::regtype),
            ('inspection_stage', 'text'::regtype),
            ('preferred_date', 'date'::regtype),
            ('description', 'text'::regtype),
            ('status', 'text'::regtype)
        ) AS expected(column_name, column_type)
        LEFT JOIN pg_catalog.pg_attribute AS actual
            ON actual.attrelid = 'public.inspection_requests'::regclass
            AND actual.attname = expected.column_name
            AND actual.attnum > 0 AND NOT actual.attisdropped
        WHERE actual.atttypid IS DISTINCT FROM expected.column_type::oid
            OR actual.attgenerated <> '' OR actual.attidentity <> ''
    ) OR (
        SELECT count(*) FROM pg_catalog.pg_attribute
        WHERE attrelid = 'public.inspection_requests'::regclass AND attnum > 0 AND NOT attisdropped
    ) <> 12 THEN
        RAISE EXCEPTION 'inspection_requests 欄位缺漏、有額外欄位、型別不符或含產生欄位，請先檢查既有結構；未改寫資料';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_catalog.pg_constraint
        WHERE conrelid = 'public.inspection_requests'::regclass AND contype = 'p'
    ) THEN
        ALTER TABLE public.inspection_requests ADD PRIMARY KEY (id);
    ELSIF NOT EXISTS (
        SELECT 1 FROM pg_catalog.pg_constraint
        WHERE conrelid = 'public.inspection_requests'::regclass AND contype = 'p'
            AND conkey = ARRAY[(
                SELECT attnum FROM pg_catalog.pg_attribute
                WHERE attrelid = 'public.inspection_requests'::regclass AND attname = 'id'
            )]::smallint[]
    ) THEN
        RAISE EXCEPTION 'inspection_requests 既有主鍵不是單一 id，請先檢查既有結構；未改寫資料';
    END IF;
END;
$structure$;

ALTER TABLE public.inspection_requests
    ALTER COLUMN id SET DEFAULT gen_random_uuid(),
    ALTER COLUMN created_at SET DEFAULT now(),
    ALTER COLUMN status SET DEFAULT '待審核';

-- CHECK：文字長度 1～上限且不能只有空白；選項欄位只接受列出的完整值。
ALTER TABLE public.inspection_requests
    DROP CONSTRAINT IF EXISTS inspection_requests_applicant_name_check,
    DROP CONSTRAINT IF EXISTS inspection_requests_applicant_unit_check,
    DROP CONSTRAINT IF EXISTS inspection_requests_project_name_check,
    DROP CONSTRAINT IF EXISTS inspection_requests_site_location_check,
    DROP CONSTRAINT IF EXISTS inspection_requests_description_check,
    DROP CONSTRAINT IF EXISTS inspection_requests_support_type_check,
    DROP CONSTRAINT IF EXISTS inspection_requests_support_height_check,
    DROP CONSTRAINT IF EXISTS inspection_requests_inspection_stage_check,
    DROP CONSTRAINT IF EXISTS inspection_requests_status_check;
ALTER TABLE public.inspection_requests
    ADD CONSTRAINT inspection_requests_applicant_name_check CHECK (
        char_length(applicant_name) BETWEEN 1 AND 100 AND applicant_name ~ '[^[:space:]]'),
    ADD CONSTRAINT inspection_requests_applicant_unit_check CHECK (
        char_length(applicant_unit) BETWEEN 1 AND 100 AND applicant_unit ~ '[^[:space:]]'),
    ADD CONSTRAINT inspection_requests_project_name_check CHECK (
        char_length(project_name) BETWEEN 1 AND 200 AND project_name ~ '[^[:space:]]'),
    ADD CONSTRAINT inspection_requests_site_location_check CHECK (
        char_length(site_location) BETWEEN 1 AND 200 AND site_location ~ '[^[:space:]]'),
    ADD CONSTRAINT inspection_requests_description_check CHECK (
        char_length(description) BETWEEN 1 AND 2000 AND description ~ '[^[:space:]]'),
    ADD CONSTRAINT inspection_requests_support_type_check
        CHECK (support_type IN ('系統式支撐架', '框式鋼管支撐', '可調式鋼管支柱', '其他')),
    ADD CONSTRAINT inspection_requests_support_height_check
        CHECK (support_height IN ('未滿 5 公尺', '5 公尺以上未滿 7 公尺', '7 公尺以上')),
    ADD CONSTRAINT inspection_requests_inspection_stage_check
        CHECK (inspection_stage IN ('組立完成檢查', '混凝土澆置前檢查', '澆置中巡查', '拆除前檢查')),
    ADD CONSTRAINT inspection_requests_status_check
        CHECK (status IN ('待審核', '已排定', '已巡查'));

-- GRANT：只開放 anon 讀取清單與新增表單欄位；id、created_at、status 不可由前端指定。
REVOKE ALL PRIVILEGES ON TABLE public.inspection_requests FROM PUBLIC, anon, authenticated;

DO $privileges$
DECLARE
    column_names text;
BEGIN
    SELECT string_agg(format('%I', attname), ', ' ORDER BY attnum)
        INTO column_names
    FROM pg_catalog.pg_attribute
    WHERE attrelid = 'public.inspection_requests'::regclass AND attnum > 0 AND NOT attisdropped;
    EXECUTE format(
        'REVOKE ALL PRIVILEGES (%s) ON TABLE public.inspection_requests FROM PUBLIC, anon, authenticated',
        column_names
    );
END;
$privileges$;

GRANT USAGE ON SCHEMA public TO anon;
GRANT SELECT ON TABLE public.inspection_requests TO anon;
GRANT INSERT (applicant_name, applicant_unit, project_name, site_location, support_type,
              support_height, inspection_stage, preferred_date, description)
    ON TABLE public.inspection_requests TO anon;

-- RLS：任何訪客可讀取與新增；不建立 UPDATE、DELETE 政策。
ALTER TABLE public.inspection_requests ENABLE ROW LEVEL SECURITY;

DO $policies$
DECLARE
    policy_name text;
BEGIN
    FOR policy_name IN
        SELECT policyname FROM pg_catalog.pg_policies
        WHERE schemaname = 'public' AND tablename = 'inspection_requests'
    LOOP
        EXECUTE format('DROP POLICY %I ON public.inspection_requests', policy_name);
    END LOOP;
END;
$policies$;

CREATE POLICY inspection_requests_anon_select
    ON public.inspection_requests
    FOR SELECT
    TO anon
    USING (true);

-- 新增時狀態必須為「待審核」，希望巡查日期不得早於台北時間今天、也不得超過一年後。
CREATE POLICY inspection_requests_anon_insert
    ON public.inspection_requests
    FOR INSERT
    TO anon
    WITH CHECK (
        status = '待審核'
        AND preferred_date >= (now() AT TIME ZONE 'Asia/Taipei')::date
        AND preferred_date <= (now() AT TIME ZONE 'Asia/Taipei')::date + 365
    );

-- 套用注意：公開清單不應放真實姓名或電話；匿名新增仍須另設限流或驗證碼。
-- service_role 等具 BYPASSRLS 權限的金鑰不得放在前端。
COMMIT;

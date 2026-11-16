-- 工地巡查紀錄結構：由資料庫管理者於 Supabase SQL Editor 套用，可重複套用。
-- 不刪表、不刪除或改寫既有資料；結構或資料不相容時整筆交易失敗。
-- 本檔會重設此表全部 RLS 政策，以及 PUBLIC、anon、authenticated 的資料表與欄位權限。
BEGIN;

-- 建立工地巡查紀錄資料表：UUID 與登錄時間由資料庫自動產生。
CREATE TABLE IF NOT EXISTS public.site_inspections (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at timestamptz NOT NULL DEFAULT now(),
    inspector_name text NOT NULL,
    project_name text NOT NULL,
    inspection_area text NOT NULL,
    inspection_date date NOT NULL,
    inspection_item text NOT NULL,
    result text NOT NULL,
    findings text NOT NULL
);

LOCK TABLE public.site_inspections IN ACCESS EXCLUSIVE MODE;

-- 核對既有資料表的九個欄位與型別；額外欄位也視為不符，避免公開讀取到非預期資料。
DO $structure$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM (VALUES
            ('id', 'uuid'::regtype),
            ('created_at', 'timestamptz'::regtype),
            ('inspector_name', 'text'::regtype),
            ('project_name', 'text'::regtype),
            ('inspection_area', 'text'::regtype),
            ('inspection_date', 'date'::regtype),
            ('inspection_item', 'text'::regtype),
            ('result', 'text'::regtype),
            ('findings', 'text'::regtype)
        ) AS expected(column_name, column_type)
        LEFT JOIN pg_catalog.pg_attribute AS actual
            ON actual.attrelid = 'public.site_inspections'::regclass
            AND actual.attname = expected.column_name
            AND actual.attnum > 0 AND NOT actual.attisdropped
        WHERE actual.atttypid IS DISTINCT FROM expected.column_type::oid
            OR actual.attgenerated <> '' OR actual.attidentity <> ''
    ) OR (
        SELECT count(*) FROM pg_catalog.pg_attribute
        WHERE attrelid = 'public.site_inspections'::regclass AND attnum > 0 AND NOT attisdropped
    ) <> 9 THEN
        RAISE EXCEPTION 'site_inspections 欄位缺漏、有額外欄位、型別不符或含產生欄位，請先檢查既有結構；未改寫資料';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_catalog.pg_constraint
        WHERE conrelid = 'public.site_inspections'::regclass AND contype = 'p'
    ) THEN
        ALTER TABLE public.site_inspections ADD PRIMARY KEY (id);
    ELSIF NOT EXISTS (
        SELECT 1 FROM pg_catalog.pg_constraint
        WHERE conrelid = 'public.site_inspections'::regclass AND contype = 'p'
            AND conkey = ARRAY[(
                SELECT attnum FROM pg_catalog.pg_attribute
                WHERE attrelid = 'public.site_inspections'::regclass AND attname = 'id'
            )]::smallint[]
    ) THEN
        RAISE EXCEPTION 'site_inspections 既有主鍵不是單一 id，請先檢查既有結構；未改寫資料';
    END IF;
END;
$structure$;

ALTER TABLE public.site_inspections
    ALTER COLUMN id SET DEFAULT gen_random_uuid(),
    ALTER COLUMN created_at SET DEFAULT now();

-- CHECK：文字長度 1～上限且不能只有空白；選項欄位只接受列出的完整值。
ALTER TABLE public.site_inspections
    DROP CONSTRAINT IF EXISTS site_inspections_inspector_name_check,
    DROP CONSTRAINT IF EXISTS site_inspections_project_name_check,
    DROP CONSTRAINT IF EXISTS site_inspections_inspection_area_check,
    DROP CONSTRAINT IF EXISTS site_inspections_findings_check,
    DROP CONSTRAINT IF EXISTS site_inspections_inspection_item_check,
    DROP CONSTRAINT IF EXISTS site_inspections_result_check;
ALTER TABLE public.site_inspections
    ADD CONSTRAINT site_inspections_inspector_name_check CHECK (
        char_length(inspector_name) BETWEEN 1 AND 100 AND inspector_name ~ '[^[:space:]]'),
    ADD CONSTRAINT site_inspections_project_name_check CHECK (
        char_length(project_name) BETWEEN 1 AND 200 AND project_name ~ '[^[:space:]]'),
    ADD CONSTRAINT site_inspections_inspection_area_check CHECK (
        char_length(inspection_area) BETWEEN 1 AND 200 AND inspection_area ~ '[^[:space:]]'),
    ADD CONSTRAINT site_inspections_findings_check CHECK (
        char_length(findings) BETWEEN 1 AND 2000 AND findings ~ '[^[:space:]]'),
    ADD CONSTRAINT site_inspections_inspection_item_check
        CHECK (inspection_item IN ('支撐架', '施工架', '開口及墜落防護', '電氣設備', '機具設備', '環境整潔', '其他')),
    ADD CONSTRAINT site_inspections_result_check
        CHECK (result IN ('合格', '需改善', '立即停工'));

-- GRANT：只開放 anon 讀取清單與新增表單欄位；id、created_at 不可由前端指定。
REVOKE ALL PRIVILEGES ON TABLE public.site_inspections FROM PUBLIC, anon, authenticated;

DO $privileges$
DECLARE
    column_names text;
BEGIN
    SELECT string_agg(format('%I', attname), ', ' ORDER BY attnum)
        INTO column_names
    FROM pg_catalog.pg_attribute
    WHERE attrelid = 'public.site_inspections'::regclass AND attnum > 0 AND NOT attisdropped;
    EXECUTE format(
        'REVOKE ALL PRIVILEGES (%s) ON TABLE public.site_inspections FROM PUBLIC, anon, authenticated',
        column_names
    );
END;
$privileges$;

GRANT USAGE ON SCHEMA public TO anon;
GRANT SELECT ON TABLE public.site_inspections TO anon;
GRANT INSERT (inspector_name, project_name, inspection_area, inspection_date,
              inspection_item, result, findings)
    ON TABLE public.site_inspections TO anon;

-- RLS：任何訪客可讀取與新增；不建立 UPDATE、DELETE 政策。
ALTER TABLE public.site_inspections ENABLE ROW LEVEL SECURITY;

DO $policies$
DECLARE
    policy_name text;
BEGIN
    FOR policy_name IN
        SELECT policyname FROM pg_catalog.pg_policies
        WHERE schemaname = 'public' AND tablename = 'site_inspections'
    LOOP
        EXECUTE format('DROP POLICY %I ON public.site_inspections', policy_name);
    END LOOP;
END;
$policies$;

CREATE POLICY site_inspections_anon_select
    ON public.site_inspections
    FOR SELECT
    TO anon
    USING (true);

-- 巡查日期須為台北時間今天或過去 30 天內，不可預填未來日期。
CREATE POLICY site_inspections_anon_insert
    ON public.site_inspections
    FOR INSERT
    TO anon
    WITH CHECK (
        inspection_date <= (now() AT TIME ZONE 'Asia/Taipei')::date
        AND inspection_date >= (now() AT TIME ZONE 'Asia/Taipei')::date - 30
    );

-- 套用注意：公開清單不應放真實姓名、電話或可辨識的工地地址；匿名新增仍須另設限流或驗證碼。
-- service_role 等具 BYPASSRLS 權限的金鑰不得放在前端。
COMMIT;

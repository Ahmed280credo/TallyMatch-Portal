-- ============================================================
-- Migration: Temporary Upload Storage & Saved Column Mappings
-- ============================================================

-- 1. Table for short-lived CSV uploads between preview and confirm
CREATE TABLE IF NOT EXISTS public.temp_csv_uploads (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id           uuid NOT NULL,
  uploaded_by      uuid,
  file_name        text NOT NULL,
  storage_path     text,
  file_content     text NOT NULL,
  detected_columns jsonb NOT NULL,
  sample_rows      jsonb NOT NULL,
  expires_at       timestamptz NOT NULL DEFAULT (now() + interval '30 minutes'),
  created_at       timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.temp_csv_uploads ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS temp_csv_uploads_org_expires_idx 
  ON public.temp_csv_uploads (org_id, expires_at);

DROP POLICY IF EXISTS "Org members can manage temp csv uploads" ON public.temp_csv_uploads;
CREATE POLICY "Org members can manage temp csv uploads"
  ON public.temp_csv_uploads FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_members
      WHERE organization_members.org_id = temp_csv_uploads.org_id
        AND organization_members.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.organization_members
      WHERE organization_members.org_id = temp_csv_uploads.org_id
        AND organization_members.user_id = auth.uid()
    )
  );

-- 2. Table for reusable saved column mappings per organization
CREATE TABLE IF NOT EXISTS public.saved_csv_mappings (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id         uuid NOT NULL,
  name           text NOT NULL,
  column_mapping jsonb NOT NULL,
  created_by     uuid,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, name)
);

ALTER TABLE public.saved_csv_mappings ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS saved_csv_mappings_org_idx 
  ON public.saved_csv_mappings (org_id);

DROP POLICY IF EXISTS "Org members can manage saved csv mappings" ON public.saved_csv_mappings;
CREATE POLICY "Org members can manage saved csv mappings"
  ON public.saved_csv_mappings FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_members
      WHERE organization_members.org_id = saved_csv_mappings.org_id
        AND organization_members.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.organization_members
      WHERE organization_members.org_id = saved_csv_mappings.org_id
        AND organization_members.user_id = auth.uid()
    )
  );

-- 3. Cleanup function for expired temporary uploads
CREATE OR REPLACE FUNCTION public.cleanup_expired_csv_uploads()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  deleted_count integer;
BEGIN
  DELETE FROM public.temp_csv_uploads
  WHERE expires_at < now();
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

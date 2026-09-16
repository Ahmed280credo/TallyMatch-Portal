-- ============================================================
-- Migration: ERP integration (SAP B1 today, generic for future ERPs)
-- Run in Supabase SQL Editor:
-- https://supabase.com/dashboard/project/tkdvpaoiidgugpvgqowe/sql/new
-- ============================================================

-- 1. Per-org ERP connection config. One active connection per org for now;
--    erp_type is the extension point for a future second ERP without a
--    schema change (a second row per org would need dropping the UNIQUE
--    constraint below and adding an is_active flag — not needed yet).
CREATE TABLE IF NOT EXISTS public.erp_connections (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  erp_type          text NOT NULL DEFAULT 'sap_b1',
  base_url          text NOT NULL,
  company_db        text,
  username          text NOT NULL,
  -- AES-256-GCM ciphertext (base64), encrypted/decrypted by the backend only
  -- (ERP_CREDENTIALS_ENCRYPTION_KEY) — never sent to or read by the frontend.
  password_encrypted text NOT NULL,
  status            text NOT NULL DEFAULT 'disconnected' CHECK (status IN ('connected', 'disconnected', 'error')),
  status_message    text,
  last_tested_at    timestamptz,
  last_sync_at      timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id)
);
ALTER TABLE public.erp_connections ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS erp_connections_org_id_idx ON public.erp_connections (org_id);

-- Backend writes with the service-role key (bypasses RLS) so credential
-- encryption stays server-side; this SELECT policy exists for parity with
-- other tables and any future direct-read use, but the frontend built today
-- goes through backend endpoints exclusively so it never has to handle the
-- encrypted password column.
DROP POLICY IF EXISTS "Org members can view erp connections" ON public.erp_connections;
CREATE POLICY "Org members can view erp connections"
  ON public.erp_connections FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_members
      WHERE organization_members.org_id = erp_connections.org_id
        AND organization_members.user_id = auth.uid()
    )
  );

-- 2. Source tracking on purchase_orders / goods_receipt_notes — manual entry,
--    CSV import, and ERP sync all write into the same tables, so 3-way
--    matching keeps working unchanged regardless of where a record came from.
ALTER TABLE public.purchase_orders ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual'
  CHECK (source IN ('manual', 'csv_import', 'erp_sync'));
ALTER TABLE public.purchase_orders ADD COLUMN IF NOT EXISTS erp_type text;
ALTER TABLE public.purchase_orders ADD COLUMN IF NOT EXISTS erp_doc_entry integer;
ALTER TABLE public.purchase_orders ADD COLUMN IF NOT EXISTS erp_doc_num integer;

ALTER TABLE public.goods_receipt_notes ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual'
  CHECK (source IN ('manual', 'csv_import', 'erp_sync'));
ALTER TABLE public.goods_receipt_notes ADD COLUMN IF NOT EXISTS erp_type text;
ALTER TABLE public.goods_receipt_notes ADD COLUMN IF NOT EXISTS erp_doc_entry integer;
ALTER TABLE public.goods_receipt_notes ADD COLUMN IF NOT EXISTS erp_doc_num integer;

-- 3. ERP push status + payment-source tracking on invoices. Deliberately
--    reuses the existing 'paid' status value rather than adding new ones to
--    invoices_status_check — payment_source is what distinguishes "Paid
--    (Manual)" (TallyMatch's own proof-of-payment flow) from "Paid (SAP B1)"
--    (picked up by polling), so no constraint churn is needed here.
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS erp_type text;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS erp_push_status text NOT NULL DEFAULT 'not_pushed'
  CHECK (erp_push_status IN ('not_pushed', 'pushed', 'failed'));
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS erp_doc_entry integer;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS erp_doc_num integer;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS erp_push_error text;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS erp_pushed_at timestamptz;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS payment_source text
  CHECK (payment_source IS NULL OR payment_source IN ('manual', 'erp_sync'));
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS erp_last_synced_at timestamptz;

NOTIFY pgrst, 'reload schema';

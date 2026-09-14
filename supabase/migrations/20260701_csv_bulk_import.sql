-- ============================================================
-- Migration: Add CSV Bulk Import Intake Support
-- ============================================================

-- 1. Ensure vendor_tax_id exists alongside vendor_ntn
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS vendor_tax_id text;

-- 2. Add intake_source column ('pdf_upload', 'csv_bulk_import', 'manual')
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS intake_source text DEFAULT 'pdf_upload';

-- 3. Ensure composite index for fast duplicate checking within org
CREATE INDEX IF NOT EXISTS invoices_org_id_invoice_number_idx
  ON public.invoices (org_id, invoice_number);

-- 4. Ensure status check includes all pipeline statuses
ALTER TABLE public.invoices DROP CONSTRAINT IF EXISTS invoices_status_check;
ALTER TABLE public.invoices ADD CONSTRAINT invoices_status_check
  CHECK (status IN (
    'queued','extracted','approved','pending_review','failed',
    'processed','flagged','paid','pending','pending_match','duplicate','mismatch'
  ));

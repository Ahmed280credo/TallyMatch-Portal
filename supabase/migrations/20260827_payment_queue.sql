-- ============================================================
-- Migration: Payment Queue module
-- Run in Supabase SQL Editor:
-- https://supabase.com/dashboard/project/tkdvpaoiidgugpvgqowe/sql/new
-- ============================================================

-- 1. Expand the invoice status pipeline with the payment-queue states
ALTER TABLE public.invoices DROP CONSTRAINT IF EXISTS invoices_status_check;
ALTER TABLE public.invoices ADD CONSTRAINT invoices_status_check
  CHECK (status IN (
    'queued','extracted','approved','pending_review','failed',
    'processed','flagged','paid','pending','pending_match','duplicate','mismatch',
    'queued_for_payment','payment_processing'
  ));

-- 2. payment_runs table
CREATE TABLE IF NOT EXISTS public.payment_runs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  created_by    uuid,
  created_at    timestamptz NOT NULL DEFAULT now(),
  total_amount  numeric(14,2) NOT NULL DEFAULT 0,
  invoice_count integer NOT NULL DEFAULT 0
);
ALTER TABLE public.payment_runs ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS payment_runs_org_id_idx ON public.payment_runs (org_id);

-- Backend writes with the service-role key (bypasses RLS); this policy only
-- covers the frontend reading payment run history directly from Supabase.
DROP POLICY IF EXISTS "Org members can view payment runs" ON public.payment_runs;
CREATE POLICY "Org members can view payment runs"
  ON public.payment_runs FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_members
      WHERE organization_members.org_id = payment_runs.org_id
        AND organization_members.user_id = auth.uid()
    )
  );

-- 3. New invoice columns for the payment lifecycle
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS payment_run_id uuid REFERENCES public.payment_runs(id) ON DELETE SET NULL;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS proof_of_payment_url text;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS transaction_reference text;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS payment_date date;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS amount_paid numeric(14,2);
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS payment_amount_mismatch boolean NOT NULL DEFAULT false;

-- Vendor bank details: not populated by AI extraction or CSV import today.
-- These columns exist so the payment-run CSV export has a place to read them
-- from once they're populated (manual edit, or a future vendor-master table).
-- They will be NULL/blank in the export until that data entry path exists.
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS vendor_bank_name text;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS vendor_account_number text;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS vendor_iban text;

CREATE INDEX IF NOT EXISTS invoices_payment_run_id_idx ON public.invoices (payment_run_id);
CREATE INDEX IF NOT EXISTS invoices_status_due_date_idx ON public.invoices (status, due_date);

-- 4. Auto-transition approved -> queued_for_payment
-- A trigger (not application code) is the only choke point common to every
-- path that can set status = 'approved': the frontend's manual "Approve
-- Override" button (writes via the browser's Supabase client) and the
-- NestJS worker's 3-way-match auto-approval (writes via the service-role
-- client). This satisfies requirement #1 without touching either of those
-- code paths.
CREATE OR REPLACE FUNCTION public.invoices_queue_for_payment()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status = 'approved' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'approved') THEN
    NEW.status := 'queued_for_payment';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_invoices_queue_for_payment ON public.invoices;
CREATE TRIGGER trg_invoices_queue_for_payment
  BEFORE INSERT OR UPDATE ON public.invoices
  FOR EACH ROW
  EXECUTE FUNCTION public.invoices_queue_for_payment();

NOTIFY pgrst, 'reload schema';

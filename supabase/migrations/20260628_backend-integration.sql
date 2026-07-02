-- ============================================================
-- Migration: Integrate NestJS AP Automation Backend
-- Run in Supabase SQL Editor:
-- https://supabase.com/dashboard/project/tkdvpaoiidgugpvgqowe/sql/new
-- ============================================================

-- 1. Relax NOT NULL on legacy columns the backend does not populate
ALTER TABLE public.invoices ALTER COLUMN user_id   DROP NOT NULL;
ALTER TABLE public.invoices ALTER COLUMN file_name DROP NOT NULL;
ALTER TABLE public.invoices ALTER COLUMN file_size DROP NOT NULL;

-- 2. Add created_at (backfill from uploaded_at for existing rows)
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS created_at timestamptz;
UPDATE public.invoices SET created_at = COALESCE(uploaded_at, now()) WHERE created_at IS NULL;
ALTER TABLE public.invoices ALTER COLUMN created_at SET DEFAULT now();
ALTER TABLE public.invoices ALTER COLUMN created_at SET NOT NULL;

-- 3. Change status default and expand the allowed values
ALTER TABLE public.invoices ALTER COLUMN status SET DEFAULT 'queued';
ALTER TABLE public.invoices DROP CONSTRAINT IF EXISTS invoices_status_check;
ALTER TABLE public.invoices ADD CONSTRAINT invoices_status_check
  CHECK (status IN (
    'queued','extracted','approved','pending_review','failed',
    'processed','flagged','paid','pending','pending_match','duplicate'
  ));

-- 4. Add all backend AP automation columns
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS vendor_name      text;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS vendor_ntn       text;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS invoice_number   text;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS po_number        text;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS grn_number       text;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS invoice_date     date;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS due_date         date;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS subtotal         numeric(14,2);
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS tax_amount       numeric(14,2);
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS total_amount     numeric(14,2);
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS currency         text;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS payment_terms    text;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS line_items       jsonb;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS fbr_status       text;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS match_status     text;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS match_result     jsonb;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS source_file_name text;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS updated_at       timestamptz DEFAULT now();

-- 5. Unique index for backend duplicate detection
CREATE UNIQUE INDEX IF NOT EXISTS invoices_org_invoice_number_unique
  ON public.invoices (org_id, invoice_number)
  WHERE invoice_number IS NOT NULL;

-- 6. Purchase Orders table (used by 3-way matching)
CREATE TABLE IF NOT EXISTS public.purchase_orders (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       uuid NOT NULL,
  po_number    text NOT NULL,
  vendor_name  text,
  total_amount numeric(14,2),
  currency     text,
  line_items   jsonb,
  created_at   timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.purchase_orders ENABLE ROW LEVEL SECURITY;
CREATE UNIQUE INDEX IF NOT EXISTS purchase_orders_org_po_number_unique
  ON public.purchase_orders (org_id, po_number);
CREATE INDEX IF NOT EXISTS purchase_orders_org_id_idx ON public.purchase_orders (org_id);

DROP POLICY IF EXISTS "Org members can view purchase orders" ON public.purchase_orders;
CREATE POLICY "Org members can view purchase orders"
  ON public.purchase_orders FOR SELECT
  USING (public.is_org_member(auth.uid(), org_id));

DROP POLICY IF EXISTS "Org members can insert purchase orders" ON public.purchase_orders;
CREATE POLICY "Org members can insert purchase orders"
  ON public.purchase_orders FOR INSERT
  WITH CHECK (public.is_org_member(auth.uid(), org_id));

-- 7. Goods Receipt Notes table (used by 3-way matching)
CREATE TABLE IF NOT EXISTS public.goods_receipt_notes (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                uuid NOT NULL,
  grn_number            text NOT NULL,
  po_number             text,
  vendor_name           text,
  total_received_amount numeric(14,2),
  line_items            jsonb,
  received_at           timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.goods_receipt_notes ENABLE ROW LEVEL SECURITY;
CREATE UNIQUE INDEX IF NOT EXISTS goods_receipt_notes_org_grn_number_unique
  ON public.goods_receipt_notes (org_id, grn_number);
CREATE INDEX IF NOT EXISTS goods_receipt_notes_org_id_idx ON public.goods_receipt_notes (org_id);

DROP POLICY IF EXISTS "Org members can view goods receipt notes" ON public.goods_receipt_notes;
CREATE POLICY "Org members can view goods receipt notes"
  ON public.goods_receipt_notes FOR SELECT
  USING (public.is_org_member(auth.uid(), org_id));

DROP POLICY IF EXISTS "Org members can insert goods receipt notes" ON public.goods_receipt_notes;
CREATE POLICY "Org members can insert goods receipt notes"
  ON public.goods_receipt_notes FOR INSERT
  WITH CHECK (public.is_org_member(auth.uid(), org_id));

-- 8. Extend invoice_audit_log with backend columns
ALTER TABLE public.invoice_audit_log ADD COLUMN IF NOT EXISTS invoice_id uuid REFERENCES public.invoices(id);
ALTER TABLE public.invoice_audit_log ADD COLUMN IF NOT EXISTS notes     text;
ALTER TABLE public.invoice_audit_log ADD COLUMN IF NOT EXISTS metadata  jsonb;

-- 9. INSERT policy for invoice_audit_log (frontend status-change writes)
DROP POLICY IF EXISTS "Org members can insert audit log" ON public.invoice_audit_log;
CREATE POLICY "Org members can insert audit log"
  ON public.invoice_audit_log FOR INSERT
  WITH CHECK (public.is_org_member(auth.uid(), org_id));
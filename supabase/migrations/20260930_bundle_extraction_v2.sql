-- ============================================================
-- Migration: Bundle extraction v2 (Phase 1 — input model + Gemini extraction)
-- Run in Supabase SQL Editor:
-- https://supabase.com/dashboard/project/tkdvpaoiidgugpvgqowe/sql/new
-- All changes here are additive and nullable (or have safe defaults) —
-- no backfill required, existing rows and the existing single-PDF /
-- CSV-import pipelines are unaffected until extraction_v2_enabled is
-- turned on for an org.
-- ============================================================

BEGIN;

-- 1. Per-org feature flag. Defaults to false so nothing changes for any
--    existing org until explicitly opted in.
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS extraction_v2_enabled boolean NOT NULL DEFAULT false;

-- 2. Bundle: one row per multi-document upload (invoice + PO copy + delivery
--    note/GRN sheet, in any order, as a single PDF). Holds page classification
--    and extraction provenance (prompt version, model, raw response) for audit,
--    plus a file-hash + prompt-version cache key: a re-upload of the exact
--    same bytes is only reused (no re-spend of Gemini calls) if extracted
--    with the SAME prompt version — bumping EXTRACTION_PROMPT_VERSION after
--    a prompt change forces re-extraction on next upload, not silent staleness.
CREATE TABLE IF NOT EXISTS public.bundles (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id              uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  source_file_name    text,
  file_hash           text NOT NULL,
  page_count          integer,
  page_classification jsonb,
  -- 'erp': org has a connected ERP, so SAP-sourced PO/GRN wins on conflict.
  -- 'paper_only': no live connector — the bundle itself is the source of truth.
  extraction_mode     text NOT NULL DEFAULT 'paper_only' CHECK (extraction_mode IN ('erp', 'paper_only')),
  prompt_version      text NOT NULL DEFAULT 'v1',
  model_name          text,
  raw_gemini_response jsonb,
  created_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, file_hash, prompt_version)
);
ALTER TABLE public.bundles ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS bundles_org_id_idx ON public.bundles (org_id);

DROP POLICY IF EXISTS "Org members can view bundles" ON public.bundles;
CREATE POLICY "Org members can view bundles"
  ON public.bundles FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_members
      WHERE organization_members.org_id = bundles.org_id
        AND organization_members.user_id = auth.uid()
    )
  );

-- 3. Invoices: link to the bundle they came from (null for single-PDF/CSV
--    invoices), the full per-field extraction audit trail, and structured
--    findings. mismatch_reasons/pending_reasons (inside the existing
--    match_result jsonb) stay populated from finding messages so the
--    frontend needs no change yet — see ThreeWayMatchingService, unchanged
--    in this phase, and the new bridging logic in BundleAssemblyService.
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS bundle_id uuid REFERENCES public.bundles(id) ON DELETE SET NULL;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS extraction_metadata jsonb;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS findings jsonb NOT NULL DEFAULT '[]'::jsonb;

-- 4. purchase_orders / goods_receipt_notes: 'bundle_extracted' is a new,
--    lowest-trust source (precedence erp_sync > manual/csv_import >
--    bundle_extracted — see bundle-precedence.ts). bundle_id/invoice_id tag
--    which upload and which specific invoice within it produced the row —
--    invoice_id is set to the first invoice in the bundle that claims this
--    PO/GRN by number, so the matcher (see three-way-matching.service.ts)
--    can require it non-null, while bundle_id is the actual scoping key that
--    lets a second invoice in the SAME bundle reuse the same evidence.
--    is_superseded is schema-only in this phase — no code sets it yet, since
--    "supersede a bundle row once ERP sync later brings the same document"
--    touches erp-connections sync, out of scope for this phase.
ALTER TABLE public.purchase_orders ADD COLUMN IF NOT EXISTS bundle_id uuid REFERENCES public.bundles(id) ON DELETE SET NULL;
ALTER TABLE public.purchase_orders ADD COLUMN IF NOT EXISTS invoice_id uuid REFERENCES public.invoices(id) ON DELETE SET NULL;
ALTER TABLE public.purchase_orders ADD COLUMN IF NOT EXISTS is_superseded boolean NOT NULL DEFAULT false;
ALTER TABLE public.purchase_orders DROP CONSTRAINT IF EXISTS purchase_orders_source_check;
ALTER TABLE public.purchase_orders ADD CONSTRAINT purchase_orders_source_check
  CHECK (source IN ('manual', 'csv_import', 'erp_sync', 'bundle_extracted'));

ALTER TABLE public.goods_receipt_notes ADD COLUMN IF NOT EXISTS bundle_id uuid REFERENCES public.bundles(id) ON DELETE SET NULL;
ALTER TABLE public.goods_receipt_notes ADD COLUMN IF NOT EXISTS invoice_id uuid REFERENCES public.invoices(id) ON DELETE SET NULL;
ALTER TABLE public.goods_receipt_notes ADD COLUMN IF NOT EXISTS is_superseded boolean NOT NULL DEFAULT false;
ALTER TABLE public.goods_receipt_notes DROP CONSTRAINT IF EXISTS goods_receipt_notes_source_check;
ALTER TABLE public.goods_receipt_notes ADD CONSTRAINT goods_receipt_notes_source_check
  CHECK (source IN ('manual', 'csv_import', 'erp_sync', 'bundle_extracted'));

-- 5. Duplicate detection was org+invoice_number only (invoices_org_invoice_number_unique),
--    which would reject two different vendors legitimately sharing an invoice
--    number (e.g. both using "INV-001"). Replace with a normalised-vendor
--    index (case/whitespace-insensitive, matching findInvoiceByNumber's own
--    normalisation) plus a fallback index for the rare case vendor_name
--    itself is null (nothing to disambiguate by, so still guard on
--    org+invoice_number alone). Both are strictly more permissive than the
--    original for any row where vendor_name is non-null and matches, so no
--    existing row can violate either.
DROP INDEX IF EXISTS public.invoices_org_invoice_number_unique;
DROP INDEX IF EXISTS public.invoices_org_vendor_invoice_number_unique;
CREATE UNIQUE INDEX IF NOT EXISTS invoices_org_vendor_invoice_number_unique
  ON public.invoices (org_id, regexp_replace(lower(btrim(vendor_name)), '\s+', ' ', 'g'), invoice_number)
  WHERE invoice_number IS NOT NULL AND vendor_name IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS invoices_org_invoice_number_no_vendor_unique
  ON public.invoices (org_id, invoice_number)
  WHERE invoice_number IS NOT NULL AND vendor_name IS NULL;

CREATE INDEX IF NOT EXISTS invoices_bundle_id_idx ON public.invoices (bundle_id);
CREATE INDEX IF NOT EXISTS purchase_orders_bundle_id_idx ON public.purchase_orders (bundle_id);
CREATE INDEX IF NOT EXISTS goods_receipt_notes_bundle_id_idx ON public.goods_receipt_notes (bundle_id);

-- 6. Per-org matching settings. Only require_erp_verification_for_approval is
--    used this phase (gates whether an all-paper-evidence match raises
--    UNVERIFIED_SOURCE as REVIEW, blocking auto-approval, or INFO). Defaults
--    to true — an org must explicitly opt OUT of requiring ERP verification.
--    The fuller tolerance columns (price/qty/header-amount tolerance, max
--    days delivery->invoice, etc.) are Phase 2's matching-engine work —
--    adding them now would be schema nobody reads yet.
CREATE TABLE IF NOT EXISTS public.org_match_settings (
  org_id                                uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  require_erp_verification_for_approval boolean NOT NULL DEFAULT true,
  created_at                            timestamptz NOT NULL DEFAULT now(),
  updated_at                            timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.org_match_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Org members can view match settings" ON public.org_match_settings;
CREATE POLICY "Org members can view match settings"
  ON public.org_match_settings FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_members
      WHERE organization_members.org_id = org_match_settings.org_id
        AND organization_members.user_id = auth.uid()
    )
  );

NOTIFY pgrst, 'reload schema';

COMMIT;

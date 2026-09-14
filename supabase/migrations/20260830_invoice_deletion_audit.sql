-- ============================================================
-- Migration: Audit log entry on invoice deletion
-- Run in Supabase SQL Editor (after 20260827_payment_queue.sql):
-- https://supabase.com/dashboard/project/tkdvpaoiidgugpvgqowe/sql/new
-- ============================================================

-- 1. invoice_audit_log.invoice_id currently has a plain FK with no ON DELETE
--    action (default RESTRICT). That means deleting any invoice that already
--    has an audit trail (APPROVED, PAID, MATCH_FAILED, etc. — i.e. almost
--    every invoice that went through extraction) would fail with a foreign
--    key violation. Switch it to SET NULL so history survives the invoice
--    being deleted, and deletes actually succeed.
ALTER TABLE public.invoice_audit_log DROP CONSTRAINT IF EXISTS invoice_audit_log_invoice_id_fkey;
ALTER TABLE public.invoice_audit_log ADD CONSTRAINT invoice_audit_log_invoice_id_fkey
  FOREIGN KEY (invoice_id) REFERENCES public.invoices(id) ON DELETE SET NULL;

-- 2. Deletion, like the approved -> queued_for_payment transition, can
--    happen from two independent code paths (frontend single-delete and
--    bulk-delete both write directly via the browser's Supabase client;
--    no NestJS delete endpoint exists). A BEFORE DELETE trigger is the only
--    choke point common to both, and to any future backend delete path.
--    SECURITY DEFINER so the insert isn't blocked by RLS regardless of
--    which client/session performed the delete.
CREATE OR REPLACE FUNCTION public.invoices_log_deletion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.invoice_audit_log (
    org_id, invoice_id, invoice_number, vendor_name, event, status, total_amount, notes, metadata
  ) VALUES (
    OLD.org_id,
    OLD.id,
    OLD.invoice_number,
    OLD.vendor_name,
    'DELETED',
    OLD.status,
    OLD.total_amount,
    'Invoice deleted by ' || COALESCE(auth.uid()::text, 'service_role/unknown'),
    jsonb_build_object(
      'deleted_by', auth.uid(),
      'deleted_at', now(),
      'status_at_deletion', OLD.status,
      'source_file_name', OLD.source_file_name
    )
  );
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_invoices_log_deletion ON public.invoices;
CREATE TRIGGER trg_invoices_log_deletion
  BEFORE DELETE ON public.invoices
  FOR EACH ROW
  EXECUTE FUNCTION public.invoices_log_deletion();

NOTIFY pgrst, 'reload schema';

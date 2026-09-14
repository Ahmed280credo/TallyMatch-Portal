-- The live database has no working DELETE policy on public.invoices (the
-- org-membership helper functions from 20260417195710_...sql, e.g.
-- is_org_member(), were never applied here — RPC calls to them 404).
-- With RLS enabled and no DELETE policy, every delete silently matches
-- zero rows: no error is returned, but nothing is actually deleted.
-- This replaces whatever delete policy exists (old user_id-based, or none)
-- with one scoped directly off organization_members, matching how the
-- working SELECT/UPDATE policies already scope access.

DROP POLICY IF EXISTS "Users can delete their own invoices" ON public.invoices;
DROP POLICY IF EXISTS "Org members can delete invoices" ON public.invoices;

CREATE POLICY "Org members can delete invoices"
  ON public.invoices FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_members
      WHERE organization_members.org_id = invoices.org_id
        AND organization_members.user_id = auth.uid()
    )
  );

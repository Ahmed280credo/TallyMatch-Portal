-- ============================================================
-- Migration: Create the "documents" storage bucket
-- Run in Supabase SQL Editor:
-- https://supabase.com/dashboard/project/tkdvpaoiidgugpvgqowe/sql/new
-- ============================================================
-- The "documents" bucket is referenced by two features but was never
-- actually created in this project (Storage → Buckets is currently empty):
--   1. Documents.tsx (PO/GRN file uploads, browser client, pre-existing)
--   2. payment-queue.service.ts (proof-of-payment uploads, NestJS
--      service-role client, added this session)
-- Feature 2 uses the service-role key so it bypasses storage RLS entirely
-- once the bucket exists. Feature 1 uploads from the browser as an
-- authenticated user, so it also needs the RLS policies below.

INSERT INTO storage.buckets (id, name, public)
VALUES ('documents', 'documents', true)
ON CONFLICT (id) DO NOTHING;

-- Paths look like "{orgId}/..." (Documents.tsx) or
-- "payment-proofs/{orgId}/..." (proof of payment) — check both slots.
DROP POLICY IF EXISTS "Org members can upload to documents bucket" ON storage.objects;
CREATE POLICY "Org members can upload to documents bucket"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'documents'
    AND EXISTS (
      SELECT 1 FROM public.organization_members
      WHERE organization_members.user_id = auth.uid()
        AND organization_members.org_id::text IN (
          (storage.foldername(name))[1],
          (storage.foldername(name))[2]
        )
    )
  );

DROP POLICY IF EXISTS "Org members can read documents bucket" ON storage.objects;
CREATE POLICY "Org members can read documents bucket"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'documents'
    AND EXISTS (
      SELECT 1 FROM public.organization_members
      WHERE organization_members.user_id = auth.uid()
        AND organization_members.org_id::text IN (
          (storage.foldername(name))[1],
          (storage.foldername(name))[2]
        )
    )
  );

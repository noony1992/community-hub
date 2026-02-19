-- Harden server asset storage policies and make path matching explicit.
-- Path format expected: {server_id}/{filename}

DROP POLICY IF EXISTS "Owners can upload server assets" ON storage.objects;
DROP POLICY IF EXISTS "Owners can update server assets" ON storage.objects;
DROP POLICY IF EXISTS "Owners can delete server assets" ON storage.objects;

CREATE POLICY "Server owners/admins can upload server assets"
ON storage.objects
FOR INSERT
WITH CHECK (
  bucket_id = 'server-assets'
  AND auth.uid() IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM public.servers s
    LEFT JOIN public.server_members sm
      ON sm.server_id = s.id
      AND sm.user_id = auth.uid()
    WHERE s.id::text = split_part(name, '/', 1)
      AND (s.owner_id = auth.uid() OR sm.role IN ('owner', 'admin'))
  )
);

CREATE POLICY "Server owners/admins can update server assets"
ON storage.objects
FOR UPDATE
USING (
  bucket_id = 'server-assets'
  AND auth.uid() IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM public.servers s
    LEFT JOIN public.server_members sm
      ON sm.server_id = s.id
      AND sm.user_id = auth.uid()
    WHERE s.id::text = split_part(name, '/', 1)
      AND (s.owner_id = auth.uid() OR sm.role IN ('owner', 'admin'))
  )
)
WITH CHECK (
  bucket_id = 'server-assets'
  AND auth.uid() IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM public.servers s
    LEFT JOIN public.server_members sm
      ON sm.server_id = s.id
      AND sm.user_id = auth.uid()
    WHERE s.id::text = split_part(name, '/', 1)
      AND (s.owner_id = auth.uid() OR sm.role IN ('owner', 'admin'))
  )
);

CREATE POLICY "Server owners/admins can delete server assets"
ON storage.objects
FOR DELETE
USING (
  bucket_id = 'server-assets'
  AND auth.uid() IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM public.servers s
    LEFT JOIN public.server_members sm
      ON sm.server_id = s.id
      AND sm.user_id = auth.uid()
    WHERE s.id::text = split_part(name, '/', 1)
      AND (s.owner_id = auth.uid() OR sm.role IN ('owner', 'admin'))
  )
);

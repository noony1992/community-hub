-- Add server image fields.
ALTER TABLE public.servers
ADD COLUMN icon_url TEXT,
ADD COLUMN banner_url TEXT;

-- Create public bucket for server assets.
INSERT INTO storage.buckets (id, name, public)
VALUES ('server-assets', 'server-assets', true);

-- Owners can upload assets only for their own server folder.
CREATE POLICY "Owners can upload server assets"
ON storage.objects
FOR INSERT
WITH CHECK (
  bucket_id = 'server-assets'
  AND EXISTS (
    SELECT 1
    FROM public.servers s
    WHERE s.id::text = (storage.foldername(name))[1]
      AND s.owner_id = auth.uid()
  )
);

-- Public read for server assets.
CREATE POLICY "Anyone can view server assets"
ON storage.objects
FOR SELECT
USING (bucket_id = 'server-assets');

-- Owners can replace/delete assets under their own server folder.
CREATE POLICY "Owners can update server assets"
ON storage.objects
FOR UPDATE
USING (
  bucket_id = 'server-assets'
  AND EXISTS (
    SELECT 1
    FROM public.servers s
    WHERE s.id::text = (storage.foldername(name))[1]
      AND s.owner_id = auth.uid()
  )
);

CREATE POLICY "Owners can delete server assets"
ON storage.objects
FOR DELETE
USING (
  bucket_id = 'server-assets'
  AND EXISTS (
    SELECT 1
    FROM public.servers s
    WHERE s.id::text = (storage.foldername(name))[1]
      AND s.owner_id = auth.uid()
  )
);

-- Allow servers to opt into discovery listings.
ALTER TABLE public.servers
ADD COLUMN is_discoverable BOOLEAN NOT NULL DEFAULT true;

CREATE INDEX idx_servers_discoverable_name
ON public.servers (is_discoverable, name);

CREATE POLICY "Authenticated users can view discoverable servers"
ON public.servers
FOR SELECT
USING (auth.uid() IS NOT NULL AND is_discoverable = true);

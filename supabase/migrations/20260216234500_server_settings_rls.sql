-- Allow server owners to manage member roles.
CREATE POLICY "Owners can update server member roles"
ON public.server_members
FOR UPDATE
USING (
  EXISTS (
    SELECT 1
    FROM public.servers s
    WHERE s.id = server_members.server_id
      AND s.owner_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.servers s
    WHERE s.id = server_members.server_id
      AND s.owner_id = auth.uid()
  )
);

-- Allow server owners to delete channels.
CREATE POLICY "Owners can delete channels"
ON public.channels
FOR DELETE
USING (
  EXISTS (
    SELECT 1
    FROM public.servers s
    WHERE s.id = channels.server_id
      AND s.owner_id = auth.uid()
  )
);

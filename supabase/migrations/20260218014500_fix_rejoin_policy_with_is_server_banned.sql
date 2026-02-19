DROP POLICY IF EXISTS "Users can join servers or owners can add when not banned" ON public.server_members;

CREATE POLICY "Users can join servers or owners can add when not banned"
ON public.server_members
FOR INSERT
WITH CHECK (
  (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1
      FROM public.servers s
      WHERE s.id = server_members.server_id
        AND s.owner_id = auth.uid()
    )
  )
  AND NOT public.is_server_banned(server_members.server_id, server_members.user_id)
);

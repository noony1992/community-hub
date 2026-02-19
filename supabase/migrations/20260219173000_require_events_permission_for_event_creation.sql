-- Restrict event creation to users with explicit events permission (or owner via has_server_permission).

DROP POLICY IF EXISTS "Members can create server events"
ON public.server_events;

CREATE POLICY "Users with events permission can create server events"
ON public.server_events
FOR INSERT
WITH CHECK (
  auth.uid() = created_by
  AND public.has_server_permission(server_id, auth.uid(), 'events')
);

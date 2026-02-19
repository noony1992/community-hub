-- Allow thread reply fanout to read subscriptions within the same server.
-- This keeps existing "own subscriptions" access and adds shared-server visibility.

CREATE POLICY "Members can view thread subscriptions in shared servers"
ON public.thread_subscriptions
FOR SELECT
USING (
  public.is_server_member(auth.uid(), server_id)
);


-- Fix appeal insertion policy for banned users.
-- Prior policy checked server_bans directly, but banned users may fail server_bans RLS
-- and get blocked from filing an appeal.

DROP POLICY IF EXISTS "Users can submit appeals for active punishments"
ON public.moderation_appeals;

CREATE POLICY "Users can submit appeals for active punishments"
ON public.moderation_appeals
FOR INSERT
WITH CHECK (
  auth.uid() = user_id
  AND (
    (
      punishment_type = 'ban'
      AND public.is_server_banned(server_id, auth.uid())
    )
    OR
    (
      punishment_type = 'timeout'
      AND EXISTS (
        SELECT 1
        FROM public.server_members sm
        WHERE sm.server_id = moderation_appeals.server_id
          AND sm.user_id = auth.uid()
          AND sm.timed_out_until IS NOT NULL
          AND sm.timed_out_until > now()
      )
    )
  )
);

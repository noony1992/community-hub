-- Server onboarding:
-- - welcome content on server
-- - explicit rules acceptance per member
-- - message gate until rules accepted

ALTER TABLE public.servers
ADD COLUMN IF NOT EXISTS onboarding_welcome_title TEXT DEFAULT 'Welcome!',
ADD COLUMN IF NOT EXISTS onboarding_welcome_message TEXT DEFAULT 'Please review and accept the server rules to continue.',
ADD COLUMN IF NOT EXISTS onboarding_rules_text TEXT DEFAULT 'Be respectful. No harassment. Follow server topic guidelines.';

CREATE TABLE IF NOT EXISTS public.server_rule_acceptances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id UUID NOT NULL REFERENCES public.servers(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  accepted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(server_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_server_rule_acceptances_server_user
ON public.server_rule_acceptances(server_id, user_id);

ALTER TABLE public.server_rule_acceptances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own rule acceptances"
ON public.server_rule_acceptances
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own rule acceptances"
ON public.server_rule_acceptances
FOR INSERT
WITH CHECK (
  auth.uid() = user_id
  AND public.is_server_member(auth.uid(), server_id)
);

-- Backfill existing members so current communities are not blocked.
INSERT INTO public.server_rule_acceptances (server_id, user_id)
SELECT sm.server_id, sm.user_id
FROM public.server_members sm
ON CONFLICT (server_id, user_id) DO NOTHING;

DROP POLICY IF EXISTS "Members can send messages when not timed out or muted or banned" ON public.messages;

CREATE POLICY "Members can send messages when not timed out or muted or banned"
ON public.messages
FOR INSERT
WITH CHECK (
  auth.uid() = user_id
  AND EXISTS (
    SELECT 1
    FROM public.channels c
    JOIN public.server_members sm
      ON sm.server_id = c.server_id
     AND sm.user_id = auth.uid()
    WHERE c.id = channel_id
      AND NOT public.is_server_banned(c.server_id, auth.uid())
      AND (sm.timed_out_until IS NULL OR sm.timed_out_until <= now())
      AND (sm.muted_until IS NULL OR sm.muted_until <= now())
      AND EXISTS (
        SELECT 1
        FROM public.server_rule_acceptances sra
        WHERE sra.server_id = c.server_id
          AND sra.user_id = auth.uid()
      )
  )
);

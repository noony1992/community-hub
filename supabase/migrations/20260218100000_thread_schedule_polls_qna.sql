-- Thread subscriptions, scheduled messages, polls, and channel Q&A mode.

CREATE TABLE IF NOT EXISTS public.thread_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  parent_message_id UUID NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  server_id UUID NOT NULL REFERENCES public.servers(id) ON DELETE CASCADE,
  channel_id UUID NOT NULL REFERENCES public.channels(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, parent_message_id)
);

CREATE TABLE IF NOT EXISTS public.scheduled_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  server_id UUID NOT NULL REFERENCES public.servers(id) ON DELETE CASCADE,
  channel_id UUID NOT NULL REFERENCES public.channels(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  reply_to UUID NULL REFERENCES public.messages(id) ON DELETE SET NULL,
  is_announcement BOOLEAN NOT NULL DEFAULT false,
  send_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'cancelled')),
  sent_message_id UUID NULL REFERENCES public.messages(id) ON DELETE SET NULL,
  failed_attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.poll_votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  option_index INTEGER NOT NULL CHECK (option_index >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(message_id, user_id, option_index)
);

CREATE TABLE IF NOT EXISTS public.channel_features (
  channel_id UUID PRIMARY KEY REFERENCES public.channels(id) ON DELETE CASCADE,
  qa_mode_enabled BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID NULL REFERENCES public.profiles(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_thread_subscriptions_parent
  ON public.thread_subscriptions(parent_message_id);
CREATE INDEX IF NOT EXISTS idx_thread_subscriptions_user_channel
  ON public.thread_subscriptions(user_id, channel_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_messages_due
  ON public.scheduled_messages(user_id, status, send_at);
CREATE INDEX IF NOT EXISTS idx_poll_votes_message
  ON public.poll_votes(message_id);

ALTER TABLE public.thread_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scheduled_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.poll_votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.channel_features ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own thread subscriptions"
ON public.thread_subscriptions
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can follow threads for themselves"
ON public.thread_subscriptions
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can unfollow threads for themselves"
ON public.thread_subscriptions
FOR DELETE
USING (auth.uid() = user_id);

CREATE POLICY "Users can manage own scheduled messages"
ON public.scheduled_messages
FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Members can view poll votes in their servers"
ON public.poll_votes
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.messages m
    JOIN public.channels c ON c.id = m.channel_id
    JOIN public.server_members sm ON sm.server_id = c.server_id
    WHERE m.id = poll_votes.message_id
      AND sm.user_id = auth.uid()
  )
);

CREATE POLICY "Members can vote in polls as themselves"
ON public.poll_votes
FOR INSERT
WITH CHECK (
  auth.uid() = user_id
  AND EXISTS (
    SELECT 1
    FROM public.messages m
    JOIN public.channels c ON c.id = m.channel_id
    JOIN public.server_members sm ON sm.server_id = c.server_id
    WHERE m.id = poll_votes.message_id
      AND sm.user_id = auth.uid()
  )
);

CREATE POLICY "Users can remove own votes"
ON public.poll_votes
FOR DELETE
USING (auth.uid() = user_id);

CREATE POLICY "Members can view channel feature flags"
ON public.channel_features
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.channels c
    JOIN public.server_members sm ON sm.server_id = c.server_id
    WHERE c.id = channel_features.channel_id
      AND sm.user_id = auth.uid()
  )
);

CREATE POLICY "Channel managers can upsert channel features"
ON public.channel_features
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.channels c
    WHERE c.id = channel_features.channel_id
      AND public.has_server_permission(c.server_id, auth.uid(), 'manage_channels')
  )
);

CREATE POLICY "Channel managers can update channel features"
ON public.channel_features
FOR UPDATE
USING (
  EXISTS (
    SELECT 1
    FROM public.channels c
    WHERE c.id = channel_features.channel_id
      AND public.has_server_permission(c.server_id, auth.uid(), 'manage_channels')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.channels c
    WHERE c.id = channel_features.channel_id
      AND public.has_server_permission(c.server_id, auth.uid(), 'manage_channels')
  )
);



-- Fix: Allow server owners to see their servers before becoming a member (fixes create flow)
DROP POLICY "Members can view their servers" ON public.servers;
CREATE POLICY "Members and owners can view servers" ON public.servers FOR SELECT
USING (is_server_member(auth.uid(), id) OR auth.uid() = owner_id);

-- Invite codes table
CREATE TABLE public.invite_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id uuid REFERENCES public.servers(id) ON DELETE CASCADE NOT NULL,
  code text UNIQUE NOT NULL DEFAULT substring(gen_random_uuid()::text, 1, 8),
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  max_uses int,
  uses int NOT NULL DEFAULT 0
);
ALTER TABLE public.invite_codes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members can view invite codes" ON public.invite_codes FOR SELECT USING (is_server_member(auth.uid(), server_id));
CREATE POLICY "Members can create invite codes" ON public.invite_codes FOR INSERT WITH CHECK (is_server_member(auth.uid(), server_id) AND auth.uid() = created_by);
CREATE POLICY "Members can update invite codes" ON public.invite_codes FOR UPDATE USING (is_server_member(auth.uid(), server_id));

-- Direct conversations
CREATE TABLE public.direct_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.direct_conversations ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.dm_participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid REFERENCES public.direct_conversations(id) ON DELETE CASCADE NOT NULL,
  user_id uuid NOT NULL,
  joined_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(conversation_id, user_id)
);
ALTER TABLE public.dm_participants ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_dm_participant(_user_id uuid, _conversation_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.dm_participants WHERE user_id = _user_id AND conversation_id = _conversation_id)
$$;

CREATE POLICY "Participants can view conversations" ON public.direct_conversations FOR SELECT USING (is_dm_participant(auth.uid(), id));
CREATE POLICY "Authenticated users can create conversations" ON public.direct_conversations FOR INSERT WITH CHECK (true);

CREATE POLICY "Participants can view participants" ON public.dm_participants FOR SELECT USING (is_dm_participant(auth.uid(), conversation_id));
CREATE POLICY "Users can add themselves as participants" ON public.dm_participants FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.direct_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid REFERENCES public.direct_conversations(id) ON DELETE CASCADE NOT NULL,
  user_id uuid NOT NULL,
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.direct_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Participants can view DMs" ON public.direct_messages FOR SELECT USING (is_dm_participant(auth.uid(), conversation_id));
CREATE POLICY "Participants can send DMs" ON public.direct_messages FOR INSERT WITH CHECK (auth.uid() = user_id AND is_dm_participant(auth.uid(), conversation_id));

-- Enable realtime for DMs
ALTER PUBLICATION supabase_realtime ADD TABLE public.direct_messages;

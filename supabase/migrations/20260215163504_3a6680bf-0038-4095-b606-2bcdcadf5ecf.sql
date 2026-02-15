
-- 1. Message pinning: add columns to messages
ALTER TABLE public.messages
ADD COLUMN pinned_at TIMESTAMP WITH TIME ZONE DEFAULT NULL,
ADD COLUMN pinned_by UUID DEFAULT NULL;

-- 2. Message threads: add reply_to column
ALTER TABLE public.messages
ADD COLUMN reply_to UUID REFERENCES public.messages(id) ON DELETE SET NULL DEFAULT NULL;

-- 3. Create index for thread lookups
CREATE INDEX idx_messages_reply_to ON public.messages(reply_to) WHERE reply_to IS NOT NULL;

-- 4. Create index for pinned messages
CREATE INDEX idx_messages_pinned ON public.messages(channel_id, pinned_at) WHERE pinned_at IS NOT NULL;

-- 5. Allow members to pin/unpin messages (update pinned_at/pinned_by)
-- The existing UPDATE policy only allows own messages, we need server members to pin any message
DROP POLICY IF EXISTS "Users can update own messages" ON public.messages;
CREATE POLICY "Users can update own messages"
ON public.messages
FOR UPDATE
USING (
  auth.uid() = user_id
  OR EXISTS (
    SELECT 1 FROM channels c
    WHERE c.id = messages.channel_id
    AND is_server_member(auth.uid(), c.server_id)
  )
)
WITH CHECK (
  auth.uid() = user_id
  OR EXISTS (
    SELECT 1 FROM channels c
    WHERE c.id = messages.channel_id
    AND is_server_member(auth.uid(), c.server_id)
  )
);

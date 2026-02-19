-- Reliable thread follower notifications via server-side fanout.
-- This avoids client-side RLS limitations when reading other subscribers.

CREATE OR REPLACE FUNCTION public.notify_thread_subscribers(
  _parent_message_id UUID,
  _reply_message_id UUID,
  _channel_id UUID,
  _server_id UUID,
  _content TEXT,
  _sender_display_name TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Caller must be a member of the server and the reply message must belong to them.
  IF NOT public.is_server_member(auth.uid(), _server_id) THEN
    RAISE EXCEPTION 'Not a server member';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.messages m
    WHERE m.id = _reply_message_id
      AND m.user_id = auth.uid()
      AND m.channel_id = _channel_id
      AND m.reply_to = _parent_message_id
  ) THEN
    RAISE EXCEPTION 'Reply message is invalid for this notification fanout';
  END IF;

  INSERT INTO public.notifications (
    user_id,
    type,
    title,
    body,
    link_channel_id,
    link_server_id,
    link_message_id
  )
  SELECT
    ts.user_id,
    'thread_reply',
    COALESCE(NULLIF(_sender_display_name, ''), 'Someone') || ' replied to a thread you follow',
    LEFT(COALESCE(_content, ''), 100),
    _channel_id,
    _server_id,
    _reply_message_id
  FROM public.thread_subscriptions ts
  WHERE ts.parent_message_id = _parent_message_id
    AND ts.user_id <> auth.uid()
    AND NOT EXISTS (
      SELECT 1
      FROM public.notifications n
      WHERE n.user_id = ts.user_id
        AND n.type = 'thread_reply'
        AND n.link_message_id = _reply_message_id
    );
END;
$$;


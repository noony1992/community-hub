CREATE OR REPLACE FUNCTION public.remove_member_on_ban()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.server_members
  WHERE server_id = NEW.server_id
    AND user_id = NEW.banned_user_id;

  UPDATE public.messages m
  SET
    content = 'User Banned',
    attachment_url = NULL,
    attachment_name = NULL,
    attachment_type = NULL,
    edited_at = now()
  WHERE m.user_id = NEW.banned_user_id
    AND EXISTS (
      SELECT 1
      FROM public.channels c
      WHERE c.id = m.channel_id
        AND c.server_id = NEW.server_id
    );

  RETURN NEW;
END;
$$;

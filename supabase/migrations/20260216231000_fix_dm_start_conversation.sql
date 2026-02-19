-- Fix DM creation under RLS by creating conversations atomically server-side.
CREATE OR REPLACE FUNCTION public.start_direct_conversation(_other_user_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _self_user_id uuid := auth.uid();
  _existing_id uuid;
  _conversation_id uuid;
BEGIN
  IF _self_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF _other_user_id IS NULL OR _other_user_id = _self_user_id THEN
    RAISE EXCEPTION 'Invalid DM target';
  END IF;

  -- Reuse existing 1:1 conversation if present.
  SELECT dp.conversation_id
  INTO _existing_id
  FROM public.dm_participants dp
  WHERE dp.user_id IN (_self_user_id, _other_user_id)
  GROUP BY dp.conversation_id
  HAVING COUNT(DISTINCT dp.user_id) = 2
  ORDER BY MIN(dp.joined_at) ASC
  LIMIT 1;

  IF _existing_id IS NOT NULL THEN
    RETURN _existing_id;
  END IF;

  INSERT INTO public.direct_conversations DEFAULT VALUES
  RETURNING id INTO _conversation_id;

  INSERT INTO public.dm_participants (conversation_id, user_id)
  VALUES
    (_conversation_id, _self_user_id),
    (_conversation_id, _other_user_id);

  RETURN _conversation_id;
END;
$$;

REVOKE ALL ON FUNCTION public.start_direct_conversation(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.start_direct_conversation(uuid) TO authenticated;

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
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_remove_member_on_ban ON public.server_bans;

CREATE TRIGGER trg_remove_member_on_ban
AFTER INSERT ON public.server_bans
FOR EACH ROW
EXECUTE FUNCTION public.remove_member_on_ban();

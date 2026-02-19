ALTER TABLE public.notifications
ADD COLUMN IF NOT EXISTS link_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_notifications_link_user_id
ON public.notifications(link_user_id);

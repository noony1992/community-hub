ALTER TABLE public.server_roles
ADD COLUMN IF NOT EXISTS icon TEXT;

ALTER TABLE public.server_roles
ADD COLUMN IF NOT EXISTS username_color TEXT;

ALTER TABLE public.server_roles
ADD COLUMN IF NOT EXISTS username_style TEXT NOT NULL DEFAULT 'normal';

ALTER TABLE public.server_roles
ADD COLUMN IF NOT EXISTS username_effect TEXT NOT NULL DEFAULT 'none';

ALTER TABLE public.server_roles
DROP CONSTRAINT IF EXISTS server_roles_username_style_check;

ALTER TABLE public.server_roles
ADD CONSTRAINT server_roles_username_style_check
CHECK (username_style IN ('normal', 'bold', 'italic', 'underline'));

ALTER TABLE public.server_roles
DROP CONSTRAINT IF EXISTS server_roles_username_effect_check;

ALTER TABLE public.server_roles
ADD CONSTRAINT server_roles_username_effect_check
CHECK (username_effect IN ('none', 'glow', 'shadow'));


ALTER TABLE public.servers
ADD COLUMN IF NOT EXISTS owner_role_color TEXT;

ALTER TABLE public.servers
ADD COLUMN IF NOT EXISTS owner_role_icon TEXT;

ALTER TABLE public.servers
ADD COLUMN IF NOT EXISTS owner_role_username_color TEXT;

ALTER TABLE public.servers
ADD COLUMN IF NOT EXISTS owner_role_username_style TEXT NOT NULL DEFAULT 'bold';

ALTER TABLE public.servers
ADD COLUMN IF NOT EXISTS owner_role_username_effect TEXT NOT NULL DEFAULT 'glow';

ALTER TABLE public.servers
DROP CONSTRAINT IF EXISTS servers_owner_role_username_style_check;

ALTER TABLE public.servers
ADD CONSTRAINT servers_owner_role_username_style_check
CHECK (owner_role_username_style IN ('normal', 'bold', 'italic', 'underline'));

ALTER TABLE public.servers
DROP CONSTRAINT IF EXISTS servers_owner_role_username_effect_check;

ALTER TABLE public.servers
ADD CONSTRAINT servers_owner_role_username_effect_check
CHECK (owner_role_username_effect IN ('none', 'glow', 'shadow'));


ALTER TABLE public.servers
ADD COLUMN IF NOT EXISTS owner_group_name TEXT NOT NULL DEFAULT 'Owner';

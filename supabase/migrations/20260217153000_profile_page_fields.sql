-- Extended profile fields for full profile page customization
ALTER TABLE public.profiles
ADD COLUMN bio TEXT,
ADD COLUMN pronouns TEXT,
ADD COLUMN location TEXT,
ADD COLUMN website TEXT,
ADD COLUMN banner_url TEXT;

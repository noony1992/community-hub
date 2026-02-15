
-- Fix: Allow any authenticated user to look up invite codes (needed for joining)
DROP POLICY IF EXISTS "Members can view invite codes" ON public.invite_codes;
CREATE POLICY "Authenticated users can view invite codes"
ON public.invite_codes
FOR SELECT
USING (true);

-- Fix: Allow any authenticated user to update uses count when joining
DROP POLICY IF EXISTS "Members can update invite codes" ON public.invite_codes;
CREATE POLICY "Authenticated users can update invite uses"
ON public.invite_codes
FOR UPDATE
USING (true)
WITH CHECK (true);

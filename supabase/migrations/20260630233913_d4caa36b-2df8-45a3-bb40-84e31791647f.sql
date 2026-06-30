-- Auto-assign customer role and create an account on signup, and backfill any existing users missing them.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  acct_num TEXT;
BEGIN
  -- profile
  INSERT INTO public.profiles(id, full_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email,'@',1)))
  ON CONFLICT (id) DO NOTHING;

  -- default role = customer (admins are seeded separately and won't hit this branch for new sign-ups)
  INSERT INTO public.user_roles(user_id, role)
  VALUES (NEW.id, 'customer')
  ON CONFLICT (user_id, role) DO NOTHING;

  -- account with a starting balance, default PIN 1234
  IF NOT EXISTS (SELECT 1 FROM public.accounts WHERE customer_id = NEW.id) THEN
    acct_num := lpad((floor(random() * 9000000000) + 1000000000)::bigint::text, 10, '0');
    INSERT INTO public.accounts(customer_id, account_number, full_name, balance, account_type, transfer_pin_hash)
    VALUES (
      NEW.id,
      acct_num,
      COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email,'@',1)),
      50000,
      'checking',
      digest('1234', 'sha256')
    );
  END IF;

  RETURN NEW;
END;
$$;

-- Make sure the trigger exists on auth.users
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'on_auth_user_created'
  ) THEN
    CREATE TRIGGER on_auth_user_created
      AFTER INSERT ON auth.users
      FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
  END IF;
END $$;

-- Backfill: any existing auth user without a profile/role/account gets them now.
INSERT INTO public.profiles(id, full_name)
SELECT u.id, COALESCE(u.raw_user_meta_data->>'full_name', split_part(u.email,'@',1))
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
WHERE p.id IS NULL;

INSERT INTO public.user_roles(user_id, role)
SELECT u.id, 'customer'::app_role
FROM auth.users u
WHERE NOT EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = u.id)
ON CONFLICT (user_id, role) DO NOTHING;

INSERT INTO public.accounts(customer_id, account_number, full_name, balance, account_type, transfer_pin_hash)
SELECT
  u.id,
  lpad((floor(random() * 9000000000) + 1000000000)::bigint::text, 10, '0'),
  COALESCE(u.raw_user_meta_data->>'full_name', split_part(u.email,'@',1)),
  50000,
  'checking',
  digest('1234', 'sha256')
FROM auth.users u
WHERE NOT EXISTS (SELECT 1 FROM public.accounts a WHERE a.customer_id = u.id)
  AND EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = u.id AND r.role = 'customer');

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  acct_num TEXT;
BEGIN
  INSERT INTO public.profiles(id, full_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email,'@',1)))
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.user_roles(user_id, role)
  VALUES (NEW.id, 'customer')
  ON CONFLICT (user_id, role) DO NOTHING;

  IF NOT EXISTS (SELECT 1 FROM public.accounts WHERE customer_id = NEW.id) THEN
    acct_num := lpad((floor(random() * 9000000000) + 1000000000)::bigint::text, 10, '0');
    INSERT INTO public.accounts(customer_id, account_number, full_name, balance, account_type, transfer_pin_hash)
    VALUES (
      NEW.id,
      acct_num,
      COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email,'@',1)),
      50000,
      'checking',
      extensions.digest('1234', 'sha256')
    );
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.verify_transfer_pin(_pin text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  acc public.accounts;
  attempts INT;
  lock_until TIMESTAMPTZ;
BEGIN
  SELECT * INTO acc FROM public.accounts WHERE customer_id = auth.uid() LIMIT 1;
  IF acc.id IS NULL THEN RAISE EXCEPTION 'No account for current user'; END IF;

  IF acc.pin_locked_until IS NOT NULL AND acc.pin_locked_until > now() THEN
    RETURN jsonb_build_object('ok', false, 'locked', true, 'until', acc.pin_locked_until);
  END IF;

  IF acc.transfer_pin_hash IS NOT NULL AND extensions.digest(_pin, 'sha256') = acc.transfer_pin_hash THEN
    UPDATE public.accounts SET failed_pin_attempts = 0, pin_locked_until = NULL WHERE id = acc.id;
    RETURN jsonb_build_object('ok', true);
  END IF;

  UPDATE public.accounts
    SET failed_pin_attempts = COALESCE(failed_pin_attempts, 0) + 1
    WHERE id = acc.id
    RETURNING failed_pin_attempts INTO attempts;

  IF attempts >= 3 THEN
    lock_until := now() + interval '2 minutes';
    UPDATE public.accounts
      SET pin_locked_until = lock_until, failed_pin_attempts = 0
      WHERE id = acc.id;
    INSERT INTO public.security_events(event_type, email, user_id, account_id, details)
      VALUES ('pin_lockout',
              (SELECT email FROM auth.users WHERE id = auth.uid()),
              auth.uid(), acc.id,
              jsonb_build_object('locked_until', lock_until, 'duration_seconds', 120));
    RETURN jsonb_build_object('ok', false, 'locked', true, 'until', lock_until, 'attempts', attempts);
  END IF;

  RETURN jsonb_build_object('ok', false, 'locked', false, 'attempts', attempts, 'remaining', 3 - attempts);
END;
$function$;
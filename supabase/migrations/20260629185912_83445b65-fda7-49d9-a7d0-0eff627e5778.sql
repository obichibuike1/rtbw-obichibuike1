
-- Ensure pgcrypto for digest()
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1. Profiles: login lockout columns
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS failed_login_attempts INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS login_locked_until TIMESTAMPTZ;

-- 2. Accounts: PIN + lockout columns
ALTER TABLE public.accounts
  ADD COLUMN IF NOT EXISTS transfer_pin_hash BYTEA,
  ADD COLUMN IF NOT EXISTS failed_pin_attempts INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pin_locked_until TIMESTAMPTZ;

-- Default PIN '1234' for accounts that don't have one
UPDATE public.accounts
SET transfer_pin_hash = digest('1234', 'sha256')
WHERE transfer_pin_hash IS NULL AND is_system = false;

-- 3. Security events table
CREATE TABLE IF NOT EXISTS public.security_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL,            -- 'login_lockout' | 'pin_lockout' | 'cap_rejection'
  email TEXT,
  user_id UUID,
  account_id UUID,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.security_events TO authenticated;
GRANT ALL ON public.security_events TO service_role;

ALTER TABLE public.security_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins read security events"
ON public.security_events FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.security_events;
ALTER TABLE public.security_events REPLICA IDENTITY FULL;

-- 4. Login lockout check (callable while signed-out)
CREATE OR REPLACE FUNCTION public.check_login_lock(_email TEXT)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid UUID;
  locked TIMESTAMPTZ;
BEGIN
  SELECT id INTO uid FROM auth.users WHERE email = _email LIMIT 1;
  IF uid IS NULL THEN RETURN jsonb_build_object('locked', false); END IF;
  SELECT login_locked_until INTO locked FROM public.profiles WHERE id = uid;
  IF locked IS NOT NULL AND locked > now() THEN
    RETURN jsonb_build_object('locked', true, 'until', locked);
  END IF;
  RETURN jsonb_build_object('locked', false);
END;
$$;

-- 5. Register failed login (callable while signed-out)
CREATE OR REPLACE FUNCTION public.register_failed_login(_email TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid UUID;
  attempts INT;
  lock_until TIMESTAMPTZ;
BEGIN
  SELECT id INTO uid FROM auth.users WHERE email = _email LIMIT 1;
  IF uid IS NULL THEN
    RETURN jsonb_build_object('attempts', 0, 'locked', false);
  END IF;

  UPDATE public.profiles
    SET failed_login_attempts = COALESCE(failed_login_attempts, 0) + 1
    WHERE id = uid
    RETURNING failed_login_attempts INTO attempts;

  IF attempts >= 3 THEN
    lock_until := now() + interval '1 minute';
    UPDATE public.profiles
      SET login_locked_until = lock_until, failed_login_attempts = 0
      WHERE id = uid;
    INSERT INTO public.security_events(event_type, email, user_id, details)
      VALUES ('login_lockout', _email, uid,
              jsonb_build_object('locked_until', lock_until, 'duration_seconds', 60));
    RETURN jsonb_build_object('attempts', attempts, 'locked', true, 'until', lock_until);
  END IF;

  RETURN jsonb_build_object('attempts', attempts, 'locked', false);
END;
$$;

-- 6. Reset failed login on success (authenticated)
CREATE OR REPLACE FUNCTION public.register_successful_login()
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.profiles
    SET failed_login_attempts = 0, login_locked_until = NULL
    WHERE id = auth.uid();
$$;

-- 7. Verify transfer PIN (authenticated)
CREATE OR REPLACE FUNCTION public.verify_transfer_pin(_pin TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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

  IF acc.transfer_pin_hash IS NOT NULL AND digest(_pin, 'sha256') = acc.transfer_pin_hash THEN
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
$$;

-- 8. Log a 90%-cap rejection (authenticated)
CREATE OR REPLACE FUNCTION public.log_cap_rejection(_attempted_amount NUMERIC, _balance NUMERIC, _cap NUMERIC, _recipient TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  acc_id UUID;
BEGIN
  SELECT id INTO acc_id FROM public.accounts WHERE customer_id = auth.uid() LIMIT 1;
  INSERT INTO public.security_events(event_type, email, user_id, account_id, details)
    VALUES ('cap_rejection',
            (SELECT email FROM auth.users WHERE id = auth.uid()),
            auth.uid(), acc_id,
            jsonb_build_object(
              'attempted_amount', _attempted_amount,
              'balance', _balance,
              'cap', _cap,
              'recipient', _recipient
            ));
END;
$$;

-- 9. Enforce 90% cap server-side in execute_transfer (defense in depth)
CREATE OR REPLACE FUNCTION public.execute_transfer(_recipient_account_number text, _amount numeric, _note text, _location text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  sender public.accounts;
  recipient public.accounts;
  fraud RECORD;
  out_tx UUID;
  in_tx UUID;
  cap NUMERIC;
BEGIN
  IF _amount <= 0 THEN RAISE EXCEPTION 'Amount must be positive'; END IF;
  SELECT * INTO sender FROM public.accounts WHERE customer_id = auth.uid() LIMIT 1;
  IF sender.id IS NULL THEN RAISE EXCEPTION 'No account for current user'; END IF;

  cap := round(sender.balance * 0.9, 2);
  IF _amount > cap THEN
    RAISE EXCEPTION 'Transfer exceeds 90%% cap of available balance (max %)', cap;
  END IF;

  SELECT * INTO recipient FROM public.accounts WHERE account_number = _recipient_account_number LIMIT 1;
  IF recipient.id IS NULL THEN RAISE EXCEPTION 'Recipient not found'; END IF;
  IF recipient.id = sender.id THEN RAISE EXCEPTION 'Cannot transfer to your own account'; END IF;
  IF sender.balance < _amount THEN RAISE EXCEPTION 'Insufficient balance'; END IF;

  SELECT * INTO fraud FROM public.evaluate_fraud(sender.id, _amount, _location);

  UPDATE public.accounts SET balance = balance - _amount WHERE id = sender.id;
  UPDATE public.accounts SET balance = balance + _amount WHERE id = recipient.id;

  INSERT INTO public.transactions(account_id, related_account_id, amount, type, status, reason_flagged, location, note, initiated_by)
    VALUES (sender.id, recipient.id, _amount, 'transfer_out', fraud.status, fraud.reason, _location, _note, 'customer')
    RETURNING id INTO out_tx;
  INSERT INTO public.transactions(account_id, related_account_id, amount, type, status, reason_flagged, location, note, initiated_by)
    VALUES (recipient.id, sender.id, _amount, 'transfer_in', fraud.status, fraud.reason, _location, _note, 'customer')
    RETURNING id INTO in_tx;

  RETURN jsonb_build_object('out_tx', out_tx, 'in_tx', in_tx, 'status', fraud.status, 'reason', fraud.reason);
END;
$function$;

-- 10. Permissions: lock down + allow what's needed
REVOKE EXECUTE ON FUNCTION public.check_login_lock(TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.register_failed_login(TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.register_successful_login() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.verify_transfer_pin(TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.log_cap_rejection(NUMERIC, NUMERIC, NUMERIC, TEXT) FROM PUBLIC;

-- Anon must be able to check/register login lockouts (pre-auth)
GRANT EXECUTE ON FUNCTION public.check_login_lock(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.register_failed_login(TEXT) TO anon, authenticated;

-- Authenticated-only
GRANT EXECUTE ON FUNCTION public.register_successful_login() TO authenticated;
GRANT EXECUTE ON FUNCTION public.verify_transfer_pin(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.log_cap_rejection(NUMERIC, NUMERIC, NUMERIC, TEXT) TO authenticated;

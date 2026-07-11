
CREATE OR REPLACE FUNCTION public.change_transfer_pin(_old_pin text, _new_pin text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  acc public.accounts;
BEGIN
  IF _new_pin IS NULL OR length(trim(_new_pin)) < 4 OR length(trim(_new_pin)) > 12 THEN
    RAISE EXCEPTION 'New PIN must be 4 to 12 characters';
  END IF;
  IF _new_pin !~ '^[0-9]+$' THEN
    RAISE EXCEPTION 'New PIN must be digits only';
  END IF;

  SELECT * INTO acc FROM public.accounts WHERE customer_id = auth.uid() LIMIT 1;
  IF acc.id IS NULL THEN RAISE EXCEPTION 'No account for current user'; END IF;

  IF acc.pin_locked_until IS NOT NULL AND acc.pin_locked_until > now() THEN
    RETURN jsonb_build_object('ok', false, 'locked', true, 'until', acc.pin_locked_until);
  END IF;

  IF acc.transfer_pin_hash IS NULL OR extensions.digest(_old_pin, 'sha256') <> acc.transfer_pin_hash THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'Current PIN is incorrect');
  END IF;

  UPDATE public.accounts
    SET transfer_pin_hash = extensions.digest(_new_pin, 'sha256'),
        failed_pin_attempts = 0,
        pin_locked_until = NULL
    WHERE id = acc.id;

  INSERT INTO public.security_events(event_type, email, user_id, account_id, details)
  VALUES ('transfer_pin_changed',
          (SELECT email FROM auth.users WHERE id = auth.uid()),
          auth.uid(), acc.id, '{}'::jsonb);

  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.change_transfer_pin(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.change_transfer_pin(text, text) TO authenticated;

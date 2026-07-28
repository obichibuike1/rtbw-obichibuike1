-- Make flagged transfers actually block the transfer instead of just marking the rows.
-- When evaluate_fraud() returns 'flagged' (or duplicate is confirmed), the transfer
-- is now rejected with an error and no balances are changed.

CREATE OR REPLACE FUNCTION public.execute_transfer(_recipient_account_number text, _amount numeric, _note text, _location text, _confirm_duplicate boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  sender public.accounts;
  recipient public.accounts;
  fraud RECORD;
  out_tx UUID;
  in_tx UUID;
  cap NUMERIC;
  dup_exists BOOLEAN := false;
  dup_seconds INT := 0;
  cap_rule_on BOOLEAN;
  dup_rule_on BOOLEAN;
BEGIN
  IF _amount <= 0 THEN RAISE EXCEPTION 'Amount must be positive'; END IF;
  SELECT * INTO sender FROM public.accounts WHERE customer_id = auth.uid() LIMIT 1;
  IF sender.id IS NULL THEN RAISE EXCEPTION 'No account for current user'; END IF;

  cap_rule_on := public.is_rule_on('rule.cap_90', true);
  dup_rule_on := public.is_rule_on('rule.duplicate_transfer', true);

  cap := round(sender.balance * 0.9, 2);
  IF cap_rule_on AND _amount > cap THEN
    RAISE EXCEPTION 'Transfer exceeds 90%% cap of available balance (max %)', cap;
  END IF;

  SELECT * INTO recipient FROM public.accounts WHERE account_number = _recipient_account_number LIMIT 1;
  IF recipient.id IS NULL THEN RAISE EXCEPTION 'Recipient not found'; END IF;
  IF recipient.id = sender.id THEN RAISE EXCEPTION 'Cannot transfer to your own account'; END IF;
  IF sender.balance < _amount THEN RAISE EXCEPTION 'Insufficient balance'; END IF;

  IF dup_rule_on THEN
    SELECT true, EXTRACT(EPOCH FROM (now() - t.timestamp))::int
      INTO dup_exists, dup_seconds
    FROM public.transactions t
    WHERE t.account_id = sender.id
      AND t.related_account_id = recipient.id
      AND t.type = 'transfer_out'
      AND t.amount = _amount
      AND t.timestamp > now() - interval '2 minutes'
    ORDER BY t.timestamp DESC LIMIT 1;

    IF dup_exists AND NOT _confirm_duplicate THEN
      RAISE EXCEPTION 'DUPLICATE_DETECTED:%', dup_seconds;
    END IF;
  END IF;

  -- Evaluate fraud BEFORE any balance changes
  SELECT * INTO fraud FROM public.evaluate_fraud(sender.id, _amount, _location);

  -- BLOCK the transfer if flagged, log the attempt
  IF fraud.status = 'flagged' THEN
    INSERT INTO public.security_events(event_type, email, user_id, account_id, details)
    VALUES ('fraud_blocked',
            (SELECT email FROM auth.users WHERE id = auth.uid()),
            auth.uid(),
            sender.id,
            jsonb_build_object(
              'amount', _amount,
              'recipient_account', recipient.account_number,
              'recipient_name', recipient.full_name,
              'reason', fraud.reason,
              'location', _location
            ));
    RAISE EXCEPTION 'Transfer blocked: %', fraud.reason;
  END IF;

  -- Also block confirmed duplicate transfers (forced flagged)
  IF dup_exists AND _confirm_duplicate THEN
    INSERT INTO public.security_events(event_type, email, user_id, account_id, details)
    VALUES ('duplicate_blocked',
            (SELECT email FROM auth.users WHERE id = auth.uid()),
            auth.uid(),
            sender.id,
            jsonb_build_object(
              'resolution', 'confirmed',
              'amount', _amount,
              'recipient_account', recipient.account_number,
              'recipient_name', recipient.full_name,
              'sender_account', sender.account_number,
              'seconds_ago', dup_seconds
            ));
    RAISE EXCEPTION 'Transfer blocked: Duplicate transfer — same amount to same recipient within 2 minutes';
  END IF;

  -- Fraud check passed — proceed with transfer
  UPDATE public.accounts SET balance = balance - _amount WHERE id = sender.id;
  UPDATE public.accounts SET balance = balance + _amount WHERE id = recipient.id;

  INSERT INTO public.transactions(account_id, related_account_id, amount, type, status, reason_flagged, location, note, initiated_by, duplicate_confirmed)
    VALUES (sender.id, recipient.id, _amount, 'transfer_out', 'normal', NULL, _location, _note, 'customer', false)
    RETURNING id INTO out_tx;
  INSERT INTO public.transactions(account_id, related_account_id, amount, type, status, reason_flagged, location, note, initiated_by, duplicate_confirmed)
    VALUES (recipient.id, sender.id, _amount, 'transfer_in', 'normal', NULL, _location, _note, 'customer', false)
    RETURNING id INTO in_tx;

  RETURN jsonb_build_object('out_tx', out_tx, 'in_tx', in_tx, 'status', 'normal', 'reason', NULL, 'duplicate_confirmed', false);
END;
$$;


-- ENUMS
CREATE TYPE public.app_role AS ENUM ('admin','customer');
CREATE TYPE public.tx_type AS ENUM ('deposit','withdrawal','transfer_out','transfer_in');
CREATE TYPE public.tx_status AS ENUM ('normal','flagged');
CREATE TYPE public.tx_initiator AS ENUM ('system','customer');

-- PROFILES
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles self read" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "profiles self update" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);

-- USER ROLES
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  UNIQUE(user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users read own roles" ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid());

-- has_role function
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

-- get_my_role helper (returns highest privilege)
CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS public.app_role LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT role FROM public.user_roles WHERE user_id = auth.uid()
  ORDER BY CASE role WHEN 'admin' THEN 0 ELSE 1 END LIMIT 1
$$;

-- ACCOUNTS
CREATE TABLE public.accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  account_number TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  balance NUMERIC(14,2) NOT NULL DEFAULT 0,
  account_type TEXT NOT NULL DEFAULT 'checking',
  is_system BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.accounts TO authenticated;
GRANT ALL ON public.accounts TO service_role;
ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "customer reads own account" ON public.accounts FOR SELECT TO authenticated
  USING (customer_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
-- allow recipient lookup by account number for any authenticated user (returns minimal cols via app code)
CREATE POLICY "auth read all accounts" ON public.accounts FOR SELECT TO authenticated USING (true);
DROP POLICY "customer reads own account" ON public.accounts;

-- TRANSACTIONS
CREATE TABLE public.transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  related_account_id UUID REFERENCES public.accounts(id) ON DELETE SET NULL,
  amount NUMERIC(14,2) NOT NULL,
  type public.tx_type NOT NULL,
  status public.tx_status NOT NULL DEFAULT 'normal',
  reason_flagged TEXT,
  location TEXT,
  note TEXT,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT now(),
  initiated_by public.tx_initiator NOT NULL DEFAULT 'system'
);
CREATE INDEX idx_tx_account_time ON public.transactions(account_id, timestamp DESC);
CREATE INDEX idx_tx_time ON public.transactions(timestamp DESC);
CREATE INDEX idx_tx_status ON public.transactions(status);
GRANT SELECT ON public.transactions TO authenticated;
GRANT ALL ON public.transactions TO service_role;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tx read own or related or admin" ON public.transactions FOR SELECT TO authenticated USING (
  public.has_role(auth.uid(), 'admin')
  OR EXISTS (SELECT 1 FROM public.accounts a WHERE a.id = account_id AND a.customer_id = auth.uid())
  OR EXISTS (SELECT 1 FROM public.accounts a WHERE a.id = related_account_id AND a.customer_id = auth.uid())
);

-- Fraud rule helper: returns (status, reason)
CREATE OR REPLACE FUNCTION public.evaluate_fraud(_account_id UUID, _amount NUMERIC, _location TEXT)
RETURNS TABLE(status public.tx_status, reason TEXT)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  recent_count INT;
  known_locations INT;
BEGIN
  IF _amount > 10000 THEN
    RETURN QUERY SELECT 'flagged'::public.tx_status, 'Amount exceeds $10,000 threshold'; RETURN;
  END IF;
  SELECT COUNT(*) INTO recent_count FROM public.transactions
    WHERE account_id = _account_id AND timestamp > now() - interval '60 seconds';
  IF recent_count >= 3 THEN
    RETURN QUERY SELECT 'flagged'::public.tx_status, 'Rapid repeated transactions (>=3 in 60s)'; RETURN;
  END IF;
  IF _location IS NOT NULL THEN
    SELECT COUNT(*) INTO known_locations FROM public.transactions
      WHERE account_id = _account_id AND location = _location;
    IF known_locations = 0 THEN
      -- only flag if account has some history
      IF EXISTS (SELECT 1 FROM public.transactions WHERE account_id = _account_id LIMIT 1) THEN
        RETURN QUERY SELECT 'flagged'::public.tx_status, 'Unusual location: ' || _location; RETURN;
      END IF;
    END IF;
  END IF;
  RETURN QUERY SELECT 'normal'::public.tx_status, NULL::TEXT;
END;
$$;

-- Atomic transfer RPC: caller's auth.uid() must own the sender account
CREATE OR REPLACE FUNCTION public.execute_transfer(
  _recipient_account_number TEXT,
  _amount NUMERIC,
  _note TEXT,
  _location TEXT
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  sender public.accounts;
  recipient public.accounts;
  fraud RECORD;
  out_tx UUID;
  in_tx UUID;
BEGIN
  IF _amount <= 0 THEN RAISE EXCEPTION 'Amount must be positive'; END IF;
  SELECT * INTO sender FROM public.accounts WHERE customer_id = auth.uid() LIMIT 1;
  IF sender.id IS NULL THEN RAISE EXCEPTION 'No account for current user'; END IF;
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
$$;
GRANT EXECUTE ON FUNCTION public.execute_transfer(TEXT, NUMERIC, TEXT, TEXT) TO authenticated;

-- Simulator tick: callable by service role (from server fn). Picks random accounts and inserts a tx.
CREATE OR REPLACE FUNCTION public.simulate_tick()
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  acc public.accounts;
  other public.accounts;
  amt NUMERIC;
  locs TEXT[] := ARRAY['New York','London','Tokyo','Paris','Sydney','Lagos','Dubai','Berlin','Singapore','Toronto'];
  loc TEXT;
  kind public.tx_type;
  fraud RECORD;
  tx_id UUID;
BEGIN
  SELECT * INTO acc FROM public.accounts WHERE is_system = false ORDER BY random() LIMIT 1;
  IF acc.id IS NULL THEN RETURN jsonb_build_object('skipped', true); END IF;

  -- 50% deposit, 30% withdrawal, 20% transfer
  CASE
    WHEN random() < 0.5 THEN kind := 'deposit';
    WHEN random() < 0.8 THEN kind := 'withdrawal';
    ELSE kind := 'transfer_out';
  END CASE;

  -- bias: 8% chance of suspiciously large amount to trigger fraud
  IF random() < 0.08 THEN amt := round((10500 + random()*5000)::numeric, 2);
  ELSE amt := round((10 + random()*900)::numeric, 2);
  END IF;

  loc := locs[1 + floor(random()*array_length(locs,1))::int];

  IF kind = 'withdrawal' AND acc.balance < amt THEN kind := 'deposit'; END IF;

  IF kind = 'transfer_out' THEN
    SELECT * INTO other FROM public.accounts WHERE id <> acc.id AND is_system = false ORDER BY random() LIMIT 1;
    IF other.id IS NULL OR acc.balance < amt THEN kind := 'deposit'; END IF;
  END IF;

  SELECT * INTO fraud FROM public.evaluate_fraud(acc.id, amt, loc);

  IF kind = 'deposit' THEN
    UPDATE public.accounts SET balance = balance + amt WHERE id = acc.id;
    INSERT INTO public.transactions(account_id, amount, type, status, reason_flagged, location, initiated_by)
      VALUES (acc.id, amt, 'deposit', fraud.status, fraud.reason, loc, 'system') RETURNING id INTO tx_id;
  ELSIF kind = 'withdrawal' THEN
    UPDATE public.accounts SET balance = balance - amt WHERE id = acc.id;
    INSERT INTO public.transactions(account_id, amount, type, status, reason_flagged, location, initiated_by)
      VALUES (acc.id, amt, 'withdrawal', fraud.status, fraud.reason, loc, 'system') RETURNING id INTO tx_id;
  ELSE
    UPDATE public.accounts SET balance = balance - amt WHERE id = acc.id;
    UPDATE public.accounts SET balance = balance + amt WHERE id = other.id;
    INSERT INTO public.transactions(account_id, related_account_id, amount, type, status, reason_flagged, location, initiated_by)
      VALUES (acc.id, other.id, amt, 'transfer_out', fraud.status, fraud.reason, loc, 'system') RETURNING id INTO tx_id;
    INSERT INTO public.transactions(account_id, related_account_id, amount, type, status, reason_flagged, location, initiated_by)
      VALUES (other.id, acc.id, amt, 'transfer_in', fraud.status, fraud.reason, loc, 'system');
  END IF;

  RETURN jsonb_build_object('tx', tx_id, 'type', kind, 'amount', amt, 'status', fraud.status);
END;
$$;

-- Realtime
ALTER TABLE public.accounts REPLICA IDENTITY FULL;
ALTER TABLE public.transactions REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.accounts;
ALTER PUBLICATION supabase_realtime ADD TABLE public.transactions;

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles(id, full_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email,'@',1)))
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

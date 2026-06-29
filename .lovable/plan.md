
# Real-Time Banking Transaction Monitoring System

A dual-dashboard app: an Admin ops console for monitoring all bank activity and a Customer mobile banking app, both updating live via Lovable Cloud Realtime.

## Stack & Backend

- TanStack Start + Tailwind + shadcn (existing scaffold)
- Lovable Cloud (Supabase) for Auth, Postgres, Realtime, and a scheduled simulator
- Recharts for charts, sonner for toasts, Motion for slide-in animations

## Database Schema (migration)

- `app_role` enum: `admin`, `customer`
- `profiles`: `id` (FK auth.users), `full_name`, `created_at`
- `user_roles`: `id`, `user_id`, `role` — roles live in a separate table; `has_role()` security-definer function for RLS
- `accounts`: `id`, `customer_id` (FK auth.users, nullable for system accounts), `account_number` (unique), `full_name`, `balance` numeric, `account_type`, `created_at`
- `transactions`: `id`, `account_id`, `related_account_id` nullable, `amount`, `type` (deposit/withdrawal/transfer_out/transfer_in), `status` (normal/flagged), `reason_flagged`, `location`, `timestamp`, `initiated_by` (system/customer)
- Realtime enabled on `accounts` and `transactions` (REPLICA IDENTITY FULL + publication)
- GRANTs to `authenticated` and `service_role`; RLS policies:
  - customers SELECT only their own account/transactions; admins SELECT all
  - no client INSERT/UPDATE on balances or transactions — all writes go through server functions

## Auth & Routing

- Email/password Supabase auth (no profile-data prompts — spec defines it)
- `/auth` public sign-in/sign-up page
- `_authenticated/` integration-managed gate
- Post-login redirect helper checks `has_role` and sends admin → `/admin/dashboard`, customer → `/app/dashboard`
- `_authenticated/admin/` layout: `beforeLoad` checks admin role, else redirect to `/app/dashboard`
- `_authenticated/app/` layout: customer-only, redirect admins to `/admin/dashboard`

## Seed Data (migration)

- 1 admin user + 5 customer users via `auth.admin.createUser` style seed (or pre-created via SQL with hashed passwords) — accounts each with starting balance, plus 1 "system" account for simulator deposits/withdrawals
- Credentials listed in a `DEMO_CREDENTIALS.md` for the user

## Server Functions (`src/lib/*.functions.ts`)

- `transfer.functions.ts` — `sendTransfer({ recipientAccountNumber, amount, note })`: auth-gated; validates balance, runs fraud rules, inserts paired transfer_in/transfer_out rows + updates both balances atomically via a Postgres RPC (`public.execute_transfer`)
- `lookupRecipient.functions.ts` — find account by number, returns name only
- `simulator.functions.ts` — `tickSimulator()`: inserts one random transaction (deposit/withdrawal/transfer between random accounts), runs fraud rules

## Fraud Rules (Postgres function + applied in server fns)

- amount > 10,000
- ≥3 transactions from same account in last 60s
- location outside account's prior-location set (tracked from last N transactions)
- Sets `status='flagged'` and `reason_flagged` on insert

## Simulator

- Client-side interval is unreliable; use a lightweight in-app trigger:
  - A `useSimulator` hook on Admin dashboard fires `tickSimulator` every 2–5s while admin is viewing (good enough for a demo and visible live)
  - Plus an optional pg_cron entry calling the server function URL for true background activity

## Admin Dashboard (`/admin/*`, desktop, dark fintech theme)

Layout: shadcn Sidebar (Live Monitor, Fraud, Accounts, Analytics) + topbar
1. **Live Monitoring** — stat cards (today count, volume, flagged count, avg value), realtime feed with Customer/Simulated badges, live area chart of per-minute volume
2. **Fraud Detection** — flagged-only feed with red highlight + reason, sonner toast on new flag via Realtime subscription
3. **Accounts** — table with live balances, drill-in to account history
4. **Analytics** — bar chart (volume by hour), pie (type breakdown), line (flagged vs normal ratio)

## Customer Dashboard (`/app/*`, mobile-first, light theme, bottom nav)

Bottom tabs: Home, Transactions, Alerts, Profile (Send Money launched from Home)
1. **Home** — big balance card (live), recent tx list with Motion slide-in, Send Money / Statement quick actions
2. **Send Money** — recipient lookup, amount, note, balance validation, confirm screen, receipt summary
3. **Transactions** — full history with type + date filters
4. **Alerts** — flagged-own-transactions feed via Realtime, with toast on arrival
5. **Profile** — account number, type, name, sign out

## Design Tokens

- Two theme scopes via CSS variables: `.admin-theme` (dark navy `#0B1220`, teal accent `#14B8A6`, data-dense) and `.customer-theme` (light `#F8FAFC`, friendly blue accent `#2563EB`, rounded cards)
- All colors as semantic tokens in `src/styles.css`; no hardcoded utilities in components

## Realtime Wiring

- Single helper `useRealtimeTable(table, filter)` returning live rows
- Admin feed: subscribe to all `transactions` inserts
- Customer feed: filter by `account_id=eq.<theirAccountId>` OR `related_account_id=eq.<theirAccountId>`
- Balance card subscribes to `accounts` updates for their row
- Slide-in animation on newly-arrived rows; sonner toast on flagged inserts

## Build Order

1. Enable Lovable Cloud, write schema migration + RLS + seed
2. Auth pages + role-based routing + protected layouts
3. Transfer + simulator server functions and `execute_transfer` RPC
4. Admin Live Monitoring (feed + stats + chart) with Realtime
5. Customer Home (balance + recent tx) with Realtime
6. Customer Send Money flow end-to-end
7. Remaining admin pages (Fraud, Accounts, Analytics)
8. Remaining customer pages (Transactions, Alerts, Profile)
9. Polish: animations, toasts, demo credentials doc

## Notes / Open Choices (will default unless told otherwise)

- Seed customer passwords default to `Customer123!` and admin `Admin123!`
- Simulator runs while admin dashboard is open (simpler than pg_cron setup); can add pg_cron later
- "Location" is randomly chosen from a fixed city list per transaction for fraud-rule demo purposes

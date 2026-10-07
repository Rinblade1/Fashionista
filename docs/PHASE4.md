# Phase 4: AI stylist, setup

The stylist runs as a Supabase Edge Function (`supabase/functions/stylist`). The Anthropic key lives only in Supabase secrets; it is never sent to the browser or added to Vercel.

1. **Apply the migration** `supabase/migrations/20261007000000_stylist_usage_and_stores_seed.sql` (`supabase db push`, or paste it into the SQL editor). It adds the `ai_requests` usage log and seeds 15 starter stores.
2. **Set the secrets** (replace the placeholder with your own key; do not paste real keys into chats or commits):
   ```
   supabase secrets set ANTHROPIC_API_KEY=your-key-here
   supabase secrets set ANTHROPIC_MODEL=claude-sonnet-5-5   # optional; this is the default
   ```
3. **Deploy the function:** `supabase functions deploy stylist`
4. **Vercel:** no new environment variables. The app keeps using `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.

## Before launch

- The seeded stores have no `returns_note`, `shipping_note`, `ships_to`, `trust_score` or `verified_at`. Check each store's current terms, fill these in, and set `verified_at`. The stylist tells users when this information is missing.
- Each user is limited to 20 stylist requests per hour (`HOURLY_LIMIT` in `supabase/functions/stylist/logic.ts`).
- Body measurements are sent to the AI service only for requests that need them (Fit advice). Say so in your privacy policy.

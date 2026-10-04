# Supabase connection

Set `SUPABASE_URL=https://api.aka.page` and server-only `SUPABASE_SERVICE_ROLE_KEY` on the `daiso-mcp` Worker. Supabase stores developer feedback in `public.agent_requests`; retail search uses separate provider APIs. `/health` reports whether bindings exist, not whether a database insert succeeds. Verify one isolated feedback insert and delete that test record during rollout.

## Backend contract

The canonical endpoint is `https://api.aka.page`. The self-hosted deployment uses Cloudflare Tunnel; PostgreSQL is not a public client endpoint. `https://apis.aka.page` is the verification alias. Production moved to the local deployment on 2026-10-04. API/Auth/RLS/Storage were verified at the canonical URL. The original managed project and data remain available through its project URL; its custom domain was detached to release Cloudflare routing. Restoring that custom domain requires re-verification.

The OAuth provider callback remains `https://api.aka.page/auth/v1/callback`. Public anon/publishable keys identify the project; user access still requires a user session and the existing RLS policies. Never ship service-role/secret keys to browsers or mobile apps.

## Operations

The Mac must be unlocked after reboot, logged in, awake and online. Mac sleep or an Internet outage interrupts the database-backed features. Automatic backups are disabled by the owner; export to external storage manually before maintenance. Keep managed Supabase available during the rollback window. After local writes begin, switching DNS back without reconciling those writes can lose data.

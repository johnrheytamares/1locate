# 1Locate Admin

Web admin for 1Locate campus content (Phase 4B). It manages buildings, floors, rooms and offices,
their photos, destination links, and Admin/Editor roles. It uses the same Supabase project, tables,
RLS policies, and Storage buckets as the mobile app (the repository root). No extra tables or migrations
are needed.

The browser only ever holds the public anon/publishable key. Every permission is enforced by
Supabase RLS and Storage policies; the route guards in this app only decide what to show.

## Requirements

- Node.js 22.9 or newer (`--env-file-if-exists` is used by `npm run live-check`)
- The Phase 4A migrations applied to the Supabase project (`../supabase/migrations`)

## Setup and run

```powershell
cd admin
npm install
Copy-Item .env.example .env   # then fill in the two values
npm run dev                   # http://localhost:5174
```

`.env` needs:

| Variable | Value |
| --- | --- |
| `VITE_SUPABASE_URL` | Project URL (Dashboard → Project Settings → API) |
| `VITE_SUPABASE_ANON_KEY` | The anon / publishable key |

Never put the service-role or `sb_secret_` key here. Everything prefixed with `VITE_` ends up in
the browser bundle. If the app detects a privileged key, it shows a setup message and does not connect.

Other scripts:

| Command | What it does |
| --- | --- |
| `npm test` | Unit and component tests (Vitest) |
| `npm run lint` | ESLint |
| `npm run typecheck` | `vue-tsc` type check |
| `npm run build` | Type check and production build into `dist/` |
| `npm run live-check` | Access checks against the real Supabase project (see below) |

## Initial Admin setup

There is no sign-up page. Accounts are created in the Supabase Dashboard.

1. Authentication → Sign In / Providers: turn off **Allow new users to sign up**.
2. Authentication → Users → **Add user**: create the Admin account with a strong password.
3. SQL Editor (runs as the database owner, so RLS does not block it):

   ```sql
   insert into public.user_roles (user_id, role)
   select id, 'admin' from auth.users where email = 'admin-email@example.com';
   ```

4. Check that exactly one row exists: `select user_id, role from public.user_roles;`
5. Sign in at http://localhost:5174 with that account.

### Adding Editors or more Admins

1. Create the account in Authentication → Users → Add user.
2. Copy its **User UID** from the same page.
3. In the admin app, open **Role Management** (Admins only), paste the UID, pick a role, and grant.

The app never lists `auth.users`; it only accepts a UID you copy from the Dashboard. Nobody can
grant, change, or remove their own role, so nobody can make themselves Admin.

## Roles

| | Signed in, no role | Editor | Admin |
| --- | --- | --- | --- |
| Content pages (buildings, floors, rooms, photos, destination links) | Access denied | Yes | Yes |
| Role Management | No | No | Yes, for other users only |

A user's role is re-read from `user_roles` at most once a minute while they navigate, so a removed
role takes effect on the next page change. Signing out, or losing the session, clears all loaded data.

## Content rules

- **Unpublished by default.** New buildings and rooms are hidden from the mobile app until published.
  Floors have no publish switch; they follow their building.
- **Entrance coordinates:** fill in both latitude and longitude from an actual survey, or leave both
  empty. Never enter guessed values. Arrival radius must be greater than 0 and at most 100 m.
- **Deleting:** buildings with floors, rooms, or photos, floors with rooms or floor maps, and rooms with
  photos cannot be deleted. The app checks first and tells you what is still linked. Deleting a room
  unlinks its destination, which keeps its fixed route.
- **Photos** (building and room only): JPEG, PNG, or WebP, at most 5 MB. The file content must match its
  type. Files are stored privately as `<parent id>/<random id>.<ext>` and shown through signed URLs that
  expire after one hour and are renewed automatically. If the database record fails after an upload,
  the file is removed again; if that cleanup or a later file delete fails, the app shows the leftover
  storage path.
- **Destination links:** a destination keeps its existing fixed indoor route and can be linked to one
  room (one destination per room). New rooms without a destination show
  "Not yet available for navigation". Routes are not created here.

## Live access checks

`npm run live-check` runs against the real project. Without test accounts it only runs the anonymous
checks. To include Editor and Admin checks, create `.env.test.local` (gitignored, never `VITE_`):

```
EDITOR_TEST_EMAIL=
EDITOR_TEST_PASSWORD=
ADMIN_TEST_EMAIL=
ADMIN_TEST_PASSWORD=
```

Use dedicated test accounts. The editor test account must have the `editor` role and the admin test
account the `admin` role.

What it does:

- **Anon:** sees only published buildings and rooms, can read `navigation_catalog`, cannot read
  `user_roles`, cannot create buildings or upload photos.
- **Editor:** creates an unpublished `ZZTEST-xxxxxx` building, floor, and room; checks that anon cannot see
  them; checks duplicate-code, coordinate-pair, and blocked-delete errors; uploads a 1×1 PNG and records
  it; checks the signed URL; checks that the bucket rejects a non-image type, a file over 5 MB, and an
  upload under a missing room; checks it cannot grant or change its own role.
- **Admin:** lists roles; cannot grant, change, or remove its own role; granting to an unknown UID fails;
  re-saves the editor test account's existing role (same value) to confirm Admins can update others.

Only records created during the run are removed afterwards, by ID. If cleanup fails, the leftovers are
named `ZZTEST ...` and the output says which table they are in. Only error codes and counts are printed.

## Out of scope (later phases)

Map editor and floor-map upload (Phase 4C), satellite map, path graph and A* routing, voice guidance,
and AR changes.

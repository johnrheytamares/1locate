# 1Locate Phase 4A: Campus Database and Confirm Destination

Phase 4A prepares the Supabase database for the future Admin Module and adds a Confirm Destination
screen to the mobile app. There is no Admin UI in this phase. The Admin Module will be a separate
web app that uses the same Supabase project.

Nothing here invents campus data. Coordinates, room details, photos, and floor maps stay empty
(NULL) until an Admin or Editor enters verified information.

## Architecture

```
Mobile app (anon key, no login)
  DestinationPickerPage ──Select──▶ ConfirmDestinationPage ──Start Navigation──▶ ARNavigationPage
          │                                  │
          └──── useDestinationCatalog ───────┘   (shared catalog + data-source label)
                      │
                      ▼
           destination-repository.ts
             1. navigation_catalog view      → "Live campus data"
             2. destinations table (legacy)  → "Live campus data (basic details)"
             3. bundled src/data/destinations.ts → "Offline data"

Supabase
  buildings ─┬─ floors ─┬─ rooms ─── room_images
             │          └─ floor_maps
             ├─ building_images
             └─ map_labels (optional building link)
  destinations (legacy) ── room_id ──▶ rooms        (fixed route stays here)
  navigation_catalog (view, security_invoker)       (what the app reads)
  user_roles (admin | editor)
  Storage: building-photos, room-photos, floor-maps (private)
```

Rooms describe what a place is. `destinations` keeps how to reach it: the entrance GPS target and
the fixed indoor route in the existing JSON format. A destination can point at one room through
`room_id`. Future navigation nodes (path graph, A*) are not part of this phase.

## Files

| File | Role |
| --- | --- |
| `supabase/migrations/20261027100000_initial_destinations.sql` | Baseline `destinations` table (already live) |
| `supabase/migrations/20261030120000_campus_schema.sql` | Campus tables, constraints, indexes, triggers |
| `supabase/migrations/20261030120100_access_control.sql` | Role helpers, RLS policies, privilege revokes |
| `supabase/migrations/20261030120200_storage.sql` | Buckets, size and type limits, Storage policies |
| `supabase/migrations/20261030120300_destinations_transition.sql` | `room_id` link, `navigation_catalog` view |
| `supabase/tests/access_rules.test.sql` | Public, Editor, Admin, and integrity checks (rolls back) |
| `src/models/campus.ts` | `RoomType`, `DestinationDetails`, `DestinationImage`, `DisplayImage` |
| `src/services/destination-repository.ts` | Validated loading, fallbacks, signed photo URLs |
| `src/services/destination-details.service.ts` | Summary shown on the Confirm screen |
| `src/composables/useDestinationCatalog.ts` | Shared catalog state and source label |
| `src/views/ConfirmDestinationPage.vue` | Confirm Destination screen (`/destinations/:id`) |

## Migration order

| Order | File | Status |
| --- | --- | --- |
| 1 | `20261027100000_initial_destinations.sql` | Already applied on 2026-10-27. Safe to re-run. |
| 2 | `20261030120000_campus_schema.sql` | Not applied yet |
| 3 | `20261030120100_access_control.sql` | Not applied yet |
| 4 | `20261030120200_storage.sql` | Not applied yet |
| 5 | `20261030120300_destinations_transition.sql` | Not applied yet |

Every migration can run more than once. None of them drops a table or changes existing rows. The
transition only adds columns with defaults (`room_id` NULL, `is_active` true) to `destinations`.

Until migrations 2 to 5 are applied, the app reads the legacy `destinations` table and labels it
"Live campus data (basic details)". After they are applied it switches to `navigation_catalog`
automatically. No app update is needed.

### Applying (when you decide to)

Option A, SQL Editor: open Supabase Dashboard → SQL Editor and run files 2, 3, 4, 5 in order, one at
a time. Check that each one finishes without errors before running the next.

Option B, Supabase CLI:

```
supabase link --project-ref <your-project-ref>
supabase migration repair --status applied 20261027100000
supabase db push
```

`migration repair` records that the baseline is already live, so the CLI does not run it again.

## Data model

| Table | Key points | Deleting a parent |
| --- | --- | --- |
| `buildings` | Unique `code` (A-Z, 0-9, `_`, `-`), optional entrance coordinates (both or neither), `arrival_radius` 0-100 m, `is_active` defaults to false | Blocked while floors, rooms, or photos exist |
| `floors` | `level` -5..200, unique per building | Blocked while rooms or floor maps exist |
| `rooms` | Building + floor of the same building (composite FK), optional `room_number` unique per building (case-insensitive), `type` in office / classroom / laboratory / facility / restroom / other, `is_active` defaults to false | Blocked while photos exist; linked destinations keep working with `room_id` set to NULL |
| `building_images`, `room_images` | `storage_path` must be `<parent id>/<uuid>.<jpg/jpeg/png/webp>` and match the parent row | n/a |
| `map_labels` | Optional coordinates (both or neither), optional building | Building delete sets `building_id` to NULL |
| `floor_maps` | Optional scale and rotation, only one active map per floor | n/a |
| `user_roles` | One role per user, `granted_by` recorded | Deleting an auth user removes the role |

New buildings and rooms start unpublished (`is_active = false`), so half-entered data never shows
up in the app.

## Access rules

| Action | Public (anon or signed in without a role) | Editor | Admin |
| --- | --- | --- | --- |
| Read published buildings, floors, rooms, photos, labels, floor maps | Yes | Yes | Yes |
| Read unpublished content | No | Yes | Yes |
| Create, edit, delete campus content and destinations | No | Yes | Yes |
| Upload, replace, delete photos and floor maps | No | Yes | Yes |
| Read own role | Signed in only | Yes | Yes |
| Read all roles | No | No | Yes |
| Grant, change, remove other users' roles | No | No | Yes |
| Change own role | No | No | No |

Enforcement:

- Every table has RLS enabled. Role checks use `security definer` helpers (`is_content_manager()`,
  `is_admin()`) that only report the caller's own role.
- `anon` has no insert, update, or delete privilege on any campus table, and no access to
  `user_roles`. `TRUNCATE` is removed from client roles.
- Admins cannot insert, update, or delete their own `user_roles` row, and `granted_by` must be the
  Admin's own id. Nobody can make themselves Admin.
- `navigation_catalog` uses `security_invoker`, so the caller's RLS applies to every joined table.

## Secure initial Admin setup

The first Admin cannot be created from the app. Do it once from the Dashboard:

1. Authentication → Sign In / Providers: turn off "Allow new users to sign up" so strangers cannot
   create accounts. Admins invite or add Editors later.
2. Authentication → Users → Add user: create the Admin account with a strong password.
3. SQL Editor (runs as the database owner, so RLS does not block it):

   ```sql
   insert into public.user_roles (user_id, role)
   select id, 'admin' from auth.users where email = 'admin-email@example.com';
   ```

4. Check that exactly one row was inserted:
   `select user_id, role from public.user_roles;`
5. Further Editors and Admins are granted from Role Management in the admin web app
   (`admin/`, see `admin/README.md`).

Key handling:

- The mobile app and the future Admin web app use only the anon (publishable) key.
- The service-role key bypasses RLS. Never put it in the mobile app, browser code, `.env` values
  that start with `VITE_`, or git. Use it only in trusted server code or the Dashboard.

## Storage

| Bucket | Object name | Max size | Types |
| --- | --- | --- | --- |
| `building-photos` | `<buildings.id>/<uuid>.<ext>` | 5 MB | JPEG, PNG, WebP |
| `room-photos` | `<rooms.id>/<uuid>.<ext>` | 5 MB | JPEG, PNG, WebP |
| `floor-maps` | `<floors.id>/<uuid>.<ext>` | 10 MB | JPEG, PNG, WebP |

- All buckets are private. The app asks for signed URLs that last 1 hour.
- The public can open a file only while a published image or floor-map row references it.
- Only Admins and Editors can upload, replace, or delete, and only to a valid path whose parent row
  exists. A fresh UUID per file keeps names unique; the database stores the same path.
- Size and type limits are bucket settings enforced by the Storage API.

Upload order for the Admin Module: upload the file to `<parent id>/<new uuid>.<ext>`, then insert
the `room_images` / `building_images` / `floor_maps` row with that `storage_path`.

## Mobile app behavior

- The picker shows a Select button. It opens the Confirm Destination screen.
- The Confirm screen shows the name, type, building, floor and room number (when available), the
  description (when available), the GPS entrance and indoor route length, and photos or a
  "No photo yet" placeholder.
- Start Navigation selects the destination and opens the existing camera guide. Back returns to the
  picker without changing the current selection. No login is needed.
- Opening a link for a destination that does not exist shows "Destination not found".
- Data source label:
  - "Live campus data": `navigation_catalog`
  - "Live campus data (basic details)": legacy `destinations` table
  - "Offline data": Supabase is not configured
  - "Offline data · campus server unavailable" with Retry: Supabase failed or returned nothing usable
- If a refresh fails after live data was loaded, the app keeps the live catalog and its label.
- Every row is validated before use. Invalid rows are skipped. Malformed photo paths are dropped.

## Testing

- `npx vitest run`: unit tests for row validation and mapping, view to legacy to offline
  fallbacks, signed URL mapping, the summary, the shared catalog, and the Confirm screen.
- `supabase/tests/access_rules.test.sql`: runs inside a transaction and rolls back. It checks
  public visibility, Editor and Admin permissions, self-promotion, Storage upload rules, and
  delete and constraint behavior. In a local Supabase stack run it with
  `psql "$DB_URL" -f supabase/tests/access_rules.test.sql`. It prints
  `ALL ACCESS TESTS PASSED` or stops at the first line that starts with `FAIL`.

## Limitations

- The SQL was verified in a local Postgres emulation with stand-in `auth` and `storage` schemas.
  It has not been run against the live Supabase project.
- Bucket size and type limits are enforced by the Storage API, which the local emulation does not
  include. Test them with a real upload after applying the migrations.
- There is no Admin UI yet, so campus content can only be entered through the Dashboard or SQL.
- Entrance coordinates, room details, photos, and floor maps are still empty until surveyed and
  entered.

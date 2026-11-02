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
  "Not yet available for navigation" until a destination is created. Use Add Destination to create
  its fixed route, or Edit / Record route to change an existing route. Route saves turn the destination off.

## Destination creation status (2026-11-02)

The Destinations page now supports Add Destination, room linking, route editing, and foreground
motion recording on supported phones. Creating a room still does not automatically create a
destination. Routes require 1–50 segments, each above 0 and at most 500 meters.

Available workflow:

1. Create the building, floor, and room using the existing content pages.
2. Choose **Add Destination** for a room without a destination. Select the room; its building,
   name, type, and entrance details come from existing records. Set the building entrance name first.
3. Enter a surveyed fixed route from that building entrance to the room using ordered segments
   (straight, left, or right, with distance in meters). Do not invent route lengths or coordinates.
4. Save the destination as inactive while preparing it. Validate its unique ID, room association,
   required fallback fields, and route using rules compatible with the mobile loader.
5. Verify the route on site before activation. The linked room and building must also be published
   for the destination to appear through the campus catalog.

The destination creation service and validated editor use the existing RLS policies and unique
room-link index. Live Editor/Admin access must be verified separately. Automatic path generation,
stairs, elevators, and routing across floors are not supported by this route model.

### Recording on a phone

Confirm you are at the named entrance facing the first corridor. Calibrate meters per walking
step using a measured distance and counted steps. Start recording, hold the phone steadily, and
mark each turn at the corner. A turn applies to the segment after that corner. Checkpoint splits
the route without changing direction. Pause/Resume, Finish, and Cancel are available; Cancel
restores the route that was in the editor before recording started. Starting a fresh recording
replaces the editor segments; Cancel restores them.

The recorder uses browser DeviceMotion/DeviceOrientation APIs, also inside the Capacitor WebView.
The official Motion plugin uses these same Web APIs, so no extra sensor dependency is installed.
It estimates distance from acceleration peaks and calibrated step length; heading changes are
displayed for reference, while turns are manually marked. It is not precise indoor positioning or
a native step counter. It requires sensor support and a secure context (HTTPS on a hosted website).
Denied permissions, missing sensors, or absent motion samples leave manual editing available.
Backgrounding pauses recording; return to the same position and facing before resuming. Review
and correct all segments after finishing. Save as inactive draft, verify on site, then turn on.

Unsaved drafts are kept per user/destination in sessionStorage for this tab and recovered when
the editor reopens. They include the current estimated segment; recording never resumes automatically.
Sign-out clears the open editor's recovery draft. Disabled/full storage means recovery is unavailable;
failed network saves keep the form in memory. This is not durable offline synchronization.

### Android admin

The generated native project is `admin/android`, with application ID `com.onelocate.admin`.
Capacitor 8.5.3 matches the companion mobile app. Keep `admin/.env` configured with public
Supabase settings before building. Use the same Admin/Editor login as the website.

```powershell
cd admin
npm install
npm run android:sync
npm run android:open
# Or deploy to a connected device/emulator:
npm run android:run
```

Android builds require the Capacitor 8 Android toolchain, Android SDK, and Java. No location or
activity-recognition permission is requested: this implementation uses foreground WebView motion
events, with runtime permission prompts where the browser requires them. Sensor delivery and
authentication persistence still need testing on a physical Android device.

Dependency references: [Capacitor Android](https://capacitorjs.com/docs/android),
[Motion API](https://next.capacitorjs.com/docs/apis/motion), and
[Capacitor MIT license](https://github.com/ionic-team/capacitor/blob/main/LICENSE).

### Verification for this implementation

- Admin production build and type checking passed.
- All 105 tests passed, including route limits, duplicate/permission errors, draft saves,
  failed-save retention, and missing sensor samples/listener cleanup.
- ESLint completed with 0 errors and 59 existing interface warnings.
- Android platform generation and asset sync passed.
- Runtime dependency audit (`npm audit --omit=dev`) reported 0 vulnerabilities. The full install
  reported 25 development dependency advisories (18 moderate, 6 high, 1 critical); these remain unresolved.
- APK compilation could not proceed: Java was not on PATH and JAVA_HOME was unset. Android
  Studio's default bundled Java path was also absent. No APK or physical-device test is claimed.
- Live Supabase role checks and real route accuracy were not verified, and no live migrations were run.

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

Satellite map, voice guidance, and sensor-driven AR routing changes.

## Indoor floor maps and routing

**Indoor Maps & Routes** now provides floor-plan upload, calibration, node/edge editing, stairs/elevator
connections, graph publication and standard/step-free route previews. Mobile uses a separate map-guidance
screen with explicit checkpoint and floor confirmation. Apply the new Phase 4C migration before use.
See [setup, deployment and limitations](../docs/indoor-maps-phase-4c.md).

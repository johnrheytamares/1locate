# Outdoor GPS route recording

The primary admin workflow is **Choose building → Start Recording → Walk and mark turns → Finish Route → Review → Validate → Publish**. The previous drawing tool remains in Advanced setup. The existing `public/images/updated_map.png` is used unchanged. BSIT / IT Building continues to use its existing building record.

## Installation

1. Apply existing campus/access-control migrations first. Apply the additive migration `supabase/migrations/20261110090000_outdoor_recordings.sql` to the same Supabase project used by the mobile and admin apps. Use Supabase SQL Editor or the project's usual migration deployment process. This implementation does not apply SQL to your live database automatically.
2. Keep both apps configured with the existing project URL and **public anon key**. Never put a service-role key in either frontend. The SQL uses the existing `is_content_manager()` / `is_admin()` role helpers. Administrators can publish; editors can record and save their own private routes.
3. In `admin/`, stop the running dev server with **Ctrl+C** before installing dependencies. Close any active Vite/Vitest process for this app; Windows can lock the native Rolldown binding while the server is running. Then run:

```powershell
npm.cmd ci
npm.cmd test -- --configLoader runner
npm.cmd run build -- --configLoader runner
npx.cmd cap sync android
npx.cmd cap open android
```

If `npm.cmd ci` fails with `EPERM ... rolldown-binding.win32-x64-msvc.node`, stop the admin dev server and retry `npm.cmd ci`. An interrupted clean install can leave packages missing; do not run tests until the install succeeds. Do not delete the lockfile or install random missing packages individually. If the file remains locked, close this project's Node tasks or restart Windows before retrying.

The admin test command is `npm.cmd test -- --configLoader runner`. `npm.cmd run test:unit` belongs to the mobile project root, not `admin/`. Start the admin dev server again after installation/testing with `npm.cmd run dev`.

Build/install the updated admin app through the existing Android workflow. Fine/coarse location and camera permissions are declared, and Capacitor Geolocation is registered. Enable Android Location Services and grant **precise location**. The web recorder needs HTTPS or localhost. On a phone, a plain HTTP LAN IP is not a secure camera/geolocation origin.

4. From the mobile project root, run:

```powershell
npm.cmd ci
npm.cmd run test:unit -- --run --configLoader runner
npm.cmd run build -- --configLoader runner
npx.cmd cap sync android
```

Install this feature update once in the user-facing app. Later published route packages download and cache as data; they do not require another APK rebuild. Old installations that do not contain the new loader still need the feature update.

## One-time map alignment

Open Advanced setup → Route data → Map alignment. Enter the real GPS of three well-separated landmarks and tap each exact landmark on the unchanged image. After those three, select **Add independent alignment check**, enter a fourth landmark's GPS, and tap it. The independent check cannot reuse a fitted landmark. Add more check points across the campus when possible (up to 20).

Three fitted points have zero residual by construction; they cannot independently prove alignment quality. Publishing a recorded route requires independent check data, error within the recording's configured limit, and a visual on-site check. Default maximum RMS error is 12 m. A low error at one independent landmark is not proof of accuracy everywhere on a schematic map. Large-error overlays are labelled approximate and block publication; GPS geometry remains separately stored. If alignment is missing, unchecked, inaccurate, or any recorded point is outside the image, the recorder shows a separate GPS path diagram instead of implying the walk belongs on the school map. That diagram uses recorded coordinates, preserves gaps and supports zoom/scroll; it is not a basemap.

## Recording and recovery

- Start at a physically reachable walking point. The destination entrance GPS must already exist. It is never replaced with a recording endpoint.
- Only actual timestamped GPS fixes create movement. Default quality limits: good accuracy ≤8 m, maximum accepted accuracy 20 m, minimum movement 3 m, walking speed ≤3 m/s. The movement gate also considers consecutive accuracy circles. Stale/out-of-order points, jumps, poor accuracy and stationary jitter are ignored. These are estimates, not survey-grade measurements; rhythmic GPS drift can still require manual review.
- Straight/Left/Right create checkpoints only after accepted movement. A fresh reliable stationary reading can confirm the last accepted location while stopped at a corner; marking a turn does not add distance. Unreliable/stale readings and duplicate taps still cannot authorize a checkpoint. Repeated taps at the same position do not create duplicates. Nodes are created at checkpoints/start/end; intermediate fixes remain full polyline geometry.
- Pause/backgrounding releases camera and GPS. Resume does not count the paused displacement. A material gap or long GPS outage blocks validation and must be re-recorded. Do not move to a different walkway while paused and expect an inferred connection.
- Camera denial permits GPS-only recording with an explicit warning. Camera arrows are visual references, not spatial AR. No ARCore is required.
- IndexedDB writes a recovery draft under the signed-in account after accepted points and periodically for elapsed time. Recovery restores a paused recording, never an automatically running camera. Sign-out releases sensors and clears on-screen data; another account cannot see that draft. Storage failures are displayed. Mobile/browser storage removal or OS data clearing removes local drafts.
- Recording works without internet once the authenticated admin UI and destination data are available. Reopening an uncached web admin site or signing in for the first time still needs connectivity. The recorder is not a background-location service; app backgrounding intentionally pauses it.

## Review, sharing and publishing

Finish opens review and never publishes. Review shows Recording finished and last-reading labels, not a live GPS-unavailable/Paused warning. Cancel clears the prior GPS readings and recording feedback. Instruction summaries appear first; raw coordinates and checkpoint indexes are under Edit instructions and GPS details. Save Draft keeps the route on this device; Online save stores a private copy remotely. Check estimated distance, duration, GPS counts/quality, endpoint proximity and the unchanged campus-map overlay. The endpoint must be within 8 m of the saved entrance. Review can remove intermediate fixes, adjust checkpoint direction/point index, split at an accepted point, and trim/re-record a problematic suffix. Replacing a start/end requires re-recording. Removed points do not erase pause-gap evidence. Edits invalidate previous validation.

Review nearby network points and existing mapped paths. A nearby GPS coordinate is **not** proof of a connection through fences, buildings or between levels. Explicitly select an existing start, or a verified entrance endpoint, to reuse it (within 8 m); automatic proximity merging is never performed. Duplicate endpoint connections are rejected. Checkpoints can mark verified intersections, but the app cannot discover physical intersections or obstacles from GPS alone. Splitting the new recording at a checkpoint is supported; automatic merging/splitting of overlapping published edges is intentionally not inferred.

Recorded paths start as two-way, open, **not verified accessible**. The retained advanced Path Sections editor supports manual direction/accessibility settings and independently measured distance corrections. Those network edits remain drafts and must be reviewed; the normal recorder never asks for a distance to be typed.

States:

| State | Meaning |
|---|---|
| Local draft | Persisted on this device/account. Not public. |
| Saved | Private recording synchronized to Supabase. Not public. |
| Validated | Local geometry, map checks, entrance and explicit on-site confirmations passed. Not yet public. |
| Published | An administrator approved an immutable versioned whole-network package. |

Save online keeps the local draft on failure. A requested failed synchronization retries on the browser `online` event while the recovered recording is open in review, or via Save online. Publishing always requires explicit validation and approval. Private recordings are owner-scoped. Administrators currently publish their own reviewed recordings; cross-account editorial handoff is not introduced.

Publication rebases on the latest package, retains previous edges, and serializes publishers on the server. A stale overwrite fails rather than erasing another published route. Published recordings are immutable; make a new recording for a new path. Do not use this action to retire or delete existing published paths. Geometric continuity and reference integrity are checked, while wall/fence/overlap/access checks require the administrator's real survey; no building-footprint obstacle detection is claimed.

## Mobile offline behavior

The mobile loader reads only public published packages, validates version/schema/geometry and caches the last valid version in IndexedDB. It checks for newer packages when planning routes (network checks are throttled to once per minute after success). A failed request or invalid new response retains the last valid package. On a first launch without a downloaded package, the existing bundled JSON remains the fallback. No package download means no new offline data.

Dijkstra routes through checkpoint nodes and projects onto full recorded curves, not endpoint chords. Route progress and remaining meters follow the geometry and measured edge distances. Recorded forward turn hints are included; reverse traversal uses path/heading guidance rather than inventing surveyed reverse turn instructions. Unconnected entrance pins cannot hide connected recorded endpoints. GPS is not used as indoor positioning. The mandatory destination-details → map → outdoor → entrance confirmation → indoor → arrival flow is preserved. No usable route means routing unavailable and no outdoor directional arrows.

## Verification and field checklist

Automated coverage includes straight movement, turn checkpoints/duplicate taps, stationary jitter, bad accuracy, stale/jumping readings, outage/pause gaps, draft parsing and recovery, cleanup after late camera/watch results, offline save failure, cancellation, explicit publication, curved routing and offline package reload/corruption handling. Production builds check both app types.

Before publishing real campus data, test on an ordinary Android phone: camera and precise location permissions, Location Services disabled, actual straight/left/right paths, stationary drift near buildings, background/pause/rejoin, interrupted recovery, offline recording, reconnection/save, overlap review, independent map accuracy and destination entrance consistency. Apply the SQL and verify RLS with real admin/editor/anonymous accounts. Download a published version on the mobile app, restart with airplane mode, and verify navigation still uses that version. Local unit tests/builds do not prove physical GPS, camera, live RLS or installation behavior.

No real GPS walks, fake routes, or automatic SQL seed updates are included. The existing campus coordinate seed is unchanged.

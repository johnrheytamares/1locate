# Six-screen mobile navigation flow

1. Destination picker: voice/text search, category filters, building/floor labels.
2. Mandatory Destination Details: route information, indoor instruction count and indoor meters. View on Map records the reviewed destination. No GPS or camera is started here.
3. Navigation Preview: a separate screen with MapTiler Satellite Hybrid, actual GPS estimate and accuracy circle, entrance marker, recenter/zoom/orientation controls, and Start Navigation. Direct entry without reviewing details returns to the details page. Preview location tracking stops before navigation starts.
4. Preparing AR Navigation: rendered by the existing camera navigation page, so initialization and live guidance share one lifecycle. Completion indicators reflect loaded route, successful camera startup, and initialized overlay/listener. Heading availability is stated separately; a started listener is not claimed as a working compass. Denied/unavailable camera offers Retry and Use Map Navigation. There is no timed fake loading animation.
5. Live Camera Navigation: existing arrow artwork and walking/turn safeguards retained. The camera fills the guide area with compact controls. Map View pauses indoor walking and exposes the existing resume/restart safeguards. Location failures offer explicit physical entrance confirmation; no starting coordinate is fabricated. Indoor routes start only at the confirmed entrance. Manual checkpoints are explicitly user-confirmed endpoints of the saved instructions and do not assign a fake compass heading. Published floor-map routing remains available from the entrance confirmation; it requires its existing entrance/facing/landing confirmations.
6. Arrival: automatic step-distance completion prompts a room-sign check rather than declaring arrival. Only an explicit room confirmation or the final user-confirmed floor-map checkpoint creates the arrival record. Development simulation/debug progress is labeled TEST SESSION and cannot create a real arrival/feedback record. Navigation resources close before the arrival screen opens. Optional 1-5 ratings require no login.

## Outdoor route limits

The current destination catalog contains entrance coordinates and indoor instructions, not a surveyed outdoor walkway graph. No walking route line is fabricated between pins. Outdoor straight-line distance to the entrance is labeled separately from indoor route length. Existing outdoor guidance is bearing/distance guidance; it cannot identify obstacles or guarantee a safe walkable path. Satellite GPS during an indoor session is an outdoor reference, not room/floor tracking. Camera arrows remain screen overlays, not ARCore floor anchors.

## Offline behavior

A successful public destination-catalog download is saved and validated again on offline fallback, preserving real entrance coordinates and indoor instructions. Cached records may be stale until the next successful refresh. No satellite-tile download/offline entitlement is added. Indoor floor-plan images still require a cached image or an available signed map image; the graph-map viewer keeps its existing availability behavior.

Explicitly submitted ratings are queued locally when the API is unavailable, with up to 50 pending items. A stable UUID makes retries idempotent. Queues retry on next app startup and when connectivity returns. The UI distinguishes sent from saved-on-device; no failed submission is called delivered.

## Deploy feedback

There was no feedback table in this checkout. Apply `supabase/migrations/20261107090000_navigation_feedback.sql` after the existing campus access-control migration. It adds only navigation_feedback: anonymous/authenticated INSERT on rating fields, server timestamp, rating/length checks, and SELECT for existing content-manager roles. There are no anonymous reads or client UPDATE/DELETE grants, and no destination/auth schema changes. Anonymous ratings are unverified user input, not proof of a completed physical visit. Apply provider-side abuse controls if this is exposed publicly at scale.

The admin dashboard shows the latest 20 ratings and their average. Before this migration is applied, the dashboard reports ratings unavailable and the mobile app queues submissions. The migration has not been applied to a live project by the local implementation.

## Device and live verification

- Review Details -> Preview -> Start -> Preparing -> camera guide; reject camera/location permissions and verify the offered fallbacks.
- Verify actual entrance coordinates, GPS accuracy and heading on campus. Check safe areas, tall/short Android screens, background/resume, Back, repeated Start and destination changes.
- Confirm walking noise/rotation do not advance the fixed route; manual checkpoints advance only after explicit physical confirmation. Map View pauses indoor progress.
- Outdoor arrival must only prompt the entrance, never room arrival. Estimated indoor completion must wait for room confirmation. TEST SESSION must never produce real arrival or ratings.
- Download a real catalog, relaunch without internet, verify saved data and honest missing satellite imagery.
- After applying SQL, verify anonymous INSERT succeeds; anonymous/unassigned SELECT is denied/empty; Editor/Admin can read but cannot modify ratings through the client. Submit offline then reconnect and verify one row per UUID in the admin dashboard.
- Run mobile unit tests/build/lint, admin tests/build/lint, sync both Android projects, then build/install APKs. Local mocked checks do not establish device sensor accuracy or live RLS delivery.

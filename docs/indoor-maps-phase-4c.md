# Indoor maps and routing (Phase 4C)

Implemented locally on 2026-11-03. This is map-based guidance alongside the existing camera/fixed-route navigator.
It does not provide continuous indoor positioning or automatic rerouting from an unknown location.

## Database deployment

Apply `supabase/migrations/20261103090000_indoor_graphs.sql` **after** the Phase 4A migrations.
The migration adds `indoor_graphs`, graph integrity validation, RLS, and map-reference protection.
It does not modify existing destinations, fixed indoor routes, or campus coordinates.
No live migration is run automatically by either app.

Each building has at most one draft and one published graph snapshot. Draft edits leave the public
snapshot unchanged. Only Admin/Editor roles can write; public clients can read published graphs
whose building, referenced maps, and linked rooms remain published and consistent. Publication
requires calibrated maps. Unpublishing a referenced map or room hides the graph from public readers.
Map images referenced by a graph cannot be deleted or replaced in place; upload a new map and
revise the graph instead. Images use the existing private `floor-maps` bucket and signed URLs.

Database validation checks node/map/floor/building/room relationships, normalized coordinates,
unique identifiers and room links, valid positive distances, and valid cross-floor connectors.
Stairs cannot be marked accessible. Graph size is capped at 1,000 nodes, 4,000 edges and 2 MB.
Actual corridor traversability and accessibility must be surveyed; software cannot infer walls from an image.

## Admin workflow

1. Open **Indoor Maps & Routes** from the admin sidebar.
2. Choose an existing building and floor. Rooms must be assigned to the correct floor.
3. Upload the actual floor-plan image (JPEG, PNG, WebP; client maximum 5 MB).
4. Select Calibrate mode, tap two distinct points whose real distance was measured, enter meters,
   and apply the scale. Orange markers show the chosen calibration points.
5. Publish the calibrated map. Only one map per floor can be published; unpublish its previous map first.
6. In Add Node mode, tap entrances, room doors, corridor junctions, stairs landings and elevator stops.
   Set their names/types in Node Details. Link room-door nodes to existing rooms.
7. Connect nodes along clear corridors. Use intermediate nodes at every bend. Enter surveyed
   distance or estimate from the calibrated map, then verify that estimate on site.
8. On another floor, place the corresponding stairs/elevator landing. Connect landings using
   an edge of the same type, with a measured distance. Walking edges cannot cross floors.
9. Set accessible flags only after verifying the physical path. Stairs are always excluded from
   step-free routes. Uncheck Open to close an edge; re-publish the graph for public routing to change.
10. Preview entrance-to-room routes with both standard and step-free preferences. Disconnected
    paths return an explicit no-route result. Every linked room must be reachable before UI publication.
11. Save a draft, field-check the graph and map scale, publish the building/rooms/maps, then publish
    the verified graph. Unpublish Graph removes the public snapshot while retaining its draft.

Node movement does not silently change edge lengths. Review or recalculate affected measurements.
Draft maps and graph edits must be saved before leaving. Avoid editing the same building concurrently:
this initial editor uses last-write-wins snapshots, not collaborative editing or merge resolution.

## Mobile workflow

Open **Explore floor-map routes** in the destination picker, or **Plan a floor-map route** on a
linked destination's confirmation screen. Rooms in the graph can be reached through the map explorer
even if they have no legacy fixed-route destination record.

Choose a building, starting entrance, destination room and optional step-free preference. Dijkstra
computes a route using surveyed edge distances; closed edges are excluded. The preference excludes
stairs and any connection not marked accessible. No suitable connection produces a no-route message.

Confirm you are physically at the selected entrance. Face the highlighted corridor before continuing,
then confirm each checkpoint. Map-relative turns use image geometry; they are not compass instructions.
Stairs/elevator instructions name the destination floor. Confirm the landing to switch maps. Face
the next corridor again after a transition. This is explicit checkpoint guidance, not sensor-driven AR.

**I lost my way** pauses advancement. Resume only from the same route position, or physically return
to the selected entrance and confirm restart. Backgrounding/leaving pauses active guidance. These
routes are held in memory; a full app reload requires planning and entrance confirmation again.

## Verification and limits

Current checks: 113 admin tests and 90 mobile tests passed; both production builds and type checks
passed. Mobile lint passed; admin lint passed with 54 existing warnings and zero errors.
The mobile build retains its existing large-chunk and Vite config compatibility warnings.
Automated tests cover graph
validation, shortest routes, directionality, closures, step-free alternatives, floor transitions,
entrance/facing confirmation and paused guidance. SQL/RLS require separate database execution and
role tests; passing TypeScript tests does not verify database enforcement.

`supabase/tests/indoor_graphs.test.sql` provides transaction/rollback checks for graph integrity,
anonymous draft denial, anonymous write denial and child unpublication. It has not been executed
in this environment: no local PostgreSQL CLI was available and the Docker daemon was not running.
The migration has not been applied to live Supabase. Signed-in Editor/Admin and Storage checks
remain pending on the deployed database, as do actual-device route and map accuracy checks.

Before deployment, apply the migration and verify anonymous draft denial, Editor/Admin writes,
publication prerequisites, and signed map image access. Test route geometry, corridor widths,
door availability, all floor transitions and accessibility claims on the actual campus.

Limits: one building per graph, one image per floor within a published route, manual checkpoint
confirmation, no live elevator status, no offline graph sync, no real-time route invalidation during
an active session, and no precise indoor position or automatic rerouting. Signed map URLs last one
hour; refresh/replan after expiry. Existing fixed camera routes remain a separate navigation mode.


## Camera route walking progress

The camera/fixed-route navigator starts estimated walking progress automatically after
entrance confirmation. Stand at the entrance facing the first corridor before confirming.
The first available phone heading sets the route's initial forward direction once; later
headings guide turns. There are no Set Forward or Enable walking buttons in the normal guide.
If heading data is unavailable, guidance waits for phone direction without inventing a heading.

All users start with a shared 0.70 m per step estimate. A previously saved valid personal
step length overrides this default. It is not a measured calibration for every user.
Linear-acceleration peaks subtract this step length from remaining meters, displayed to at
most one decimal place. This is estimated walking progress, not precise indoor positioning.
Progress requires active, unpaused indoor guidance and alignment with the path. Walking
stops at turn boundaries. Holding the turn heading for 750 ms only accepts the new direction;
it adds no distance. The turn step's own distance must then be walked like a straight step.
Arrival means the estimated walked distance reached the route length, so the alert says
"Estimated route complete" and asks the user to look for the room sign.

The normal guide shows the arrow area, destination/distance/instruction card and I lost my way.
Motion errors show a retry action; manual progress controls remain in development tools.
The camera stays off during entrance/location configuration and starts only when the guide
is visible. The guide uses the remaining screen height for the camera area. Backgrounding
pauses indoor guidance and stops walking. Resume from the same physical position restarts
walking; restart requires entrance confirmation and captures the initial direction again.
Leaving removes motion listeners and closes the camera.

Verify sensor sensitivity, stationary/shaking behavior, heading, permissions, background/resume,
turns, camera layout and arrival on an actual Android device. This does not change the
floor-map explorer's explicit checkpoint confirmation workflow.


Walking false-positive guard: isolated acceleration peaks no longer advance the route.
Detection requires complete 60?350 ms pulses, 350?1100 ms intervals and four consistent
candidate strides before counting. Once the fourth consistent stride confirms the rhythm,
all four are credited, then one per stride. Pulses that never form that rhythm add nothing.
Large jolts, reported rotation above 60 degrees/second, facing away from the path (over 25°),
and missing heading reset detection. Without `event.acceleration`, gravity is removed from
`accelerationIncludingGravity` with a 500 ms low-pass estimate; this fallback is untested on
a device. These are heuristic thresholds pending on-device validation, not proof of user
displacement; rhythmic shaking can still resemble walking.

### Development diagnostics

`npm run dev` shows a "Walking diagnostics" list inside the indoor Debug panel: motion source and
sample rate, acceleration x/y/z and magnitude, rotation rate, candidate and accepted steps,
walking block reason, last step rejection reason, step length and its source (default or saved),
walked and route meters, and the arrival trigger. Release builds and APKs do not render it and do
not collect these readings.

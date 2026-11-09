# Outdoor walking navigation

The destination-details screen remains mandatory before the aerial preview. Start Navigation
opens the existing camera guide. Outdoor arrows now use the next part of a walking route,
rather than the direct bearing to the entrance. The existing arrow artwork and indoor
saved-route/estimated-step/checkpoint flow are preserved. No floor-plan image, QR code,
scanning, new package, or database migration is required.

## Configure a campus network

1. Configure the building and destination entrance coordinates first. Record actual surveyed
   latitude, then longitude; do not use example or guessed campus coordinates.
2. In the admin app, open **Outdoor Walking Routes**. Add nodes at building entrances,
   intersections, crossings and every path bend. Mark the actual entrance nodes.
3. Connect only walkways that physically exist. Enter measured meters. A connection is
   bidirectional unless One way is checked. Uncheck Open for a closed path. Mark Step-free
   only after checking physical accessibility. Validation rejects distances implausibly shorter
   than the geographic separation of the endpoints.
4. Preview routes from different starting nodes to every entrance. Test closed connections
   and one-way directions. Preview can inspect a draft; it does not publish or verify it.
5. Walk the routes on campus, verify distances, entrances, crossing safety and access, then
   check the survey confirmation. Editing nodes or connections clears that confirmation.
6. Export the network. Replace `public/campus-walking-network.json` in the mobile project
   with the exported file, then build and update the mobile APK. Admin browser drafts and
   exports do not update deployed clients. Keep the same app ID/signing key for updates.

The checked-in network is intentionally empty and unverified: no actual campus network has
been supplied. Drafts stay in that admin browser's local storage. Complete valid drafts can
be saved/reloaded; exporting JSON also provides a portable backup. There is no shared cloud
publication or live closure feed. Old APKs keep their bundled paths until updated.

## Route selection

For a verified network with an entrance node within 8 m of the destination's saved entrance,
the app snaps to an open segment within 20 m and runs Dijkstra using measured edge distances.
Partial first-segment distance and one-way restrictions are respected. The map starts on
that segment; the app does not draw an invented connector from GPS through buildings.
GPS snapping cannot prove which side of a wall or crossing the user is on. Check the map
and join the actual walkway before following it.

If the network is unverified/empty or has no matching entrance, the existing FOSSGIS
OpenStreetMap pedestrian provider is used and labeled. That provider's routing algorithm
is not claimed to be this app's Dijkstra. External geometry must start and end within 20 m
of the requested positions. A missing, invalid, disconnected or closed configured route
does not silently become a straight line or bypass its closure using the public provider.
A malformed/unloadable network fails visibly and provides Retry. External coverage and
internet access are not guaranteed. Configured campus routing can work without an external
routing service; satellite imagery and unconfigured routes still need connectivity.

## Live guidance and recovery

- Camera and Map View share one GPS session and one route. Preview GPS stops before the
  camera page starts. Switching to Map View does not start a second GPS watcher.
- Accepted fixes project onto the path geometry to estimate remaining walking distance and
  the bearing of a point about 10 m ahead. Phone heading sets left/right/forward arrows.
- GPS fixes must be fresh within 15 seconds, accurate within 20 m, and not rejected by the
  existing GPS filter. Missing/stale heading also pauses arrows. Map guidance remains available.
- Arrows pause away from the mapped path. Automatic rerouting requires three accurate fixes
  at least two seconds apart, each more than max(25 m, twice GPS accuracy) from the path.
  Route requests are throttled to at most one per 20 seconds (explicit Retry can bypass the
  cooldown). Poor GPS and isolated jumps cannot trigger automatic rerouting.
- Route requests time out after 12 seconds, and are canceled when the session stops,
  backgrounds or changes target. Late responses cannot replace the active session's route.
- At the end of the mapped path, arrows stop and ask the user to check the entrance sign.
  Existing GPS entrance proximity confirmation and the manual **I'm at the entrance** option
  remain. Neither counts as arrival at an indoor room.

These are direction overlays in camera space, not floor/world-anchored AR. GPS and heading
uncertainty remain; no indoor positioning or indoor automatic rerouting has been added.
Only configured destinations with usable data can be navigated. Physical Android testing,
actual campus survey, GPS/compass accuracy and provider footpath coverage require on-site
verification before describing the system as accurate real-world navigation.


## Use the school's infrastructure image

In **Outdoor Walking Routes**, use **Import school map image** to select the original PNG,
JPEG or WebP (up to 1 MB). The original image is embedded in the exported network JSON,
so there is no separate upload service, external image URL, or mobile image file to maintain.

The picture does not supply walkways. Add three GPS calibration anchors by entering a verified
latitude/longitude pair and clicking the exact corresponding landmark on the image. Choose
widely separated points in the main campus map, never on a straight line. Do not use the legend,
scale bar, compass or inset location maps as landmarks. Printed coordinate ticks and screenshot
pixels alone are not accepted as verified entrance GPS data.

After calibration, select **Add walking node** and click entrances, junctions and every walkway
bend. Image clicks are transformed into GPS estimates using an affine registration (supports
image rotation). Name the nodes, mark entrances and connect only actual surveyed walkways.
Check the resulting coordinates against independent landmarks on site; affine registration
is an estimate and cannot correct an inaccurate or distorted source map.

Open connections render green, closures dashed red, and the preview route blue. Export is
blocked for an uncalibrated reference map. Editing the image, anchors or network clears the
survey confirmation. Draft/import/export workflows otherwise remain the same.

For a verified campus route with a reference image, the mobile preview and Map View show
**School campus map** with the route and estimated GPS pin. Use Zoom +/? and scroll to inspect
it, Recenter to return to the estimated position, or Satellite view to use the existing map.
Public-provider fallback routes continue using satellite view because they have no calibrated
campus reference image. No route has been inferred from the school image.


If you only want the school map visible before pathways are configured, choose **Export
reference map only**. Replace the same mobile JSON and rebuild. This export deliberately
contains no walking network and is unverified: the mobile view shows the school image but
hides GPS pins and route overlays on it. Satellite view remains available for GPS and
public-provider routes. The original chat image must first be imported as an image file;
no school image or coordinates have been fabricated in the repository.

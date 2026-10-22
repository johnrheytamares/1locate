# 1Locate Phase 3: GPS Outdoor Positioning

Phase 3 replaces the simulated outdoor distance with real GPS. Outdoors the app now guides the user
to a building entrance using live latitude and longitude, the real geographic bearing, and the
phone compass. After a stable entrance arrival the existing fixed indoor route takes over.

The camera stays the primary UI. The overlay is still a 2D guide on top of the live camera. It is
not anchored to the world.

## Architecture

```
DestinationPickerPage
        │ selectDestination(id)
        ▼
ARNavigationPage (camera + overlay)
  ├─ stage: outdoor → entrance → indoor
  ├─ useOutdoorGps(heading)              src/composables/useOutdoorGps.ts
  │    ├─ REAL GPS:      location.service.ts (@capacitor/geolocation watchPosition)
  │    ├─ SIMULATED GPS: simulated-location.service.ts
  │    └─ OutdoorState:  outdoor-navigation.service.ts (filtering, distance, bearing, arrival)
  ├─ watchHeading()                      orientation.service.ts (compass)
  └─ indoor fixed route                  navigation.service.ts (Set Forward, turns, final arrival)
```

| File | Role |
| --- | --- |
| `src/models/location.ts` | `UserLocation` model and GPS constants |
| `src/models/navigation.ts` | `OutdoorTarget`, `Destination` with `outdoorTarget` and `indoorRoute` |
| `src/data/destinations.ts` | Destinations, TEST placeholders for entrance coordinates, indoor routes |
| `src/services/geo.service.ts` | Haversine distance, bearing, coordinate validation, offset point |
| `src/services/location.service.ts` | Wrapper around the Geolocation plugin |
| `src/services/outdoor-navigation.service.ts` | Pure outdoor guidance logic |
| `src/services/simulated-location.service.ts` | SIMULATED GPS source for testing |
| `src/composables/useOutdoorGps.ts` | Permission flow, active source, reactive outdoor state |
| `src/views/ARNavigationPage.vue` | Camera page, stage switching, debug panel |

The outdoor state lives in the `useOutdoorGps` composable instead of the page template. A future
Camera/Map toggle can read the same state without restarting navigation.

## Packages

| Package | Version | Why |
| --- | --- | --- |
| `@capacitor/geolocation` | 8.2.4 | Official Ionic plugin. Peer dependency `@capacitor/core >=8.0.0`, matching Capacitor 8.5.3 |

The Android side of the plugin adds `play-services-location` and `io.ionic.libs:iongeolocation-android`.
No other packages were added. `npm audit` reports no advisories for the plugin. The existing advisories
are in development tools (vitest, cypress, eslint plugins, the Capacitor CLI `xcode` dependency) and are not
shipped in the APK.

No API keys or credentials are needed for GPS. `.env` files are ignored by git in case secrets are added later.

## Permissions

`android/app/src/main/AndroidManifest.xml`:

```xml
<uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
<uses-feature android:name="android.hardware.location.gps" android:required="false" />
```

- No `ACCESS_BACKGROUND_LOCATION`. Location is used only while the navigation page is open and in the foreground.
- When the app goes to the background the watcher is cleared. It restarts when the app returns.
- If Android 12+ users grant only Approximate location, the page shows "Precise location is off".

### Permission UX

| Situation | What the user sees |
| --- | --- |
| Not yet granted | "1Locate needs your location to guide you to your destination." with **Allow Location** |
| Denied | "Location permission is required for outdoor navigation." with **Retry** and **Back to destinations** |
| Location services off | "Please turn on Location Services to continue navigation." with **Retry** and **Back to destinations** |
| Waiting for signal | "Getting your location..." |

No fake location is shown when permission or location services are missing.
The page explains before asking, so the location prompt does not overlap the camera permission prompt.

## Location service

`src/services/location.service.ts`:

- `checkPermission()` and `requestPermission()` return `{ state: 'granted' | 'prompt' | 'denied', precise }`.
- `getCurrentLocation()` reads one high-accuracy fix.
- `startLocationWatch(callback, onError)` uses `watchPosition` with high accuracy and a 1 s interval.
  Only one watcher can be active. Starting again clears the previous one.
- `stopLocationWatch()` clears it. A generation counter drops late callbacks and clears watchers that
  finish starting after a stop.
- Plugin error codes are mapped to app errors:
  - `OS-PLUG-GLOC-0003` → permission denied
  - `0007`, `0009`, `0016`, `0017` → location services disabled
  - `0010` → timeout
  - anything else → unavailable

The watcher is cleared when leaving the page, on unmount, when the entrance is reached, when going back to
destinations, and when the app is backgrounded.

## Coordinate model

```ts
interface UserLocation {
  latitude: number;
  longitude: number;
  accuracy: number;      // meters
  speed?: number | null; // m/s
  timestamp: number;
}

interface OutdoorTarget {
  name: string;               // e.g. "Administration Building Entrance"
  latitude: number | null;    // null until surveyed
  longitude: number | null;   // null until surveyed
  arrivalRadius: number;      // meters, per destination
}
```

`toUserLocation()` converts plugin results and drops readings with invalid coordinates or accuracy.

The final destination (for example Registrar Office) is separate from the outdoor GPS target
(Administration Building Entrance). GPS only ever reports reaching the entrance.

### TEST coordinates

No MINSU coordinates were invented. Every `outdoorTarget` has `latitude: null` and `longitude: null`, marked
`TEST: replace with surveyed coordinate`. Until real values are added:

- **REAL GPS:** tap **Place Test Target**. A TEST target is placed 30 m ahead of the current position, in the
  direction the phone faces. It is labeled `TEST target` on screen and `(TEST)` in debug.
- **SIMULATED GPS:** the target is the deliberately fake point 0°, 0° in the ocean. The simulated user starts 40 m away.

Once surveyed values are entered, the target is used directly. No Place Test Target step and no Set Forward are needed outdoors.

## Haversine distance

```
a = sin²(Δφ/2) + cos φ1 · cos φ2 · sin²(Δλ/2)
d = 2R · atan2(√a, √(1−a)),  R = 6,371,000 m
```

`calculateDistance(userLat, userLng, destLat, destLng)` returns meters and throws `RangeError` on invalid coordinates.

## Bearing

```
θ = atan2(sin Δλ · cos φ2, cos φ1 · sin φ2 − sin φ1 · cos φ2 · cos Δλ)
```

`calculateBearing(...)` returns degrees in [0, 360). 0 = North, 90 = East, 180 = South, 270 = West.

## Accuracy handling

| Constant | Value | Meaning |
| --- | --- | --- |
| `GOOD_GPS_ACCURACY` | 15 m | Good fix |
| `POOR_GPS_ACCURACY` | 30 m | Worse shows "Improving GPS accuracy..." |
| `MAX_ACCEPTED_GPS_ACCURACY` | 60 m | Worse is ignored for guidance, kept as raw debug data |
| `ARRIVAL_MAX_ACCURACY` | 20 m | Worse never counts toward arrival |
| `MAX_PLAUSIBLE_SPEED_MPS` | 7 m/s | Faster jumps (beyond both accuracy radii) are rejected |
| `MAX_CONSECUTIVE_REJECTS` | 3 | After 3 rejected jumps in a row the new position is accepted |

Filtering in `processLocation()`:

1. Drop readings with very poor accuracy.
2. Drop stale readings (older than the last accepted fix).
3. Reject impossible jumps.
4. Smooth position with an accuracy-weighted blend (weight 0.3 to 0.85 toward the new fix).

The raw reading is always kept and shown in debug.

## Compass integration

Outdoors, the required heading is the GPS bearing to the target:

```
offset = shortestSignedDelta(phoneHeading, gpsBearing)
```

- |offset| ≤ 25° (`FACING_TOLERANCE_DEGREES`): "Continue toward Administration Building"
- offset > 25°: "Turn right to face the path"
- offset < −25°: "Turn left to face the path"

The overlay arrows shift and lean with the same offset as before. Set Forward is not used outdoors.
It is still used for the fixed indoor route and for debug.

The compass reports magnetic north and GPS bearings use true north. Declination around Mindoro is
small (about 1°), so no correction is applied.

## Arrival radius

Each `outdoorTarget` has its own `arrivalRadius`, currently 10 m as a starting value, not a final value.

Arrival requires all of these:

- distance ≤ arrival radius
- accuracy ≤ `ARRIVAL_MAX_ACCURACY`
- at least `ARRIVAL_STABLE_UPDATES` (3) consecutive good fixes inside the radius
- at least `ARRIVAL_STABLE_MS` (2 s) since the first of them

Leaving the radius resets confirmation. Inaccurate readings inside the radius hold progress without adding to it.

## Outdoor-to-indoor transition

1. Stable arrival stops the GPS watcher.
2. Alert: "You have reached Administration Building." / "Continue to Registrar Office."
3. **Continue** switches the page to INDOOR mode with the existing fixed route for that destination.
4. The camera keeps running. Indoors, Set Forward calibrates the route and turns complete by heading alignment.
5. Final alert: "You have reached Registrar Office." **Done** returns to the destination list.

## Debug panel

Outdoors the panel shows:

- Navigation Mode, GPS Source, Location Status
- Latitude and Longitude (filtered), and the Raw reading
- GPS Accuracy, GPS Speed
- Target and its source, Destination Latitude and Destination Longitude
- Distance, GPS Bearing, Phone Heading, Heading Offset
- Arrival Radius, Arrival Status, Last Rejected Fix

Outdoor debug buttons:

- **Use Simulated GPS / Use Real GPS**
- **Place Test Target** (REAL GPS, unsurveyed targets only)
- **Sim Walk 3 m** (walks in the phone heading, or toward the target if no compass)
- **Sim Accuracy 5 m / 40 m**
- **Reset**

Indoors the Phase 2 panel and buttons are unchanged.

## Testing

Automated (`npx vitest run`):

- Haversine and bearing against known values, including the 0/90/180/270 directions
- coordinate validation
- TEST and surveyed target handling
- GPS heading instructions
- poor-accuracy, stale and jump rejection, and smoothing
- stable arrival, no arrival on inaccurate readings, and confirmation reset when leaving the radius
- plugin result and error mapping
- indoor route behavior from earlier phases

Manual, SIMULATED GPS:

1. Open a destination, then tap **Use Simulated GPS**. The yellow `SIMULATED GPS` chip appears.
2. Rotate until the instruction says "Continue toward ...", then tap **Sim Walk 3 m** repeatedly.
3. Distance drops. Arrival Status goes `outside radius` → `confirming (n/3)` → `arrived`.
4. Toggle **Sim Accuracy 40 m** to see "Improving GPS accuracy..." and confirm arrival does not trigger.
5. Tap **Continue**, then finish the indoor route with Set Forward and Move Forward.

Manual, REAL GPS (outdoors, open sky):

1. Allow location. Wait for accuracy of about 15 m or better.
2. Face an open path and tap **Place Test Target**. Distance shows about 30 m.
3. Walk toward it, following the arrows. Distance should fall as you walk.
4. Within about 10 m, hold still for a few seconds. The entrance alert appears.
5. Test denial (deny the prompt) and Location Services off (turn off Location, tap Retry).

## Limitations

- Entrance coordinates are TEST placeholders until surveyed. The app cannot guide to the real MINSU entrances yet.
- Guidance is straight-line toward the entrance. It does not follow walkways and can point across buildings or grass.
- Phone GPS is usually 3 to 15 m outdoors and worse near buildings and trees. The 10 m radius may need tuning per entrance.
- The compass can be disturbed by metal and electronics. Heading assumes portrait orientation.
- Magnetic declination is not corrected.
- Indoor guidance is still a fixed test route with simulated distance (Move Forward).
- The overlay is a 2D screen guide. It is not world-anchored AR.

## Next phase

- Survey the real entrance coordinates and arrival radii for each building, and replace the TEST placeholders.
- Tune accuracy thresholds and arrival radius from field tests on the vivo Y30.
- Then consider walkway path-following and a Camera/Map toggle that reads the same outdoor state.

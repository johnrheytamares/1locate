# Automatic indoor distance recording

Indoor meters are estimates from detected steps multiplied by a measured calibration stride. Outdoor recording remains GPS based. Neither GPS nor the camera determines the indoor floor. Camera overlays are visual references, not spatial AR.

## Install and build

Apply `supabase/migrations/20261110100000_indoor_journeys.sql` to the shared Supabase project after the existing schema. Apply `20261110090000_outdoor_recordings.sql` too if outdoor recordings are not deployed yet. Back up the database before deployment. These migrations have not been applied to a live database during this implementation.

The new indoor column is additive. Existing same-floor routes keep the legacy format; floor journeys use version 2 and clear the legacy array so older apps cannot interpret stairs as walking meters. Update admin and mobile together for floor journeys. Mobile catalogue loading retries without the new column on older deployments; the updated admin requires the migration.

In `admin/`, run:

```powershell
npm.cmd run build -- --configLoader runner
npx.cmd cap sync android
npx.cmd cap open android
```

Build the Android app in Android Studio with JDK 21 and the configured Android SDK. Debug APK: `admin/android/app/build/outputs/apk/debug/app-debug.apk`. The native IndoorSteps plugin is registered in MainActivity; rebuild the APK after native changes. A browser refresh cannot install this plugin.

For the mobile app, run the same build/sync/open commands from the repository root. No ARCore dependency is required. Do not uninstall an existing app merely to resolve a signing mismatch without backing up and explicitly accepting data loss.

## First calibration

1. Select a linked destination and physically reach its building entrance.
2. Mark a known, measured straight path (for example 10 meters).
3. Open step calibration, enter that measured length, and start counting. Allow Physical activity permission on Android. For a hardware counter, stand still until the baseline-ready message appears.
4. Walk the measured path normally with the phone held as it will be used during recording. Finish calibration and check the detected step count against the actual walk.
5. Confirm the count and save. The stride is measured length divided by detected steps; it is stored on this device for this admin and sensor method. Repeat calibration if the count is wrong or the phone/holding position changes.

Hardware step detector is preferred, then the cumulative hardware counter. Counters can report in batches. If neither exists, supported real motion samples use a conservative cadence filter; this is an estimate and can miss short walks. Shaking rejection is not a guarantee of accuracy. Camera availability is independent of step sensors. Unsupported or denied sensors show a limitation and allow measured manual distances; no timer or simulated movement generates meters.

## Record

Start Recording, walk, tap Left or Right at an actual turn, and Finish Route at the room. Each turn finalizes the preceding section; repeated Straight taps do not split an already straight section. Review distances before saving. Preserve a door/landmark boundary with the checkpoint checkbox before merging straight sections. Manual distance edits are tagged manual.

Pause stops camera and sensor services. Resume creates a fresh sensor baseline, preserving recorded distance and excluding movement during the pause. Cancelling, leaving the editor, finishing, signing out and backgrounding stop tracking. A draft is recovery data, not a published route.

For a floor change, select the actual starting floor, tap Change floor, choose stairs/elevator and target floor, then physically reach and confirm that floor. Floor actions and floor arrivals store zero meters. Walking resumes only after confirmation. Finish at the destination floor. Review all transitions on site before marking the journey validated. Saving leaves the destination inactive; publish through its existing activation control after verification.

The mobile app retains Destination Details, outdoor guidance and explicit entrance confirmation. Version 2 journeys open a separate indoor checkpoint guide. Steps estimate progress within walking sections; reaching zero meters never skips a staircase, floor confirmation or final destination confirmation. Existing same-floor navigation remains supported.

## Verification

Automated checks cover calibration validation, sensor baseline/reset, sensor session ownership, conservative motion pulses, straight merging, floor sequence validation, route saving and mobile catalogue compatibility. Admin: 186 tests passed. Mobile: 222 tests passed, followed by 28 passing catalogue tests including the new floor-journey case (223 total cases). Both production builds passed.

Still required on physical Android: measured walks with step detector and counter, denied permissions, camera denied with working steps, pause/move/resume, backgrounding, turns, floor arrival, save/reload and complete mobile navigation. Compare estimated distance with tape-measured ground truth. No connected-device accuracy claim is made. Live migration, RLS and round-trip Supabase verification remain deployment checks.

References: [Android motion sensors](https://developer.android.com/develop/sensors-and-location/sensors/sensors_motion), [Capacitor Android plugins](https://capacitorjs.com/docs/plugins/android).

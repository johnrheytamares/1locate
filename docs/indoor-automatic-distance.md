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


## Walking sensor repair and real-device verification

Both Android APKs now register IndoorSteps. Build and install updated admin AND student APKs after native changes. The active method appears during admin calibration as Hardware Step Detector, Hardware Step Counter, Motion Estimate or Sensor Unavailable. Hardware counters may deliver batched updates: stand still for the initial baseline and let the count settle at the measured path end. Denied hardware permission does not silently switch to accelerometer estimation.

The admin and student applications share the pulse classifier and native session transport. The native accelerometer fallback initializes gravity from an actual sample and filters using elapsed sensor time. Browser fallback supports both linear and gravity-only acceleration. Duplicate/out-of-order sample timestamps are ignored. Motion cadence now permits slow walks up to 1600 ms between strides; the four-pulse rhythm guard and amplitude bounds remain conservative pending actual phone traces. No universal sensitivity or shake-proof accuracy is claimed. Rhythmic shaking can mimic walking using accelerometer data alone; use measured manual distances if the fallback does not match normal steps. Hardware counters/detectors also require real-device validation.

Admin calibration belongs to that admin device and sensor method. It never changes the student phone's personal stride. Student estimates no longer require precise compass alignment while walking an established section, but pause, entrance and turn checkpoints remain in force. No timer produces steps or meters.

To collect actual test evidence, enable Capture a local sensor trace in calibration, choose the activity label, and export after finishing. Samples stay in memory (bounded to 30000), export only when requested and are not uploaded. Record manually counted steps, phone model/Android version, hand-held/waist position and measured distance separately. Capture each of: normal walk, slow walk, standing 15 seconds, rotating while stationary, shaking while stationary, pause/resume and straight/turning walks. Review sensor method and compare counts. An exported trace alone is not proof of accurate position. Hardware export contains event counts; motion export contains magnitude and sensor timestamps. Do not mix these with synthetic unit test data.

Automated tests use explicitly synthetic pulses, gravity and counter events; there were no recorded Android motion traces in this checkout. ADB had no connected device during implementation, so physical walking/shaking validation and per-phone threshold tuning remain pending. Existing Supabase schema and offline route data formats are unchanged by this repair. No new SQL migration is needed.


## Student sensor reliability check

The student indoor guides now require this phone's measured walking check before sensor events can reduce route distance. Without a matching checked profile, sensor events are observed for diagnostics only and manual physical checkpoints remain available. Old scalar stride values and admin calibration do not qualify a student phone.

Open Walking sensor & calibration. Measure a 5–100 m straight path; walk normally and count steps independently, then enter the independent count. At least eight detected steps and agreement within 10% (one-step minimum tolerance) are required. Then run standing, rotating-in-place and shaking-in-place checks, each for at least 15 seconds. None of these checks advances navigation. Any credited test step while stationary fails the check. Save only after all checks, then physically return to the route entrance and restart guidance. Step counters may deliver delayed batches; let them settle. Use checkpoints if the sensor misses ordinary walking or produces shaking events. A passing check is a local screening result, not proof of motion or correct hallway position. Report unreliable steps immediately to disable estimates and clear the local check.

Diagnostics distinguish active sensor, raw sensor callback events, detected step candidates, steps credited to navigation, tracking state and estimated meters. Native samples include actual sensor name/vendor/timestamp for troubleshooting. The plugin rejects duplicate/out-of-order events and uses timestamp-based gravity removal when only raw acceleration exists. Neither timers nor arbitrary acceleration samples produce distance.

Required real-device matrix (NOT executed here): two different Android phones; front-held, waist-held and pocket walking; slow/normal pace; 15 seconds standing, rotating and shaking; pause/resume; straight routes and turns. Record phone model/OS, active sensor, independently counted steps, raw events, credited steps and measured/estimated meters. No Android device was connected to ADB during this repair, so no real motion traces were used to tune sensitivity, and no claim of shake-proof classification is made. Step sensors alone cannot establish indoor position.

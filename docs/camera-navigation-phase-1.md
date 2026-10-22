# Camera navigation phase 1

1Locate's first navigation screen is a live rear-camera view with a blue path drawn on top. It is a camera overlay. The arrows are not locked to the floor, and the app does not use ARCore.

## Why ARCore was replaced

The available test phone is a vivo Y30. Google does not certify that model for ARCore, and the phone reports a simulated gyroscope. ARCore refuses to start, so a floor-anchored path cannot be tested there.

The app no longer depends on ARCore. The ARCore library, the Kotlin AR module, and the ARCore manifest entries were removed. The camera permission remains.

## Architecture

```text
ARNavigationPage.vue
  camera.service.ts          rear preview behind the WebView
  orientation.service.ts     compass heading when the sensor exists
  navigation.service.ts      test route, step, distance, instruction
  NavigationOverlay.vue
    NavigationArrow.vue
    DestinationMarker.vue
```

Later, GPS, a QR starting node, or a calculated route can replace the test data in `navigation.service.ts` without changing the camera page.

Outdoor and indoor positioning are not implemented. The intended later flow is:

```text
GPS or campus map
  -> building entrance
  -> QR scan for a known indoor node
  -> route calculation
  -> this camera screen
  -> voice guidance
  -> destination reached
```

## Camera plugin

`@capacitor-community/camera-preview` 8.0.2. Version 8 of that plugin requires Capacitor 8, which matches this project's Capacitor 8.5.3.

`CameraPreview.start({ position: 'rear', toBack: true })` keeps the preview running behind the Ionic page. The header, arrows, and bottom card stay in HTML. `@capacitor/camera` was not used because it only captures a still photo.

## How the overlay works

`TEST_ROUTE` is five steps of 2 meters: straight, straight, straight, right, straight. The total is 10 meters.

The overlay draws arrows for the current stretch only. A straight run shows those straight arrows. The turn arrow appears when that turn is the next step, together with "Turn right ahead" or "Turn left ahead". Arrows beyond the turn stay hidden. The turn advances after the phone holds the new heading inside the 25° tolerance for about 750 ms. Move Forward cannot skip a turn.

After Set Forward, the arrow column slides sideways by the heading offset. A small lean shows which way the path sits relative to the phone. The instruction banner stays centered. The arrows are still a screen overlay. They do not lock to the floor.

Debug buttons change that state:

- Set Forward saves the phone heading as the path's forward direction
- Move Forward subtracts 1 meter
- Next Instruction finishes the current step
- Turn Right jumps to the right-turn step
- Reset returns to 10 meters and clears the saved forward heading

Before Set Forward, the instruction is "Point your phone toward the path and tap Set Forward." Left and right facing instructions stay hidden until that heading is saved.

At 0 meters the page shows "You have reached your destination." and a Done button.

## Orientation

`watchHeading()` listens for `deviceorientationabsolute` when the browser provides it, otherwise `deviceorientation`. Readings are smoothed with a short circular average so a step from 359° to 1° does not swing the long way around. Headings are kept in the range `0 <= heading < 360`.

Set Forward stores that heading as `forwardHeading`. Straight steps use it as the required heading. The right-turn step uses `forwardHeading + 90`, wrapped back into the same range. The heading offset is the shortest signed difference from the phone heading to the required heading, in the range -180° to +180°. Positive means the path is clockwise, so the instruction says to turn right.

`FACING_TOLERANCE_DEGREES` is 25. Inside that window the route instruction stays ("Follow the blue path", "Continue straight", "Turn right ahead", or "Turn right"). Outside it, the instruction becomes "Turn left to face the path" or "Turn right to face the path".

The debug list shows Phone Heading, Forward Heading, Required Heading, Heading Offset, Current Route Step, Current Direction, and Distance. If no compass reading arrives, Phone Heading and Heading Offset say "unavailable", the arrow column stays fixed, and the page still runs.

## Files created

- `src/views/ARNavigationPage.vue` was rewritten for this approach
- `src/components/navigation/NavigationOverlay.vue`
- `src/components/navigation/NavigationArrow.vue`
- `src/components/navigation/DestinationMarker.vue`
- `src/services/camera.service.ts`
- `src/services/orientation.service.ts`
- `src/services/navigation.service.ts`
- `src/models/navigation.ts`
- `docs/camera-navigation-phase-1.md`

## Files modified

- `package.json` and `package-lock.json` add the camera preview plugin
- `src/views/HomePage.vue` button label
- `android/app/build.gradle` removes Kotlin and ARCore
- `android/build.gradle` removes the Kotlin Gradle plugin
- `android/variables.gradle` removes the ARCore version
- `android/app/src/main/AndroidManifest.xml` removes the ARCore feature and metadata
- `android/app/src/main/java/io/ionic/starter/MainActivity.java` no longer registers the AR plugin

## Files removed

- `android/app/src/main/java/io/ionic/starter/ar/`
- `src/plugins/ar-navigation.ts`
- `src/plugins/ar-navigation-web.ts`

## Destination routes

The app opens on a destination list. Choosing one loads that place's fixed route into the camera screen. The route can contain outdoor steps and indoor steps. The camera stays open when the current step changes from outdoor to indoor. Progress is still simulated with the debug buttons.

Set Forward still calibrates the first direction. Straight steps use that heading. A right step adds 90°. A left step subtracts 90°. Later, outdoor bearing can come from the route geometry and indoor bearing can come from route nodes, through `requiredHeading()`.

## How to test

1. Open the app. The destination list should appear.
2. Search for Library. The other places should drop out.
3. Open **Registrar Office** and tap **Navigate**. Allow the camera.
4. Point along the path and tap **Set Forward**.
5. Tap **Move Forward** until Route Mode changes from OUTDOOR to INDOOR. The camera should stay on.
6. Continue until the distance is 0. The alert should say you have reached Registrar Office.
7. Tap **Done**. The destination list should return.
8. Choose another destination and confirm its distance and turn direction differ.

## Limitations

- The arrows do not stay fixed on the floor when the phone moves.
- Distance changes only when a debug button is used. GPS does not move the route yet.
- Outdoor and indoor steps are fixed sample data. They are not calculated from a map or from building nodes.
- The sideways shift shows where the path is relative to the phone. It is not a world anchor.
- There is no satellite map, GPS route, voice prompt, or login.

## Next step

Done in Phase 3. See `docs/gps-outdoor-phase-3.md`. The outdoor part of each route now uses real GPS to the building entrance, and the fixed routes are indoor only.

Original plan: add GPS outdoor positioning. The camera and arrows stay the main navigation view. GPS should supply the current location, the outdoor distance, and the bearing that replaces Set Forward. A satellite map can be added later as an overview, without resetting the route.

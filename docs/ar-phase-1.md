# 1Locate AR Phase 1

This ARCore experiment was replaced. The vivo Y30 used for testing is not an ARCore phone, so the current prototype is the camera overlay described in `docs/camera-navigation-phase-1.md`. The notes below describe the earlier ARCore attempt only.

Phase 1 is a real ARCore prototype for Mindoro State University's 1Locate app. It opens the phone camera, finds a horizontal floor, and anchors a fixed test path to that floor. It does not calculate a campus route.

## Architecture

```text
Ionic Vue
  ARNavigationPage.vue
        |
        |  Capacitor plugin "ARNavigation"
        v
ARNavigationPlugin.kt
        |
        v
ARSceneView.kt          live camera, ARCore session, plane hit tests
  ARPathRenderer.kt     floor ribbon plus one arrow per segment
    ARArrowRenderer.kt
    ARDestinationRenderer.kt
        |
        v
ARCore 1.56.0
```

The ARCore view is inserted behind the Capacitor WebView inside the existing `MainActivity`. The Vue page keeps the header and the bottom card opaque. The center of the page is transparent, so the live camera shows through. This keeps the Ionic controls on screen while the path is tracked in ARCore world space.

The path is not a camera overlay. Each arrow is drawn with the anchor pose from ARCore, so it stays on the floor when the phone moves.

## Files created

- `src/views/ARNavigationPage.vue`
- `src/plugins/ar-navigation.ts`
- `src/plugins/ar-navigation-web.ts`
- `android/app/src/main/java/io/ionic/starter/ar/ARNavigationPlugin.kt`
- `android/app/src/main/java/io/ionic/starter/ar/ARSceneView.kt`
- `android/app/src/main/java/io/ionic/starter/ar/ARPathRenderer.kt`
- `android/app/src/main/java/io/ionic/starter/ar/ARArrowRenderer.kt`
- `android/app/src/main/java/io/ionic/starter/ar/ARDestinationRenderer.kt`
- `android/app/src/main/java/io/ionic/starter/ar/ARGl.kt`
- `docs/ar-phase-1.md`

## Files modified

- `src/router/index.ts` adds `/ar-navigation`
- `src/views/HomePage.vue` adds one button that opens the prototype
- `android/app/src/main/java/io/ionic/starter/MainActivity.java` registers the local plugin
- `android/app/src/main/AndroidManifest.xml` adds the camera permission and optional ARCore feature
- `android/build.gradle` adds the Kotlin Gradle plugin
- `android/app/build.gradle` applies Kotlin and the ARCore dependency
- `android/variables.gradle` records the ARCore and Kotlin versions

## Dependencies added

| Dependency | Version | Why |
| --- | --- | --- |
| `com.google.ar:core` | 1.56.0 | Current ARCore Android library. It supports minSdk 24. |
| `org.jetbrains.kotlin:kotlin-gradle-plugin` | 2.3.0 | Kotlin 2.3.0 is the release whose compatibility table includes Android Gradle Plugin 8.13.0 and Gradle 8.14. |
| `org.jetbrains.kotlin:kotlin-stdlib` | 2.3.0 | Kotlin standard library for the native module. |

The app module targets Java 21. Capacitor 8 writes that target into the generated `android/app/capacitor.build.gradle`. Kotlin is set to the same JVM target.

SceneView was not added. Its current release targets Jetpack Compose and a newer Kotlin line than Android Gradle Plugin 8.13 is documented to support. The prototype renders with ARCore and OpenGL ES 3.0 instead.

No existing Ionic, Vue, or Capacitor dependency was removed.

## How Ionic talks to ARCore

`src/plugins/ar-navigation.ts` registers a Capacitor plugin named `ARNavigation`. On Android that name matches `@CapacitorPlugin(name = "ARNavigation")`.

Methods:

- `startAR()` requests the camera permission, checks ARCore, then starts the session
- `stopAR()` pauses and closes the session and restores the WebView
- `setTestRoute({ x, y })` hit-tests the screen point against the detected floor and anchors the test path

`x` and `y` are Android view pixels (`CSS pixels × devicePixelRatio`).

Events:

- `planeDetected`
- `routePlaced`
- `distanceChanged` with `{ meters }`
- `destinationReached` with `{ meters }`
- `arError` with `{ message }`

In a desktop browser the web implementation rejects `startAR()` instead of pretending the camera is AR.

## Floor detection

1. The page calls `startAR()`.
2. The plugin requests `CAMERA` if it is not granted.
3. ARCore availability is checked. If Play Services for AR is missing or outdated, the plugin asks ARCore to install or update it.
4. The session is configured for horizontal plane finding only.
5. The camera image is drawn from the ARCore camera texture.
6. Tracking horizontal planes are drawn as a light blue floor highlight.
7. Until a plane is tracking, the page says: "Move your phone slowly and point it toward the floor."
8. A tap on the floor, or the Place path button, hit-tests that point. The hit pose becomes an ARCore anchor. That anchor is the origin of the test route.

## How the test route is rendered

The anchor's local axes follow ARCore: +Y is up, and -Z points away from the phone at the moment of the tap. The route is lifted about 2 cm above the floor so it does not flicker against the plane.

| Point | Local position |
| --- | --- |
| Start (tap) | x = 0, z = 0 |
| Arrow segment 1 | x = 0, z = -1 |
| Arrow segment 2 | x = 0, z = -2 |
| Arrow segment 3 | x = 0, z = -3 |
| Turn | x = 1, z = -4 |
| Destination | x = 2, z = -4 |

Five flat cyan arrows sit on the segment midpoints and point toward the next point. A wider translucent ribbon connects them. The last point has an amber floor marker, a short pin, and a label that reads "Test Destination".

Distance is the horizontal distance, in meters, from the ARCore camera to that destination. The bottom card updates as the phone moves. Reaching about 0.8 m fires `destinationReached`.

## How to test on a real Android phone

The Android emulator does not provide a dependable ARCore floor test. Use a phone that supports Google Play Services for AR.

You need JDK 21 and Android SDK platform 36. Android Studio provides both. The first sync also creates the generated Capacitor Android files this project was missing.

From `1locate/`:

```bash
npm run build
npx cap sync android
npx cap open android
```

In Android Studio, run the `app` configuration on the phone. Then:

1. Open **Open AR Navigation** on the home page.
2. Tap **Start AR** and allow the camera.
3. Move the phone slowly over a textured floor until the blue floor highlight appears.
4. Tap the floor, or tap **Place path**.
5. Walk a short distance. The arrows should stay on the floor, the path should include one right turn, and the distance should decrease.
6. Press back. The camera should close and the app should return to the previous page without crashing.

## Known limitations

- The route is a fixed test path. It is not a Mindoro State University room route.
- The camera view depends on the WebView center being transparent. The header and footer stay opaque on purpose.
- Tracking needs light and a floor with some visual texture. A blank, dark, or shiny floor may never produce a plane.
- Distance is horizontal distance to the marker, not walking distance along the arrows.
- The destination label does not change its baked text when the live distance changes. The live value is the bottom card.
- There is no iOS ARKit build in this phase.
- Login, Supabase, the campus map, voice guidance, and pathfinding are intentionally absent.

## Next recommended step

Keep this prototype on a phone until the path stays locked to the floor while walking, including the turn. After that, replace `TestRoute` with a path supplied by the Ionic page, still anchored at a floor hit, before adding campus data or navigation search.

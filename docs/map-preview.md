# Satellite destination preview

The mandatory Destination Details page opens a separate full-screen MapTiler Satellite Hybrid preview. Start Navigation then initializes the existing camera guide. See `docs/navigation-flow.md` for the six-screen flow. The red marker is the saved building entrance; the blue marker and accuracy circle come from device GPS. No walking route or indoor position is inferred from the aerial image.

## Configuration

Set `VITE_MAPTILER_API_KEY` in the mobile app `.env` and restart Vite. For GitHub-built APKs, set the repository Actions secret with the same name; the mobile build workflow passes it to Vite. Never commit `.env`. Vite client keys are included in the application bundle, so use a dedicated MapTiler key and configure allowed origins after checking the actual web and Android WebView requests. Do not guess restrictions from the Android package name. Keep the MapTiler logo and imagery attribution visible.

Destination pins require valid saved `outdoorTarget.latitude` and `longitude`. These are the building entrance coordinates, not indoor room coordinates. Missing coordinates show an explicit notice; no campus coordinates are fabricated. The initial world view when both positions are unavailable is not a destination marker.

## Verification on browser and Android

1. Select a destination with a surveyed entrance. Verify satellite tiles and attribution load; check the red pin against the actual entrance.
2. Grant location permission. Verify the blue marker, accuracy circle, and Recenter button. Pan the map and verify subsequent fixes do not continually reset the viewport.
3. Deny permission or disable GPS. Confirm a useful location message appears while the destination remains visible.
4. Test a destination without coordinates, offline loading, and an invalid or restricted map key. Confirm no fake pin appears and Retry map is available.
5. Start Navigation. Confirm the camera starts on the guide screen and the preview watcher stops. Return to the preview and check tracking restarts.
6. Background and resume the app. Confirm location tracking pauses and a fresh reading is requested on resume.

The preview owns its Geolocation watch ID independently from the navigation service. Late-starting watches are cleared after leaving. Production builds package the MapLibre worker locally for Capacitor.

The imagery needs internet access and remains subject to MapTiler plan limits. The existing camera guide is a screen overlay, not world-anchored AR.

# Indoor navigation: scope, limitations, and recovery

## What indoor guidance does

Each destination has one fixed indoor route (a list of straight, left, and right steps with
distances). Guidance follows that list from the destination's designated building entrance.

1. Outdoor GPS guides the user to the entrance.
2. The app asks "Are you at <entrance>?". The indoor route starts only after the user taps
   **Start indoor route**.
3. The route does not move until the user points the phone along the path and taps **Set Forward**.
4. Progress then follows the route steps. Turns complete when the phone faces the turn direction.

## What it cannot do

- **GPS near the entrance is not an indoor position.** It only shows the user is close to the
  building. It cannot tell which corridor or room they are in.
- **There is no continuous indoor positioning.** Route progress comes from the fixed step list and
  manual or estimated steps. The phone compass only measures which way the phone faces.
- **The app does not notice when the user leaves the route.** It cannot warn about a wrong turn and
  cannot plan a new path.
- **There is no automatic rerouting.** Directions are never generated from an unknown indoor
  position, and the user is never silently placed back on the route.

The Camera Navigation screen states this while indoors: "Fixed route from <entrance>. 1Locate cannot
see where you are inside the building, so it will not notice if you leave the route."

## Recovery: "I lost my way"

The **I lost my way** button is shown during indoor guidance until the destination is reached.

Selecting it:

1. Pauses guidance. Route progress, turn completion, and Set Forward are frozen, and the arrows are
   hidden. The instruction shows "Guidance paused".
2. Explains that 1Locate cannot tell where the user is inside the building.
3. Offers three choices:

| Choice | What happens |
| --- | --- |
| **Resume guidance** | Only for a user still standing where they paused. Continues from the same route position with the same Set Forward heading. |
| **Restart from entrance** | Asks the user to go back to the entrance. **I'm at the entrance** resets route progress to 0 and clears Set Forward, so Set Forward is required again. **Not yet** returns to the paused screen without changing anything. |
| **Choose another destination** | Clears the selected destination and its route state and returns to the destination list. |

The debug **Reset** button indoors (dev mode only) uses the same entrance confirmation.

Implementation: `pauseNavigation`, `resumeNavigation`, `restartFromEntrance`, and
`clearSelectedDestination` in `src/services/navigation.service.ts`; the screen is
`src/views/ARNavigationPage.vue`. Tests: `tests/unit/indoor-recovery.spec.ts`.

## Future work: automatic rerouting

Rerouting needs both of these, and neither exists yet:

1. A connected indoor navigation graph: corridors, junctions, and supported floor transitions
   (stairs, ramps), so a new path can be calculated.
2. A reliable way to know the user's current position in that graph, for example scanned markers at
   known points or another positioning method that has been tested on campus.

The fixed-route recorder, the phone compass, and step estimates do not provide either capability
and must not be presented as if they do.

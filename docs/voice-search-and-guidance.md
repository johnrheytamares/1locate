# Voice search and voice guidance

English only (`en-US`). Both features use the phone's own speech services through two Capacitor plugins:

| Feature | Plugin | Android requirement |
| --- | --- | --- |
| Voice search | `@capacitor-community/speech-recognition` 7.0.1 | Microphone permission and a speech recognition service (usually Google). Many phones need internet for recognition. |
| Voice guidance | `@capacitor-community/text-to-speech` 8.0.2 | A text-to-speech engine with English installed. |

The speech recognition plugin is published for Capacitor 7. It accepts Capacitor 8 as a peer, and the local
`assembleDebug` build with Capacitor 8.5.3 succeeds, but it has not been tested on a device yet.

## Voice search (Choose a Destination)

1. Tap the microphone next to the search bar. Any speech in progress stops first.
2. The first time, Android asks for the microphone. If it is refused, the screen explains how to allow it and the
   typed search still works.
3. Say the place, for example "Where is the registrar office", "Take me to the library", or "Room one oh one".
4. `src/services/voice-query.service.ts` removes filler words, turns spoken digits into room numbers, and matches
   the destination name, room number, building, and type. Small recognition slips are accepted ("registar").
   Room numbers must match exactly.
5. Results:
   - One clear match: the app says the name and opens its confirm screen. Navigation starts only when the user
     taps Start Navigation.
   - Several equally good matches (for example "Administration Building"): the list shows only those and the
     app asks the user to pick one. Typing in the search bar shows the full list again.
   - No match, silence, or a recognizer problem: a message on screen and out loud. Nothing is opened.

## Voice guidance (Camera Navigation)

The app speaks the same instruction the banner shows, only when it changes:

| On screen | Spoken |
| --- | --- |
| Follow the blue path | Go straight ahead. |
| Continue straight | Continue straight. |
| Turn right ahead / Turn left ahead | Turn right ahead. / Turn left ahead. |
| Turn right/left to face the path | Same words, after the direction stays the same for 1.5 s |
| Continue toward (building) | Continue toward (building). |
| Point your phone toward the path and tap Set Forward. | Point your phone along the path, then tap Set Forward. |
| Guidance paused | Guidance paused. 1Locate cannot tell where you are inside the building. Choose resume, restart from the entrance, or another destination. |
| You have reached (place). | You have reached (place). |

- Reaching the outdoor entrance is announced with a reminder to start the indoor route only at the entrance.
- "Face the path" corrections wait 1.5 s so compass jitter does not cause chatter.
- The speaker button in the header mutes or unmutes. The choice is saved on the phone.
- Speech stops when the screen closes or the app goes to the background, and the current instruction is spoken
  again when the user returns.
- Voice guidance reads the fixed-route instructions. It adds no positioning: indoors the app still does not
  know where the user is, and it never says the user left the route
  (see [indoor-navigation-scope.md](indoor-navigation-scope.md)).

## Device test checklist (pending)

- [ ] First microphone tap shows the Android permission prompt; refusing shows the Settings message.
- [ ] "Where is the registrar office" opens the Registrar confirm screen and speaks the name.
- [ ] "Administration building" lists Registrar Office and Cashier.
- [ ] Airplane mode: voice search shows a clear message (recognizer may need internet).
- [ ] Guidance speaks Set Forward, straight, turn, and arrival instructions once each.
- [ ] Turning the phone slightly back and forth does not repeat "face the path" constantly.
- [ ] Mute stays off after closing and reopening the app.
- [ ] Pressing Home stops speech; returning speaks the current instruction.

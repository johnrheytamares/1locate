# User-provided campus coordinates (draft)

Converted from the DMS coordinates provided in chat. These values have not been independently surveyed or written to live Supabase. Latitude is first, longitude second. Decimal precision represents conversion, not positional accuracy.

| Location | Latitude | Longitude | Floor |
| --- | ---: | ---: | --- |
| Main Entrance | 13.38636111 | 121.16330556 | Not specified |
| ITRM_108 | 13.38788889 | 121.16222222 | Not specified |
| ITRM_107 | 13.38791667 | 121.16222222 | Not specified |
| ITRM_106 | 13.38797222 | 121.16211111 | Not specified |
| ITRM_101 | 13.38797222 | 121.16172222 | Not specified |
| ITRM_102 | 13.38800000 | 121.16175000 | Not specified |
| Faculty Office | 13.38808333 | 121.16177778 | Not specified |
| IT Building Entrance | 13.38822222 | 121.16169444 | Not specified |
| ITRM_104 | 13.38819444 | 121.16172222 | Ground Floor |
| CSG Office | 13.38819444 | 121.16166667 | Ground Floor |
| ITRM_105 | 13.38822222 | 121.16163889 | Ground Floor |
| ITRM_202 | 13.38819444 | 121.16163889 | Second Floor |
| ITRM-201 | 13.38816667 | 121.16172222 | Second Floor |
| IT Building Stairs | 13.38816667 | 121.16166667 | Not specified |

## How this is used

- `campus-location-draft.json` preserves all 14 points, original DMS components, marker groups and supplied floor labels. It is a data reference, not a database migration or an active destination catalog.
- `../public/campus-walking-network.json` now contains only the Main Entrance and IT Building Entrance as unverified outdoor draft nodes. There are no invented connections or distances; Dijkstra remains inactive for this draft.
- Main Entrance is the campus gate. IT Building Entrance is the user-confirmed blue marker outside image 3. Do not use the campus gate as the indoor start for every room.
- For rooms confirmed to belong to IT Building, outdoor GPS should target its actual building entrance. Room points are references, not substitutes for the building entrance or indoor positioning.
- The building associations and door/access points for image 1 and image 2 must be checked before updating shared building coordinates. Floor labels for these images have not been supplied.
- In the existing Supabase navigation catalog, linked building coordinates can override destination entrance coordinates. Update the correct building entrance after matching the actual record; editing a destination field alone may not change the public result.
- Do not infer straight connections between these points through the buildings. Add every actual bend/junction along the white dashed pathway and supply measured walking distances.
- Second-floor rooms remain separate from ground-floor rooms. GPS does not detect floor level; use explicit stairs/landing instructions and checkpoint confirmation.
- No existing indoor routes, destination IDs, live database records, or installed APK were changed by this coordinate import.

Next: import the public draft JSON in Outdoor Walking Routes, add verified outdoor pathway junctions and measured connections, then preview and field-check the routes before export/publication. Keep indoor room/stair progress separate.

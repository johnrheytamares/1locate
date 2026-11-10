-- User-provided school coordinates. Manual seed, NOT an automatic migration.
-- Run the WHOLE file in Supabase SQL Editor after the Phase 4A migrations.
-- Creates/updates 14 coordinate labels; new labels and IT Building content are drafts.
-- Existing building publication state and existing indoor routes are retained.
-- Existing IT Building entrance coordinates ARE updated to the supplied entrance.
-- Image 1/2 building assignments are unknown: their points are saved as map labels only.
-- No invented distances, walking edges, floor-map images, or enabled empty routes.
-- This does NOT update the bundled public/campus-walking-network.json in installed APKs.

begin;

-- Fail before any writes if required schema migrations are missing.
do $preflight$
begin
  if to_regclass('public.buildings') is null or to_regclass('public.floors') is null
    or to_regclass('public.rooms') is null or to_regclass('public.map_labels') is null
    or to_regclass('public.destinations') is null then
    raise exception 'Apply the baseline and Phase 4A schema migrations first.';
  end if;
  if not exists (select 1 from information_schema.columns where table_schema = 'public'
    and table_name = 'destinations' and column_name = 'room_id') then
    raise exception 'Apply 20261030120300_destinations_transition.sql first.';
  end if;
end;
$preflight$;

-- Serialize this short import with other content writes, so repeat runs cannot race.
lock table public.buildings, public.floors, public.rooms, public.destinations, public.map_labels
  in share row exclusive mode;

create temporary table campus_coordinate_seed (
  source_id text primary key, name text not null, kind text not null, image_group text,
  floor_level smallint, floor_name text, latitude double precision not null,
  longitude double precision not null, label_id uuid not null
) on commit drop;

insert into campus_coordinate_seed values
  ('main-entrance', 'Main Entrance', 'campus_entrance', null, null, null, 13.38636111, 121.16330556, '374e281a-2eb3-56c6-8e18-ab4ab0e893a7'::uuid),
  ('itrm-108', 'ITRM_108', 'room', 'image_1', null, null, 13.38788889, 121.16222222, 'b17e6871-eb6a-5fa8-b7fc-c38dabb84312'::uuid),
  ('itrm-107', 'ITRM_107', 'room', 'image_1', null, null, 13.38791667, 121.16222222, 'c2dc5153-edec-5dab-9a87-74ecf0cd8273'::uuid),
  ('itrm-106', 'ITRM_106', 'room', 'image_1', null, null, 13.38797222, 121.16211111, '0c2c0177-54b8-53f0-835d-ad5dcaac5a02'::uuid),
  ('itrm-101', 'ITRM_101', 'room', 'image_2', null, null, 13.38797222, 121.16172222, '9851f48f-9320-5da9-babe-a15717065a56'::uuid),
  ('itrm-102', 'ITRM_102', 'room', 'image_2', null, null, 13.38800000, 121.16175000, '6c58ca0a-2a55-5080-8967-81926dc81abb'::uuid),
  ('faculty-office', 'Faculty Office', 'office', 'image_2', null, null, 13.38808333, 121.16177778, '65fdf981-34fe-5331-aa4b-7269d68285b4'::uuid),
  ('it-building-entrance', 'IT Building Entrance', 'building_entrance', 'image_3', null, null, 13.38822222, 121.16169444, 'f324055a-e344-5291-aec7-b77862c7ff45'::uuid),
  ('itrm-104', 'ITRM_104', 'room', 'image_3', 1, 'Ground Floor', 13.38819444, 121.16172222, '8284ee35-b29c-57c3-821a-c4bd9860c624'::uuid),
  ('csg-office', 'CSG Office', 'office', 'image_3', 1, 'Ground Floor', 13.38819444, 121.16166667, 'cb41ac82-5d54-5486-93de-828971273595'::uuid),
  ('itrm-105', 'ITRM_105', 'room', 'image_3', 1, 'Ground Floor', 13.38822222, 121.16163889, 'ff0f2e3c-fcdf-5d24-bd9b-8ea860c2470c'::uuid),
  ('itrm-202', 'ITRM_202', 'room', 'image_3', 2, 'Second Floor', 13.38819444, 121.16163889, '8594f15f-5b43-53f4-b0cb-fb2dc9759398'::uuid),
  ('itrm-201', 'ITRM-201', 'room', 'image_3', 2, 'Second Floor', 13.38816667, 121.16172222, 'cc3f31fe-b0e6-508d-a3c2-d2c1fd38ff18'::uuid),
  ('it-stairs', 'IT Building Stairs', 'stairs', 'image_3', null, null, 13.38816667, 121.16166667, '445712b5-7525-5038-aba7-4c017dc50735'::uuid);

do $seed$
declare
  it_id uuid;
  point record;
  floor_uuid uuid;
  room_uuid uuid;
  label_uuid uuid;
  label_building uuid;
  match_count integer;
  existing_floor uuid;
  floor_aliases text[];
  conflicting_floor_name text;
begin
  -- Match the actual building by name; do not silently create another IT Building.
  select count(*) into match_count from public.buildings
  where regexp_replace(upper(name), '[^A-Z0-9]', '', 'g')
    in ('ITBUILDING', 'ITBLDG', 'INFORMATIONTECHNOLOGYBUILDING');
  if match_count > 1 then
    raise exception 'Multiple IT Building records found. Resolve duplicate buildings before importing.';
  elsif match_count = 1 then
    select id into it_id from public.buildings
    where regexp_replace(upper(name), '[^A-Z0-9]', '', 'g')
      in ('ITBUILDING', 'ITBLDG', 'INFORMATIONTECHNOLOGYBUILDING');
  else
    if exists (select 1 from public.buildings where code = 'IT') then
      raise exception 'Building code IT already belongs to a differently named building. Match it manually before importing.';
    end if;
    insert into public.buildings(code, name, entrance_name, is_active)
    values ('IT', 'IT BUILDING', 'IT Building Entrance', false) returning id into it_id;
  end if;
  update public.buildings set entrance_name = 'IT Building Entrance',
    entrance_lat = 13.38822222, entrance_lng = 121.16169444
  where id = it_id;

  for point in select * from campus_coordinate_seed order by source_id loop
    -- Keep coordinate labels separate from route targets. New labels remain inactive.
    label_building := case when point.image_group = 'image_3' then it_id else null end;
    select count(*) into match_count from public.map_labels
    where id = point.label_id or regexp_replace(upper(name), '[^A-Z0-9]', '', 'g')
      = regexp_replace(upper(point.name), '[^A-Z0-9]', '', 'g');
    if match_count > 1 then
      raise exception 'Multiple map labels match %. Resolve duplicates before importing.', point.name;
    elsif match_count = 1 then
      select id into label_uuid from public.map_labels
      where id = point.label_id or regexp_replace(upper(name), '[^A-Z0-9]', '', 'g')
        = regexp_replace(upper(point.name), '[^A-Z0-9]', '', 'g');
      if exists (select 1 from public.map_labels where id = label_uuid and building_id is not null
        and label_building is not null and building_id <> label_building) then
        raise exception 'Map label % belongs to another building. Review its assignment first.', point.name;
      end if;
      update public.map_labels set latitude = point.latitude, longitude = point.longitude,
        building_id = coalesce(building_id, label_building) where id = label_uuid;
    else
      insert into public.map_labels(id, name, category, building_id, latitude, longitude, is_active)
      values (point.label_id, point.name,
        case point.kind when 'campus_entrance' then 'gate' when 'building_entrance' then 'building'
          when 'stairs' then 'facility' else 'landmark' end,
        label_building, point.latitude, point.longitude, false);
    end if;

    -- Only Image 3 room/building/floor relationships were explicitly confirmed.
    if point.image_group is distinct from 'image_3' or point.kind not in ('room', 'office') then
      continue;
    end if;Run npm run test

> 1locate-admin@0.1.0 test
> vitest run


 RUN  v4.0.18 /home/runner/work/1locate/1locate/admin

 ✓ tests/campus.spec.ts (23 tests) 21ms
 ✓ tests/auth.spec.ts (16 tests) 49ms
 ✓ tests/photos.spec.ts (21 tests) 54ms
 ✓ tests/validation.spec.ts (30 tests) 21ms
 ✓ tests/feedback.spec.ts (10 tests) 445ms
 ❯ tests/camera-route.spec.ts (7 tests | 3 failed) 472ms
     × records relative turns, rejects repeated zero-distance taps, then saves the existing draft schema 239ms
     ✓ stops and reacquires the camera on pause/resume and restores the old route on cancel 66ms
     ✓ falls back to manual entry after camera denial and no motion support 65ms
     ✓ cleans a camera that resolves after the editor is closed 28ms
     × confirms only dirty exits and leaves an active recording intact if navigation is rejected 15ms
     × ignores stationary samples and credits only sustained pulses, then releases the camera on unmount 29ms
     ✓ pauses on backgrounding without losing the active segment 30ms
 ✓ tests/account-auth.spec.ts (8 tests) 17ms
 ✓ tests/views.spec.ts (5 tests) 368ms
stderr | tests/outdoor-routes.spec.ts > does not invent campus coordinates and refuses unverified exports
[VUE_ROUTER_R0020] No active route record was found when calling `onBeforeRouteLeave()`. Maybe you called it inside of App.vue?
├▶ fix: Call it from a component rendered inside <router-view> (a page component or one of its children), not from App.vue.
╰▶ see: https://router.vuejs.org/guide/advanced/composition-api.html#Navigation-Guards

stderr | tests/outdoor-routes.spec.ts > imports a network for review and previews its shortest route without publishing
[VUE_ROUTER_R0020] No active route record was found when calling `onBeforeRouteLeave()`. Maybe you called it inside of App.vue?
├▶ fix: Call it from a component rendered inside <router-view> (a page component or one of its children), not from App.vue.
╰▶ see: https://router.vuejs.org/guide/advanced/composition-api.html#Navigation-Guards

stderr | tests/outdoor-routes.spec.ts > network edits clear survey confirmation
[VUE_ROUTER_R0020] No active route record was found when calling `onBeforeRouteLeave()`. Maybe you called it inside of App.vue?
├▶ fix: Call it from a component rendered inside <router-view> (a page component or one of its children), not from App.vue.
╰▶ see: https://router.vuejs.org/guide/advanced/composition-api.html#Navigation-Guards

 ✓ tests/indoor-graph.spec.ts (8 tests) 12ms
stderr | tests/outdoor-routes.spec.ts > places walking nodes on the school image only after GPS calibration
[VUE_ROUTER_R0020] No active route record was found when calling `onBeforeRouteLeave()`. Maybe you called it inside of App.vue?
├▶ fix: Call it from a component rendered inside <router-view> (a page component or one of its children), not from App.vue.
╰▶ see: https://router.vuejs.org/guide/advanced/composition-api.html#Navigation-Guards

stderr | tests/outdoor-routes.spec.ts > does not create a GPS node by clicking an uncalibrated school map
[VUE_ROUTER_R0020] No active route record was found when calling `onBeforeRouteLeave()`. Maybe you called it inside of App.vue?
├▶ fix: Call it from a component rendered inside <router-view> (a page component or one of its children), not from App.vue.
 ❯ tests/outdoor-routes.spec.ts (5 tests | 5 failed) 324ms
╰▶ see: https://router.vuejs.org/guide/advanced/composition-api.html#Navigation-Guards
   × does not invent campus coordinates and refuses unverified exports 122ms
   × imports a network for review and previews its shortest route without publishing 44ms
   × network edits clear survey confirmation 38ms
   × places walking nodes on the school image only after GPS calibration 60ms
   × does not create a GPS node by clicking an uncalibrated school map 58ms

 ✓ tests/route-editor.spec.ts (5 tests) 14ms
 ✓ tests/destination-links.spec.ts (4 tests) 8ms
 ❯ tests/destination-editor.spec.ts (2 tests | 2 failed) 147ms
     × validates before saving and retains the draft after a request fails 91ms
     × stops recording when sensors produce no usable samples and cleans listeners 54ms
 ✓ tests/destination-workspace.spec.ts (1 test) 127ms

⎯⎯⎯⎯⎯⎯ Failed Tests 10 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  tests/camera-route.spec.ts > camera route recording > records relative turns, rejects repeated zero-distance taps, then saves the existing draft schema
AssertionError: expected "vi.fn()" to be called with arguments: [ 'd', [ { id: 1, …(3) }, …(2) ] ]

Received: 

  1st vi.fn() call:

@@ -3,21 +3,27 @@
    [
      {
        "direction": "straight",
        "distance": 6.2,
        "id": 1,
+       "method": "manual",
        "mode": "indoor",
+       "recordedAt": "2026-11-10T09:00:53.294Z",
      },
      {
        "direction": "left",
        "distance": 1.6,
        "id": 2,
+       "method": "manual",
        "mode": "indoor",
+       "recordedAt": "2026-11-10T09:00:53.326Z",
      },
      {
        "direction": "right",
        "distance": 3.4,
        "id": 3,
+       "method": "manual",
        "mode": "indoor",
+       "recordedAt": "2026-11-10T09:00:53.349Z",
      },
    ],
  ]


Number of calls: 1

 ❯ tests/camera-route.spec.ts:58:24
     56|     mocks.save.mockResolvedValue({ ...destination, is_active: false });
     57|     await button(wrapper, 'Save inactive draft').trigger('click'); awa…
     58|     expect(mocks.save).toHaveBeenCalledWith('d', [
       |                        ^
     59|       { id: 1, direction: 'straight', distance: 6.2, mode: 'indoor' },
     60|       { id: 2, direction: 'left', distance: 1.6, mode: 'indoor' },

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/10]⎯

 FAIL  tests/camera-route.spec.ts > camera route recording > confirms only dirty exits and leaves an active recording intact if navigation is rejected
AssertionError: expected "bound " to not be called at all, but actually been called 1 times

Received: 

  1st bound  call:

    Array [
      "Leave with unsaved changes? A draft is kept in this tab for recovery.",
    ]


Number of calls: 1

 ❯ tests/camera-route.spec.ts:96:32
     94|     vi.mocked(window.confirm).mockClear();
     95|     await button(wrapper, 'Back to Destinations').trigger('click');
     96|     expect(window.confirm).not.toHaveBeenCalled();
       |                                ^
     97|     await start(wrapper);
     98|     vi.mocked(window.confirm).mockReturnValue(false);

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[2/10]⎯

 FAIL  tests/camera-route.spec.ts > camera route recording > ignores stationary samples and credits only sustained pulses, then releases the camera on unmount
AssertionError: expected '↑ Straight0.00 mManually measured dis…' to contain '0.70 m'

Expected: "0.70 m"
Received: "↑ Straight0.00 mManually measured distance"

 ❯ tests/camera-route.spec.ts:120:76
    118|     await flushPromises(); expect(wrapper.find('.camera-distance').tex…
    119|     sample(0, 2800); sample(2, 2820); sample(0, 2920);
    120|     await flushPromises(); expect(wrapper.find('.camera-distance').tex…
       |                                                                            ^
    121|     wrapper.unmount(); expect(stop).toHaveBeenCalledTimes(1);
    122|   });

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[3/10]⎯

 FAIL  tests/destination-editor.spec.ts > destination editor > validates before saving and retains the draft after a request fails
TypeError: Cannot read properties of undefined (reading 'trigger')
 ❯ tests/destination-editor.spec.ts:23:31
     21|     expect(mocks.create).not.toHaveBeenCalled();
     22|     expect(wrapper.text()).toContain('1–50');
     23|     await button('Add segment').trigger('click');
       |                               ^
     24|     mocks.create.mockRejectedValue({ code: '23505' });
     25|     await button('Save inactive draft').trigger('click'); await flushP…

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[4/10]⎯

 FAIL  tests/destination-editor.spec.ts > destination editor > stops recording when sensors produce no usable samples and cleans listeners
AssertionError: expected false to be true // Object.is equality

- Expected
+ Received

- true
+ false

 ❯ tests/destination-editor.spec.ts:44:72
     42|     expect(wrapper.text()).toMatch(/No usable motion samples|Motion se…
     43|     wrapper.unmount();
     44|     expect(remove.mock.calls.some(args => args[0] === 'devicemotion'))…
       |                                                                        ^
     45|     remove.mockRestore();
     46|   });

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[5/10]⎯

 FAIL  tests/outdoor-routes.spec.ts > does not invent campus coordinates and refuses unverified exports
TypeError: Cannot read properties of undefined (reading 'trigger')
 ❯ tests/outdoor-routes.spec.ts:13:68
     11| test('does not invent campus coordinates and refuses unverified export…
     12|   const wrapper = mount(OutdoorRoutesView);
     13|   await wrapper.findAll('button').find(b => b.text() === 'Add node')!.…
       |                                                                    ^
     14|   expect((wrapper.find('[aria-label="Latitude"]').element as HTMLInput…
     15|   await wrapper.findAll('button').find(b => b.text() === 'Export verif…

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[6/10]⎯

 FAIL  tests/outdoor-routes.spec.ts > imports a network for review and previews its shortest route without publishing
TypeError: Cannot read properties of undefined (reading 'trigger')
 ❯ tests/outdoor-routes.spec.ts:22:77
     20|   const wrapper = mount(OutdoorRoutesView);
     21|   await wrapper.find('textarea').setValue(JSON.stringify(network));
     22|   await wrapper.findAll('button').find(b => b.text() === 'Import JSON …
       |                                                                             ^
     23|   expect(wrapper.text()).toContain('Network imported for review');
     24|   await wrapper.find('[aria-label="Starting node"]').setValue('start');

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[7/10]⎯

 FAIL  tests/outdoor-routes.spec.ts > network edits clear survey confirmation
TypeError: Cannot read properties of undefined (reading 'trigger')
 ❯ tests/outdoor-routes.spec.ts:36:77
     34|   const wrapper = mount(OutdoorRoutesView);
     35|   await wrapper.find('textarea').setValue(JSON.stringify(network));
     36|   await wrapper.findAll('button').find(b => b.text() === 'Import JSON …
       |                                                                             ^
     37|   const confirmation = wrapper.find('p label input[type="checkbox"]');
     38|   await confirmation.setValue(true);

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[8/10]⎯

 FAIL  tests/outdoor-routes.spec.ts > places walking nodes on the school image only after GPS calibration
TypeError: Cannot read properties of undefined (reading 'trigger')
 ❯ tests/outdoor-routes.spec.ts:53:77
     51|   ] };
     52|   await wrapper.find('textarea').setValue(JSON.stringify({ ...network,…
     53|   await wrapper.findAll('button').find(b => b.text() === 'Import JSON …
       |                                                                             ^
     54|   await wrapper.find('[aria-label="Map editing mode"]').setValue('node…
     55|   wrapper.findComponent(CampusMapCanvas).vm.$emit('point', { x: 0.5, y…

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[9/10]⎯

 FAIL  tests/outdoor-routes.spec.ts > does not create a GPS node by clicking an uncalibrated school map
TypeError: Cannot read properties of undefined (reading 'trigger')
 ❯ tests/outdoor-routes.spec.ts:67:77
     65|   const wrapper = mount(OutdoorRoutesView);
     66|   await wrapper.find('textarea').setValue(JSON.stringify({ ...network,…
     67|   await wrapper.findAll('button').find(b => b.text() === 'Import JSON …
       |                                                                             ^
     68|   await wrapper.find('[aria-label="Map editing mode"]').setValue('node…
     69|   wrapper.findComponent(CampusMapCanvas).vm.$emit('point', { x: 0.5, y…

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[10/10]⎯


 Test Files  3 failed | 11 passed (14)
      Tests  10 failed | 135 passed (145)
   Start at  09:00:50
   Duration  6.32s (transform 2.12s, setup 0ms, import 5.03s, tests 2.08s, environment 7.98s)


Error: AssertionError: expected "vi.fn()" to be called with arguments: [ 'd', [ { id: 1, …(3) }, …(2) ] ]

Received: 

  1st vi.fn() call:

@@ -3,21 +3,27 @@
    [
      {
        "direction": "straight",
        "distance": 6.2,
        "id": 1,
+       "method": "manual",
        "mode": "indoor",
+       "recordedAt": "2026-11-10T09:00:53.294Z",
      },
      {
        "direction": "left",
        "distance": 1.6,
        "id": 2,
+       "method": "manual",
        "mode": "indoor",
+       "recordedAt": "2026-11-10T09:00:53.326Z",
      },
      {
        "direction": "right",
        "distance": 3.4,
        "id": 3,
+       "method": "manual",
        "mode": "indoor",
+       "recordedAt": "2026-11-10T09:00:53.349Z",
      },
    ],
  ]


Number of calls: 1

 ❯ tests/camera-route.spec.ts:58:24



Error: AssertionError: expected "bound " to not be called at all, but actually been called 1 times

Received: 

  1st bound  call:

    Array [
      "Leave with unsaved changes? A draft is kept in this tab for recovery.",
    ]


Number of calls: 1

 ❯ tests/camera-route.spec.ts:96:32



Error: AssertionError: expected '↑ Straight0.00 mManually measured dis…' to contain '0.70 m'

Expected: "0.70 m"
Received: "↑ Straight0.00 mManually measured distance"

 ❯ tests/camera-route.spec.ts:120:76



Error: TypeError: Cannot read properties of undefined (reading 'trigger')
 ❯ tests/destination-editor.spec.ts:23:31



Error: AssertionError: expected false to be true // Object.is equality

- Expected
+ Received

- true
+ false

 ❯ tests/destination-editor.spec.ts:44:72



Error: TypeError: Cannot read properties of undefined (reading 'trigger')
 ❯ tests/outdoor-routes.spec.ts:13:68



Error: TypeError: Cannot read properties of undefined (reading 'trigger')
 ❯ tests/outdoor-routes.spec.ts:22:77



Error: TypeError: Cannot read properties of undefined (reading 'trigger')
 ❯ tests/outdoor-routes.spec.ts:36:77



Error: TypeError: Cannot read properties of undefined (reading 'trigger')
 ❯ tests/outdoor-routes.spec.ts:53:77



Error: TypeError: Cannot read properties of undefined (reading 'trigger')
 ❯ tests/outdoor-routes.spec.ts:67:77


Error: Process completed with exit code 1.


    -- Match equivalent labels while preserving the existing floor ID, name and level.
    -- "First Floor" is deliberately not guessed to mean Ground or Second Floor.
    floor_aliases := case point.floor_level
      when 1 then array['GROUNDFLOOR', 'GROUND', 'GF', 'GFLOOR', 'GROUNDLEVEL', 'FLOOR1', 'LEVEL1', '1F', 'F1']
      when 2 then array['SECONDFLOOR', '2NDFLOOR', 'SECONDLEVEL', '2NDLEVEL', 'FLOOR2', 'LEVEL2', '2F', 'F2']
    end;
    select count(*) into match_count from public.floors where building_id = it_id
      and regexp_replace(upper(name), '[^A-Z0-9]', '', 'g') = any(floor_aliases);
    if match_count > 1 then
      raise exception 'Multiple existing floors match %. Review floor IDs before importing.', point.floor_name;
    end if;
    select id into floor_uuid from public.floors where building_id = it_id
      and regexp_replace(upper(name), '[^A-Z0-9]', '', 'g') = any(floor_aliases);
    if floor_uuid is null then
      select name into conflicting_floor_name from public.floors
        where building_id = it_id and level = point.floor_level;
      if found then
        raise exception 'Floor level % is named "%"; cannot safely assume this is %. Run the floor diagnostic query and confirm its meaning.',
          point.floor_level, conflicting_floor_name, point.floor_name;
      end if;
      insert into public.floors(building_id, level, name)
      values (it_id, point.floor_level, point.floor_name) returning id into floor_uuid;
    end if;

    select count(*) into match_count from public.rooms where building_id = it_id and (
      regexp_replace(upper(name), '[^A-Z0-9]', '', 'g') = regexp_replace(upper(point.name), '[^A-Z0-9]', '', 'g')
      or regexp_replace(upper(room_number), '[^A-Z0-9]', '', 'g') = regexp_replace(upper(point.name), '[^A-Z0-9]', '', 'g'));
    if match_count > 1 then raise exception 'Multiple room records match %.', point.name; end if;
    select id, floor_id into room_uuid, existing_floor from public.rooms where building_id = it_id and (
      regexp_replace(upper(name), '[^A-Z0-9]', '', 'g') = regexp_replace(upper(point.name), '[^A-Z0-9]', '', 'g')
      or regexp_replace(upper(room_number), '[^A-Z0-9]', '', 'g') = regexp_replace(upper(point.name), '[^A-Z0-9]', '', 'g'));
    if room_uuid is null then
      insert into public.rooms(building_id, floor_id, name, room_number, type, is_active)
      values (it_id, floor_uuid, point.name, case when point.kind = 'room' then point.name else null end,
        case when point.kind = 'office' then 'office' else 'other' end, false) returning id into room_uuid;
    elsif existing_floor is null then
      update public.rooms set floor_id = floor_uuid where id = room_uuid;
    elsif existing_floor <> floor_uuid then
      raise exception 'Existing room % is assigned to a different floor. Review it before importing.', point.name;
    end if;

    -- Never replace, deactivate, or reset an existing saved destination/indoor route.
    if exists (select 1 from public.destinations where room_id = room_uuid) then continue; end if;
    if exists (select 1 from public.destinations where id = point.source_id
      or regexp_replace(upper(name), '[^A-Z0-9]', '', 'g') = regexp_replace(upper(point.name), '[^A-Z0-9]', '', 'g')) then
      raise notice 'Existing destination for % was preserved. Link it to room % in admin after review.', point.name, room_uuid;
      continue;
    end if;
    insert into public.destinations(id, name, building, type, entrance_name, entrance_lat, entrance_lng,
      room_id, indoor_route, is_active)
    values (point.source_id, point.name, 'IT BUILDING', case when point.kind = 'office' then 'office' else 'other' end,
      'IT Building Entrance', 13.38822222, 121.16169444, room_uuid, '[]'::jsonb, false);
  end loop;
  raise notice 'Imported 14 coordinate labels. Image 1/2 need confirmed building/floor assignments. New destinations remain inactive until routes are configured.';
end;
$seed$;

-- Review all 14 coordinate labels. New labels are inactive; existing publication states are preserved.
select s.source_id, l.name, l.category, l.latitude, l.longitude, l.is_active
from campus_coordinate_seed s join public.map_labels l
  on l.id = s.label_id or regexp_replace(upper(l.name), '[^A-Z0-9]', '', 'g')
    = regexp_replace(upper(s.name), '[^A-Z0-9]', '', 'g')
order by s.source_id;

commit;

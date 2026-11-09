-- Read-only diagnostic for the coordinate seed. No records are changed.
select b.id as building_id, b.code as building_code, b.name as building_name,
       f.id as floor_id, f.level, f.name as floor_name,
       (select count(*) from public.rooms r where r.floor_id = f.id) as room_count
from public.buildings b
left join public.floors f on f.building_id = b.id
where regexp_replace(upper(b.name), '[^A-Z0-9]', '', 'g')
  in ('ITBUILDING', 'ITBLDG', 'INFORMATIONTECHNOLOGYBUILDING')
order by b.name, f.level;

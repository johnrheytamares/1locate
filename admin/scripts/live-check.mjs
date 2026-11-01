// Live access checks against the real Supabase project.
//
//   npm run live-check
//
// Reads VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY from .env and, optionally,
// EDITOR_TEST_EMAIL / EDITOR_TEST_PASSWORD and ADMIN_TEST_EMAIL / ADMIN_TEST_PASSWORD
// from .env.test.local (gitignored). Groups without credentials are reported as SKIP.
//
// Write checks only touch records this run creates. Every one is named "ZZTEST ..."
// and is removed by ID at the end, even when a check fails. Secrets are never printed.

import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const url = process.env.VITE_SUPABASE_URL ?? '';
const anonKey = process.env.VITE_SUPABASE_ANON_KEY ?? '';

function isPrivilegedKey(key) {
  if (key.startsWith('sb_secret_')) return true;
  const parts = key.split('.');
  if (parts.length !== 3) return false;
  try {
    return JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')).role === 'service_role';
  } catch {
    return false;
  }
}

if (!url || !anonKey) {
  console.error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in .env.');
  process.exit(2);
}
if (isPrivilegedKey(anonKey)) {
  console.error('VITE_SUPABASE_ANON_KEY is a service-role/secret key. Use the anon/publishable key.');
  process.exit(2);
}

const results = [];

function record(group, name, ok, detail = '') {
  results.push({ group, status: ok ? 'PASS' : 'FAIL' });
  console.log(`${ok ? 'PASS' : 'FAIL'}  [${group}] ${name}${detail ? ` (${detail})` : ''}`);
}

function skip(group, name, reason) {
  results.push({ group, status: 'SKIP' });
  console.log(`SKIP  [${group}] ${name} (${reason})`);
}

/** Error code/status only; messages can echo request data. */
function code(error) {
  if (!error) return 'no error';
  return String(error.code ?? error.statusCode ?? error.status ?? error.name ?? 'error');
}

function newClient() {
  return createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

async function signedInClient(email, password) {
  const client = newClient();
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error || !data.user) return { client: null, userId: null, error };
  return { client, userId: data.user.id, error: null };
}

const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

// Anon -----------------------------------------------------------------------------

async function anonChecks() {
  const g = 'anon';
  const db = newClient();

  const buildings = await db.from('buildings').select('id, is_active');
  record(g, 'reads only published buildings', !buildings.error && buildings.data.every((b) => b.is_active),
    buildings.error ? code(buildings.error) : `rows=${buildings.data.length}`);

  const rooms = await db.from('rooms').select('id, is_active');
  record(g, 'reads only published rooms', !rooms.error && rooms.data.every((r) => r.is_active),
    rooms.error ? code(rooms.error) : `rows=${rooms.data.length}`);

  const catalog = await db.from('navigation_catalog').select('id');
  record(g, 'reads navigation_catalog', !catalog.error, catalog.error ? code(catalog.error) : `rows=${catalog.data.length}`);

  const roles = await db.from('user_roles').select('user_id');
  record(g, 'cannot read user_roles', Boolean(roles.error), code(roles.error));

  const insert = await db.from('buildings').insert({ code: 'ZZTEST-ANON', name: 'ZZTEST anon insert' }).select('id');
  record(g, 'cannot create buildings', Boolean(insert.error), code(insert.error));

  const path = `${randomUUID()}/${randomUUID()}.png`;
  const upload = await db.storage.from('room-photos').upload(path, new Blob([PNG_1X1], { type: 'image/png' }), {
    contentType: 'image/png',
    upsert: false,
  });
  record(g, 'cannot upload to room-photos', Boolean(upload.error), code(upload.error));
}

// Editor ---------------------------------------------------------------------------

async function editorChecks(env, sharedState) {
  const g = 'editor';
  if (!env.email || !env.password) {
    skip(g, 'all editor checks', 'EDITOR_TEST_EMAIL / EDITOR_TEST_PASSWORD not set');
    return;
  }
  const { client: db, userId, error } = await signedInClient(env.email, env.password);
  record(g, 'signs in', Boolean(db), code(error));
  if (!db) return;
  sharedState.editorUserId = userId;

  const own = await db.from('user_roles').select('user_id, role');
  record(g, 'own role is editor', !own.error && own.data.length === 1 && own.data[0].role === 'editor',
    own.error ? code(own.error) : `visible role rows=${own.data.length}`);

  const created = { buildingId: null, floorId: null, roomId: null, imageIds: [], paths: [] };
  const anon = newClient();
  const tag = randomUUID().slice(0, 6).toUpperCase();

  try {
    const building = await db.from('buildings')
      .insert({ code: `ZZTEST-${tag}`, name: `ZZTEST live-check ${tag} (safe to delete)`, is_active: false })
      .select('id');
    created.buildingId = building.data?.[0]?.id ?? null;
    record(g, 'creates an unpublished building', Boolean(created.buildingId), code(building.error));
    if (!created.buildingId) return;

    const hidden = await anon.from('buildings').select('id').eq('id', created.buildingId);
    record(g, 'anon cannot see the unpublished building', !hidden.error && hidden.data.length === 0,
      hidden.error ? code(hidden.error) : `rows=${hidden.data.length}`);

    const duplicate = await db.from('buildings').insert({ code: `ZZTEST-${tag}`, name: 'ZZTEST duplicate' }).select('id');
    record(g, 'duplicate building code is rejected', duplicate.error?.code === '23505', code(duplicate.error));
    if (duplicate.data?.[0]?.id) await db.from('buildings').delete().eq('id', duplicate.data[0].id);

    const halfCoords = await db.from('buildings')
      .insert({ code: `ZZTEST-${tag}X`, name: 'ZZTEST half coordinates', entrance_lat: 13.4 })
      .select('id');
    record(g, 'latitude without longitude is rejected', halfCoords.error?.code === '23514', code(halfCoords.error));
    if (halfCoords.data?.[0]?.id) await db.from('buildings').delete().eq('id', halfCoords.data[0].id);

    const floor = await db.from('floors')
      .insert({ building_id: created.buildingId, level: 1, name: 'ZZTEST floor' })
      .select('id');
    created.floorId = floor.data?.[0]?.id ?? null;
    record(g, 'creates a floor', Boolean(created.floorId), code(floor.error));
    if (!created.floorId) return;

    const blocked = await db.from('buildings').delete().eq('id', created.buildingId).select('id');
    record(g, 'building with floors cannot be deleted', ['23503', '23001'].includes(blocked.error?.code),
      code(blocked.error));

    const room = await db.from('rooms')
      .insert({
        building_id: created.buildingId,
        floor_id: created.floorId,
        name: 'ZZTEST room',
        type: 'office',
        is_active: false,
      })
      .select('id');
    created.roomId = room.data?.[0]?.id ?? null;
    record(g, 'creates an unpublished room', Boolean(created.roomId), code(room.error));
    if (!created.roomId) return;

    const pngPath = `${created.roomId}/${randomUUID()}.png`;
    const upload = await db.storage.from('room-photos').upload(pngPath, new Blob([PNG_1X1], { type: 'image/png' }), {
      contentType: 'image/png',
      upsert: false,
    });
    if (!upload.error) created.paths.push(pngPath);
    record(g, 'uploads a PNG room photo', !upload.error, code(upload.error));

    if (!upload.error) {
      const image = await db.from('room_images')
        .insert({ room_id: created.roomId, storage_path: pngPath, caption: 'ZZTEST photo', sort_order: 10 })
        .select('id');
      const imageId = image.data?.[0]?.id;
      if (imageId) created.imageIds.push(imageId);
      record(g, 'records the photo metadata', Boolean(imageId), code(image.error));

      const signed = await db.storage.from('room-photos').createSignedUrl(pngPath, 60);
      let fetched = 'not fetched';
      if (signed.data?.signedUrl) {
        const response = await fetch(signed.data.signedUrl);
        fetched = `http=${response.status}`;
        record(g, 'signed URL serves the photo', response.ok, fetched);
      } else {
        record(g, 'signed URL serves the photo', false, code(signed.error));
      }

      const anonSigned = await anon.storage.from('room-photos').createSignedUrl(pngPath, 60);
      record(g, 'anon cannot sign a draft room photo', Boolean(anonSigned.error), code(anonSigned.error));
    }

    const textPath = `${created.roomId}/${randomUUID()}.png`;
    const wrongType = await db.storage.from('room-photos')
      .upload(textPath, new Blob(['not an image'], { type: 'text/plain' }), { contentType: 'text/plain', upsert: false });
    if (!wrongType.error) created.paths.push(textPath);
    record(g, 'bucket rejects a non-image MIME type', Boolean(wrongType.error), code(wrongType.error));

    const bigPath = `${created.roomId}/${randomUUID()}.png`;
    const big = Buffer.alloc(MAX_PHOTO_BYTES + 1024);
    PNG_1X1.copy(big);
    const tooBig = await db.storage.from('room-photos')
      .upload(bigPath, new Blob([big], { type: 'image/png' }), { contentType: 'image/png', upsert: false });
    if (!tooBig.error) created.paths.push(bigPath);
    record(g, 'bucket rejects a file over 5 MB', Boolean(tooBig.error), code(tooBig.error));

    const orphanPath = `${randomUUID()}/${randomUUID()}.png`;
    const orphan = await db.storage.from('room-photos')
      .upload(orphanPath, new Blob([PNG_1X1], { type: 'image/png' }), { contentType: 'image/png', upsert: false });
    if (!orphan.error) created.paths.push(orphanPath);
    record(g, 'upload under a non-existent room is rejected', Boolean(orphan.error), code(orphan.error));

    const promote = await db.from('user_roles').insert({ user_id: userId, role: 'admin', granted_by: userId }).select('user_id');
    record(g, 'cannot grant itself a role', Boolean(promote.error) || (promote.data ?? []).length === 0, code(promote.error));

    const selfChange = await db.from('user_roles').update({ role: 'admin' }).eq('user_id', userId).select('user_id');
    record(g, 'cannot change its own role', Boolean(selfChange.error) || selfChange.data.length === 0,
      selfChange.error ? code(selfChange.error) : `rows=${selfChange.data.length}`);
  } finally {
    await cleanup(g, db, created);
    await db.auth.signOut();
  }
}

async function cleanup(g, db, created) {
  const problems = [];
  for (const id of created.imageIds) {
    const { data, error } = await db.from('room_images').delete().eq('id', id).select('id');
    if (error || data.length !== 1) problems.push(`room_images ${code(error)}`);
  }
  if (created.paths.length > 0) {
    const { data, error } = await db.storage.from('room-photos').remove(created.paths);
    if (error || (data ?? []).length !== created.paths.length) {
      problems.push(`storage removed ${(data ?? []).length}/${created.paths.length} ${error ? code(error) : ''}`.trim());
    }
  }
  for (const [table, id] of [['rooms', created.roomId], ['floors', created.floorId], ['buildings', created.buildingId]]) {
    if (!id) continue;
    const { data, error } = await db.from(table).delete().eq('id', id).select('id');
    if (error || data.length !== 1) problems.push(`${table} ${code(error)}`);
  }
  record(g, 'removes every ZZTEST record it created', problems.length === 0, problems.join('; '));
  if (problems.length > 0) {
    console.log('      Leftover test data is named "ZZTEST ..." and can be removed from the admin app.');
  }
}

// Admin ----------------------------------------------------------------------------

async function adminChecks(env, sharedState) {
  const g = 'admin';
  if (!env.email || !env.password) {
    skip(g, 'all admin checks', 'ADMIN_TEST_EMAIL / ADMIN_TEST_PASSWORD not set');
    return;
  }
  const { client: db, userId, error } = await signedInClient(env.email, env.password);
  record(g, 'signs in', Boolean(db), code(error));
  if (!db) return;

  try {
    const own = await db.from('user_roles').select('role').eq('user_id', userId).maybeSingle();
    record(g, 'own role is admin', own.data?.role === 'admin', own.error ? code(own.error) : '');

    const all = await db.from('user_roles').select('user_id, role');
    record(g, 'lists all roles', !all.error && all.data.length >= 1, all.error ? code(all.error) : `rows=${all.data.length}`);

    const selfInsert = await db.from('user_roles').insert({ user_id: userId, role: 'editor', granted_by: userId }).select('user_id');
    record(g, 'cannot grant itself a role', Boolean(selfInsert.error), code(selfInsert.error));

    const selfUpdate = await db.from('user_roles').update({ role: 'admin' }).eq('user_id', userId).select('user_id');
    record(g, 'cannot change its own role', Boolean(selfUpdate.error) || selfUpdate.data.length === 0,
      selfUpdate.error ? code(selfUpdate.error) : `rows=${selfUpdate.data.length}`);

    const selfDelete = await db.from('user_roles').delete().eq('user_id', userId).select('user_id');
    record(g, 'cannot remove its own role', Boolean(selfDelete.error) || selfDelete.data.length === 0,
      selfDelete.error ? code(selfDelete.error) : `rows=${selfDelete.data.length}`);

    const unknownUser = await db.from('user_roles')
      .insert({ user_id: randomUUID(), role: 'editor', granted_by: userId })
      .select('user_id');
    record(g, 'granting a role to an unknown user ID is rejected', unknownUser.error?.code === '23503', code(unknownUser.error));

    if (sharedState.editorUserId) {
      const editorRow = (all.data ?? []).find((row) => row.user_id === sharedState.editorUserId);
      record(g, "sees the editor test account's role", editorRow?.role === 'editor');
      const sameRole = await db.from('user_roles').update({ role: 'editor' }).eq('user_id', sharedState.editorUserId).select('user_id');
      record(g, "can update another user's role (same value, editor test account)", !sameRole.error && sameRole.data.length === 1,
        sameRole.error ? code(sameRole.error) : `rows=${sameRole.data.length}`);
    } else {
      skip(g, "update another user's role", 'needs the editor test account');
    }
  } finally {
    await db.auth.signOut();
  }
}

// Run ------------------------------------------------------------------------------

const sharedState = { editorUserId: null };
try {
  await anonChecks();
  await editorChecks({ email: process.env.EDITOR_TEST_EMAIL, password: process.env.EDITOR_TEST_PASSWORD }, sharedState);
  await adminChecks({ email: process.env.ADMIN_TEST_EMAIL, password: process.env.ADMIN_TEST_PASSWORD }, sharedState);
} catch (error) {
  record('run', 'unexpected error', false, error instanceof TypeError ? 'network' : code(error));
}

const count = (status) => results.filter((r) => r.status === status).length;
console.log(`\n${count('PASS')} passed, ${count('FAIL')} failed, ${count('SKIP')} skipped`);
process.exit(count('FAIL') > 0 ? 1 : 0);

import { describe, expect, test } from 'vitest';
import { DESTINATIONS } from '@/data/destinations';
import type { Destination } from '@/models/navigation';
import { matchDestinations, normalizeSpokenQuery, resolveVoiceSearch } from '@/services/voice-query.service';

const room101: Destination = {
  ...DESTINATIONS[0],
  id: 'room-101',
  name: 'BSIT Classroom',
  building: 'Academic Building',
  type: 'Classroom',
  details: {
    roomId: 'r1',
    buildingId: 'b1',
    floorName: 'Ground',
    floorLevel: 0,
    roomNumber: '101',
    description: null,
    images: [],
  },
};

const catalog = [...DESTINATIONS, room101];
const ids = (items: Destination[]) => items.map((item) => item.id);

describe('normalizeSpokenQuery', () => {
  test('drops filler words and punctuation', () => {
    expect(normalizeSpokenQuery('Where is the Registrar Office?')).toBe('registrar office');
    expect(normalizeSpokenQuery('Take me to the library, please')).toBe('library');
    expect(normalizeSpokenQuery("I'd like directions to the cashier")).toBe('cashier');
  });

  test('turns spoken digits into a room number', () => {
    expect(normalizeSpokenQuery('room one oh one')).toBe('101');
    expect(normalizeSpokenQuery('Room 1 0 1')).toBe('101');
    expect(normalizeSpokenQuery('go to room 101')).toBe('101');
  });

  test('keeps "oh" as a word when no digits are next to it', () => {
    expect(normalizeSpokenQuery('oh library')).toBe('oh library');
  });

  test('returns an empty string when only filler was heard', () => {
    expect(normalizeSpokenQuery('where is the')).toBe('');
    expect(normalizeSpokenQuery('   ')).toBe('');
  });
});

describe('matchDestinations', () => {
  test('matches names, partial words, and small recognition slips', () => {
    expect(ids(matchDestinations('registrar', catalog))).toEqual(['registrar']);
    expect(ids(matchDestinations('regis', catalog))).toEqual(['registrar']);
    expect(ids(matchDestinations('registar', catalog))).toEqual(['registrar']);
    expect(ids(matchDestinations('guidance office', catalog))).toEqual(['guidance']);
  });

  test('room numbers must match exactly', () => {
    expect(ids(matchDestinations('101', catalog))).toEqual(['room-101']);
    expect(matchDestinations('102', catalog)).toEqual([]);
    expect(matchDestinations('10', catalog)).toEqual([]);
  });

  test('every spoken word has to match', () => {
    expect(matchDestinations('library cashier', catalog)).toEqual([]);
    expect(matchDestinations('cafeteria', catalog)).toEqual([]);
    expect(matchDestinations('', catalog)).toEqual([]);
  });

  test('name matches rank above building matches', () => {
    const results = ids(matchDestinations('library', catalog));
    expect(results).toEqual(['library']);
    const offices = ids(matchDestinations('office', catalog));
    expect(offices.slice(0, 2).sort()).toEqual(['guidance', 'registrar']);
    expect(offices).toContain('cashier');
  });
});

describe('resolveVoiceSearch', () => {
  test('picks the single clear destination', () => {
    const result = resolveVoiceSearch(['Where is the registrar office'], catalog);
    expect(result).toMatchObject({ kind: 'single', destination: { id: 'registrar' } });
  });

  test('finds a room by its spoken number', () => {
    const result = resolveVoiceSearch(['take me to room one oh one'], catalog);
    expect(result).toMatchObject({ kind: 'single', destination: { id: 'room-101' } });
  });

  test('asks the user to choose when matches are equally good', () => {
    const result = resolveVoiceSearch(['administration building'], catalog);
    expect(result.kind).toBe('multiple');
    if (result.kind !== 'multiple') return;
    expect(ids(result.destinations).sort()).toEqual(['cashier', 'registrar']);
  });

  test('tries the next recognizer alternative when the first one matches nothing', () => {
    const result = resolveVoiceSearch(['the ladybug', 'the library'], catalog);
    expect(result).toMatchObject({ kind: 'single', query: 'library', destination: { id: 'library' } });
  });

  test('reports no match without guessing', () => {
    expect(resolveVoiceSearch(['cafeteria'], catalog)).toEqual({ kind: 'none', query: 'cafeteria' });
    expect(resolveVoiceSearch(['where is the'], catalog)).toEqual({ kind: 'none', query: 'where is the' });
    expect(resolveVoiceSearch([], catalog)).toEqual({ kind: 'none', query: '' });
    expect(resolveVoiceSearch(['library'], [])).toEqual({ kind: 'none', query: 'library' });
  });
});

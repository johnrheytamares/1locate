import type { Destination } from '@/models/navigation';

/**
 * Campus destinations.
 *
 * Outdoor targets are the building entrances that GPS guides to. Their latitude and longitude are
 * TEST placeholders (null) because MINSU coordinates have not been surveyed yet. Replace them with
 * surveyed or verified campus coordinates before real use. While they are null, the app asks for a
 * clearly labeled TEST target in REAL GPS mode, or generates one in SIMULATED GPS mode.
 *
 * Arrival radii are starting values for testing, not final values.
 * Indoor routes are fixed test routes that stand in for building nodes.
 */
export const DESTINATIONS: Destination[] = [
  {
    id: 'registrar',
    name: 'Registrar Office',
    building: 'Administration Building',
    type: 'Office',
    outdoorTarget: {
      name: 'Administration Building Entrance',
      latitude: null, // TEST: replace with surveyed coordinate
      longitude: null, // TEST: replace with surveyed coordinate
      arrivalRadius: 10,
    },
    indoorRoute: [
      { id: 1, direction: 'straight', distance: 3, mode: 'indoor' },
      { id: 2, direction: 'right', distance: 2, mode: 'indoor' },
      { id: 3, direction: 'straight', distance: 2, mode: 'indoor' },
    ],
  },
  {
    id: 'library',
    name: 'Library',
    building: 'Library Building',
    type: 'Library',
    outdoorTarget: {
      name: 'Library Building Entrance',
      latitude: null, // TEST: replace with surveyed coordinate
      longitude: null, // TEST: replace with surveyed coordinate
      arrivalRadius: 10,
    },
    indoorRoute: [
      { id: 1, direction: 'straight', distance: 5, mode: 'indoor' },
    ],
  },
  {
    id: 'cashier',
    name: 'Cashier',
    building: 'Administration Building',
    type: 'Office',
    outdoorTarget: {
      name: 'Administration Building Entrance',
      latitude: null, // TEST: replace with surveyed coordinate
      longitude: null, // TEST: replace with surveyed coordinate
      arrivalRadius: 10,
    },
    indoorRoute: [
      { id: 1, direction: 'straight', distance: 3, mode: 'indoor' },
      { id: 2, direction: 'straight', distance: 3, mode: 'indoor' },
    ],
  },
  {
    id: 'guidance',
    name: 'Guidance Office',
    building: 'Academic Building',
    type: 'Office',
    outdoorTarget: {
      name: 'Academic Building Entrance',
      latitude: null, // TEST: replace with surveyed coordinate
      longitude: null, // TEST: replace with surveyed coordinate
      arrivalRadius: 10,
    },
    indoorRoute: [
      { id: 1, direction: 'straight', distance: 3, mode: 'indoor' },
      { id: 2, direction: 'right', distance: 3, mode: 'indoor' },
    ],
  },
];

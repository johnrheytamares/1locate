import type { Destination } from '@/models/navigation';
let reviewedId: string | null = null;
let testJourney = false;
export interface ArrivalRecord { destination: Destination; evidence: 'room-confirmed'; feedbackId: string; }
let arrival: ArrivalRecord | null = null;
export function reviewDestination(id: string) { reviewedId = id; }
export function wasDestinationReviewed(id: string) { return reviewedId === id; }
export function beginJourney(id: string) { reviewedId = id; testJourney = false; arrival = null; }
export function markTestJourney() { testJourney = true; }
export function isTestJourney() { return testJourney; }
export function confirmRoomArrival(destination: Destination): ArrivalRecord | null {
  if (testJourney) return null;
  arrival = { destination: JSON.parse(JSON.stringify(destination)) as Destination, evidence: 'room-confirmed', feedbackId: crypto.randomUUID() };
  return arrival;
}
export function getArrival() { return arrival; }
export function clearJourney() { reviewedId = null; arrival = null; testJourney = false; }

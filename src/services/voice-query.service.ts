import type { Destination } from '@/models/navigation';

/** Words people add around a place name ("where is the ...", "saan ang ..."). */
const FILLER_WORDS = new Set([
  'where', 'wheres', 'is', 'the', 'a', 'an', 'to', 'take', 'me', 'go', 'going', 'navigate', 'i', 'want',
  'need', 'would', 'like', 'how', 'do', 'get', 'directions', 'direction', 'find', 'show', 'please', 'can',
  'you', 'room', 'number', 'id', 'im', 'wanna', 'lets', 'saan', 'ang', 'ba', 'sa', 'po', 'yung', 'papunta',
]);

const DIGIT_WORDS: Record<string, string> = {
  zero: '0', oh: '0', one: '1', two: '2', three: '3', four: '4', five: '5', six: '6', seven: '7', eight: '8', nine: '9',
};

/** Lowercases, removes punctuation and filler words, and turns spoken digits into numbers ("one oh one" -> "101"). */
export function normalizeSpokenQuery(text: string): string {
  const tokens = text
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/-/g, ' ')
    .split(/\s+/)
    .filter(Boolean);

  const merged: string[] = [];
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    const digit = DIGIT_WORDS[token];
    const previousIsNumber = merged.length > 0 && /^\d+$/.test(merged[merged.length - 1]);
    const nextIsDigit = index + 1 < tokens.length && (DIGIT_WORDS[tokens[index + 1]] != null || /^\d+$/.test(tokens[index + 1]));
    // "oh" only counts as zero next to other digits; on its own it is just a word.
    if (digit != null && (token !== 'oh' || previousIsNumber || nextIsDigit)) {
      if (previousIsNumber) merged[merged.length - 1] += digit;
      else merged.push(digit);
    } else if (/^\d+$/.test(token) && previousIsNumber) {
      merged[merged.length - 1] += token;
    } else {
      merged.push(token);
    }
  }
  return merged.filter((token) => !FILLER_WORDS.has(token)).join(' ');
}

function words(text: string): string[] {
  return text.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
}

/** Edit distance, used to accept small recognition slips such as "registar". */
function editDistance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    let previous = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const current = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, previous + (a[i - 1] === b[j - 1] ? 0 : 1));
      previous = current;
    }
  }
  return row[b.length];
}

function tokenMatches(queryToken: string, candidate: string): boolean {
  if (queryToken === candidate) return true;
  if (/^\d+$/.test(queryToken) || /^\d+$/.test(candidate)) return false;
  if (queryToken.length >= 3 && candidate.startsWith(queryToken)) return true;
  return queryToken.length >= 5 && Math.abs(queryToken.length - candidate.length) <= 1 && editDistance(queryToken, candidate) <= 1;
}

function allMatch(queryTokens: string[], candidates: string[]): boolean {
  return queryTokens.every((token) => candidates.some((candidate) => tokenMatches(token, candidate)));
}

/**
 * 0 when a spoken word is missing from the destination. Otherwise 1 for a building or type
 * match, 2 when every word is in the name or room number, 3 for the exact name.
 */
function matchScore(queryTokens: string[], destination: Destination): number {
  const nameTokens = words(destination.name);
  const roomTokens = words(destination.details?.roomNumber ?? '');
  const allTokens = [...nameTokens, ...roomTokens, ...words(destination.building), ...words(destination.type)];
  if (!allMatch(queryTokens, allTokens)) return 0;
  let score = 1;
  if (allMatch(queryTokens, [...nameTokens, ...roomTokens])) score += 1;
  if (queryTokens.join(' ') === nameTokens.join(' ')) score += 1;
  return score;
}

interface ScoredDestination {
  destination: Destination;
  score: number;
}

function scoreDestinations(query: string, destinations: Destination[]): ScoredDestination[] {
  const queryTokens = words(query);
  if (queryTokens.length === 0) return [];
  return destinations
    .map((destination) => ({ destination, score: matchScore(queryTokens, destination) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);
}

/** Destinations whose name, building, type, or room number contain every spoken word, best first. */
export function matchDestinations(query: string, destinations: Destination[]): Destination[] {
  return scoreDestinations(query, destinations).map((item) => item.destination);
}

export type VoiceSearchResult =
  | { kind: 'single'; query: string; destination: Destination }
  | { kind: 'multiple'; query: string; destinations: Destination[] }
  | { kind: 'none'; query: string };

/**
 * Picks the destination from the recognizer's alternatives. Never guesses between equally
 * good matches: those are returned as "multiple" so the user chooses.
 */
export function resolveVoiceSearch(transcripts: string[], destinations: Destination[]): VoiceSearchResult {
  const queries = transcripts.map(normalizeSpokenQuery).filter(Boolean);
  for (const query of queries) {
    const scored = scoreDestinations(query, destinations);
    if (scored.length === 0) continue;
    const best = scored.filter((item) => item.score === scored[0].score).map((item) => item.destination);
    if (best.length === 1) return { kind: 'single', query, destination: best[0] };
    return { kind: 'multiple', query, destinations: best };
  }
  return { kind: 'none', query: queries[0] ?? transcripts[0]?.trim() ?? '' };
}

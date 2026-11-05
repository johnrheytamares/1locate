import type { NavigationFeedback } from '@/types';

export const RATING_LABELS: Record<number, string> = {
  1: 'Very Poor',
  2: 'Poor',
  3: 'Average',
  4: 'Good',
  5: 'Excellent',
};

export type RatingFilter = '' | '1' | '2' | '3' | '4' | '5' | 'low';
export type SortOrder = 'newest' | 'oldest';

export interface FeedbackSummary {
  total: number;
  average: number | null;
  fiveStar: number;
  low: number;
}

export interface FeedbackFilters {
  search: string;
  rating: RatingFilter;
  sort: SortOrder;
}

export interface FeedbackPage {
  rows: NavigationFeedback[];
  page: number;
  pages: number;
  total: number;
  first: number;
  last: number;
}

export function summarize(items: NavigationFeedback[]): FeedbackSummary {
  const total = items.length;
  const sum = items.reduce((acc, item) => acc + item.rating, 0);
  return {
    total,
    average: total === 0 ? null : Math.round((sum / total) * 10) / 10,
    fiveStar: items.filter((item) => item.rating === 5).length,
    low: items.filter((item) => item.rating <= 2).length,
  };
}

function matchesRating(rating: number, filter: RatingFilter): boolean {
  if (filter === '') return true;
  if (filter === 'low') return rating <= 2;
  return rating === Number(filter);
}

export function filterFeedback(items: NavigationFeedback[], filters: FeedbackFilters): NavigationFeedback[] {
  const term = filters.search.trim().toLowerCase();
  const result = items.filter((item) => {
    if (!matchesRating(item.rating, filters.rating)) return false;
    if (!term) return true;
    return item.destination_name.toLowerCase().includes(term)
      || (item.comment ?? '').toLowerCase().includes(term);
  });
  const direction = filters.sort === 'oldest' ? 1 : -1;
  return result.sort((a, b) => direction * (Date.parse(a.created_at) - Date.parse(b.created_at)));
}

export function paginate(items: NavigationFeedback[], page: number, pageSize: number): FeedbackPage {
  const total = items.length;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const current = Math.min(Math.max(1, page), pages);
  const start = (current - 1) * pageSize;
  const rows = items.slice(start, start + pageSize);
  return {
    rows,
    page: current,
    pages,
    total,
    first: total === 0 ? 0 : start + 1,
    last: start + rows.length,
  };
}

export function stars(rating: number): string {
  const filled = Math.min(Math.max(Math.round(rating), 0), 5);
  return '★'.repeat(filled) + '☆'.repeat(5 - filled);
}

export function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function formatDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

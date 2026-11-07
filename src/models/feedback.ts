export const FEEDBACK_RATINGS = [1, 2, 3, 4, 5] as const;

export type FeedbackRating = (typeof FEEDBACK_RATINGS)[number];

export const FEEDBACK_RATING_LABELS: Record<FeedbackRating, string> = {
  1: 'Very Poor',
  2: 'Poor',
  3: 'Average',
  4: 'Good',
  5: 'Excellent',
};

export const FEEDBACK_COMMENT_MAX = 2000;

export interface NavigationFeedbackDraft {
  sessionId: string;
  destinationId: string | null;
  destinationName: string;
  rating: FeedbackRating;
  comment: string;
}

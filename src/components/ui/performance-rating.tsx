import type { CreativeRating } from "@/types/view-models";

export type PerformanceRatingTone = "good" | "stable" | "poor" | "limited";

export function performanceRatingTone(
  rating: CreativeRating | null,
): PerformanceRatingTone {
  if (rating === "TỐT") return "good";
  if (rating === "ỔN") return "stable";
  if (rating === "KÉM" || rating === "KHÔNG INSTALL") return "poor";
  return "limited";
}

export function PerformanceRating({
  rating,
  fallback = "CHƯA XẾP HẠNG",
}: {
  rating: CreativeRating | null;
  fallback?: string;
}) {
  return (
    <span
      className={`performance-rating performance-rating--${performanceRatingTone(
        rating,
      )}`}
    >
      {rating ?? fallback}
    </span>
  );
}

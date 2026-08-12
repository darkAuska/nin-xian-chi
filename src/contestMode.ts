export const EXHIBITION_SECONDS = 180;
export const AUTO_RESTART_SECONDS = 8;

export type GameResult = "won" | "lost";

export function formatExhibitionTime(totalSeconds: number): string {
  const normalized = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(normalized / 60);
  const seconds = normalized % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export function decideExhibitionResult(playerHealth: number, dealerHealth: number): GameResult {
  return playerHealth > dealerHealth ? "won" : "lost";
}

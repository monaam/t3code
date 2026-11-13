import { createFileRoute } from "@tanstack/react-router";

import { TodayPage, type TodaySearch } from "../components/today/TodayPage";

export const Route = createFileRoute("/_chat/today")({
  validateSearch: (raw: Record<string, unknown>): TodaySearch =>
    typeof raw.day === "string" && /^\d{4}-\d{2}-\d{2}$/.test(raw.day) ? { day: raw.day } : {},
  component: TodayPage,
});

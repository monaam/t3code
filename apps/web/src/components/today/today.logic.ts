import type { SidebarThreadSummary } from "../../types";
import { resolveThreadStatusPill } from "../Sidebar.logic";

export type TodayBucket = "waiting" | "failed" | "running" | "done";

export const TODAY_BUCKET_ORDER: ReadonlyArray<TodayBucket> = [
  "waiting",
  "failed",
  "running",
  "done",
];

type TodayThread = Pick<
  SidebarThreadSummary,
  | "createdAt"
  | "latestUserMessageAt"
  | "latestRun"
  | "hasActionableProposedPlan"
  | "hasPendingApprovals"
  | "hasPendingUserInput"
  | "pendingSubagentRequest"
  | "pendingGuestMessageCount"
  | "interactionMode"
  | "runtime"
> &
  Partial<Pick<SidebarThreadSummary, "pendingBackgroundTasks" | "blockedOnThreadWait">>;

/** A `YYYY-MM-DD` day in local time, `offset` days from `now`. */
export function localDayKey(now: Date, offset = 0): string {
  const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset);
  const month = String(day.getMonth() + 1).padStart(2, "0");
  const date = String(day.getDate()).padStart(2, "0");
  return `${day.getFullYear()}-${month}-${date}`;
}

/** Days back from today, so `?day=` can only name the last week. */
export function dayOffsetOf(dayKey: string | undefined, now: Date, maxBack: number): number {
  for (let offset = 0; offset >= -maxBack; offset -= 1) {
    if (localDayKey(now, offset) === dayKey) return offset;
  }
  return 0;
}

/** Created that day, or a message or run happened then. */
export function threadActiveOn(thread: TodayThread, dayKey: string): boolean {
  const run = thread.latestRun;
  return [
    thread.createdAt,
    thread.latestUserMessageAt,
    run?.requestedAt,
    run?.startedAt,
    run?.completedAt,
  ].some(
    (at) => at != null && !Number.isNaN(Date.parse(at)) && localDayKey(new Date(at)) === dayKey,
  );
}

export function todayBucket(thread: TodayThread): TodayBucket {
  const pill = resolveThreadStatusPill({ thread });
  switch (pill?.label) {
    case "Pending Approval":
    case "Awaiting Input":
    case "Guest Request":
    case "Plan Ready":
      return "waiting";
    case "Working":
    case "Connecting":
    case "Waiting":
      return "running";
    default:
      return thread.latestRun?.status === "failed" ? "failed" : "done";
  }
}

/** The day's /daily thread is titled with its date, as `DD/MM/YYYY`. */
export function dailyThreadTitle(dayKey: string): string {
  const [year, month, date] = dayKey.split("-");
  return `${date}/${month}/${year}`;
}

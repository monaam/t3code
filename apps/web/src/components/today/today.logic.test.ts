import { describe, expect, it } from "vite-plus/test";

import {
  dailyThreadTitle,
  dayOffsetOf,
  localDayKey,
  threadActiveOn,
  todayBucket,
} from "./today.logic";

const idle = {
  createdAt: "2026-11-10T09:00:00",
  latestUserMessageAt: null,
  latestRun: null,
  hasActionableProposedPlan: false,
  hasPendingApprovals: false,
  hasPendingUserInput: false,
  pendingSubagentRequest: null,
  pendingGuestMessageCount: 0,
  interactionMode: "default" as const,
  runtime: null,
};
const run = (status: string, completedAt: string | null) =>
  ({
    runId: "run-1",
    status,
    assistantMessageId: null,
    requestedAt: "2026-11-13T10:00:00",
    startedAt: "2026-11-13T10:00:00",
    completedAt,
  }) as never;

describe("today", () => {
  it("names local days and keeps ?day= within the last week", () => {
    const now = new Date(2026, 10, 13, 15, 0);
    expect(localDayKey(now)).toBe("2026-11-13");
    expect(localDayKey(now, -13)).toBe("2026-10-31");
    expect(dayOffsetOf("2026-11-12", now, 7)).toBe(-1);
    expect(dayOffsetOf("2026-10-01", now, 7)).toBe(0);
    expect(dailyThreadTitle("2026-11-13")).toBe("13/11/2026");
  });

  it("counts an old thread on the day it ran, not on days it sat idle", () => {
    const ranToday = { ...idle, latestRun: run("completed", "2026-11-13T10:05:00") };
    expect(threadActiveOn(ranToday, "2026-11-13")).toBe(true);
    expect(threadActiveOn(ranToday, "2026-11-11")).toBe(false);
    expect(threadActiveOn(idle, "2026-11-10")).toBe(true);
  });

  it("sorts a thread into waiting, failed, running or done", () => {
    expect(todayBucket({ ...idle, hasPendingUserInput: true })).toBe("waiting");
    expect(todayBucket({ ...idle, latestRun: run("failed", "2026-11-13T10:05:00") })).toBe(
      "failed",
    );
    expect(
      todayBucket({
        ...idle,
        runtime: {
          status: "running",
          providerName: null,
          providerInstanceId: "claude" as never,
          activeRunId: "run-1" as never,
          lastError: null,
          updatedAt: "2026-11-13T10:00:00",
        },
      }),
    ).toBe("running");
    expect(todayBucket({ ...idle, latestRun: run("completed", "2026-11-13T10:05:00") })).toBe(
      "done",
    );
  });
});

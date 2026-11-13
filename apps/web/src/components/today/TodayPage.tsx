import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import { isListedThreadLineage } from "@t3tools/contracts";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { useState, type ReactNode } from "react";

import { isElectron } from "~/env";
import { cn } from "~/lib/utils";
import { workspaceAreaProps } from "../../lib/workspaceFocus";
import { useProjects, useThreadProjection, useVisibleThreadShells } from "../../state/entities";
import { buildThreadRouteParams } from "../../threadRoutes";
import type { SidebarThreadSummary } from "../../types";
import ChatMarkdown from "../ChatMarkdown";
import { Button } from "../ui/button";
import { SidebarInset } from "../ui/sidebar";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { WorkspaceBreadcrumb, WorkspaceBreadcrumbItem } from "../WorkspaceBreadcrumb";
import { WorkspacePageContainer } from "../WorkspacePageContainer";
import { WorkspacePageHeader } from "../WorkspacePageHeader";
import {
  dailyThreadTitle,
  dayOffsetOf,
  localDayKey,
  TODAY_BUCKET_ORDER,
  threadActiveOn,
  todayBucket,
  type TodayBucket,
} from "./today.logic";

const MAX_DAYS_BACK = 7;

const BUCKET_LABEL: Record<TodayBucket, string> = {
  waiting: "Waiting on you",
  failed: "Failed",
  running: "Running",
  done: "Done",
};

const BUCKET_DOT: Record<TodayBucket, string> = {
  waiting: "bg-amber-500 dark:bg-amber-300/90",
  failed: "bg-red-500 dark:bg-red-300/90",
  running: "bg-sky-500 dark:bg-sky-300/80",
  done: "bg-emerald-500 dark:bg-emerald-300/90",
};

export interface TodaySearch {
  readonly day?: string;
}

type Thread = SidebarThreadSummary;

function threadKeyOf(thread: Pick<Thread, "environmentId" | "id">) {
  return `${thread.environmentId}:${thread.id}`;
}

function lastActivityAt(thread: Thread): string {
  const run = thread.latestRun;
  return run?.completedAt ?? run?.startedAt ?? thread.latestUserMessageAt ?? thread.createdAt;
}

function timeLabel(iso: string) {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

/** The newest assistant message, loaded only while something shows it. */
function useLastReply(thread: Pick<Thread, "environmentId" | "id">) {
  const projection = useThreadProjection(scopeThreadRef(thread.environmentId, thread.id));
  const items = projection?.projection.turnItems ?? [];
  for (let index = items.length - 1; index >= 0; index -= 1) {
    const item = items[index];
    if (item?.type === "assistant_message" && item.text.trim().length > 0) return item.text;
  }
  return null;
}

function ReplyPreview({ thread }: { thread: Thread }) {
  const reply = useLastReply(thread);
  return (
    <span className="line-clamp-6 whitespace-pre-wrap">
      {reply === null ? "No reply yet." : reply.trim().slice(0, 600)}
    </span>
  );
}

function TodayRow(props: {
  thread: Thread;
  workspaceName: string | null;
  nested: boolean;
  onOpen: (thread: Thread) => void;
}) {
  const { thread } = props;
  const bucket = todayBucket(thread);
  return (
    <li className={cn("list-none", props.nested && "ps-6")}>
      <Tooltip>
        <TooltipTrigger
          render={
            <button
              type="button"
              onClick={() => props.onOpen(thread)}
              className="flex w-full min-w-0 cursor-pointer items-center gap-3 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent"
            />
          }
        >
          <span aria-hidden className={cn("size-2 shrink-0 rounded-full", BUCKET_DOT[bucket])} />
          <span className="min-w-0 flex-1 truncate text-foreground">{thread.title}</span>
          {props.workspaceName ? (
            <span className="shrink-0 truncate text-muted-foreground text-xs">
              {props.workspaceName}
            </span>
          ) : null}
          <span className="w-28 shrink-0 text-right text-muted-foreground text-xs">
            {BUCKET_LABEL[bucket]} · {timeLabel(lastActivityAt(thread))}
          </span>
        </TooltipTrigger>
        <TooltipPopup side="bottom" align="start" className="max-w-md text-left">
          <ReplyPreview thread={thread} />
        </TooltipPopup>
      </Tooltip>
    </li>
  );
}

function DailySummary({ thread }: { thread: Thread }) {
  const reply = useLastReply(thread);
  const [expanded, setExpanded] = useState(false);
  if (reply === null) return null;
  return (
    <div className="rounded-lg border border-border/70 p-4">
      <div className={cn("relative overflow-hidden", !expanded && "max-h-48")}>
        <ChatMarkdown text={reply} cwd={undefined} />
      </div>
      <Button size="xs" variant="ghost" className="mt-2" onClick={() => setExpanded(!expanded)}>
        {expanded ? "Show less" : "Show all"}
      </Button>
    </div>
  );
}

export function TodayPage() {
  const search: TodaySearch = useSearch({ strict: false });
  const navigate = useNavigate();
  // oxlint-disable-next-line react/purity -- the page names its day from the clock when it renders
  const now = new Date();
  const offset = dayOffsetOf(search.day, now, MAX_DAYS_BACK);
  const dayKey = localDayKey(now, offset);
  const [filter, setFilter] = useState<TodayBucket | null>(null);
  const projects = useProjects();
  const threads = useVisibleThreadShells().filter(
    (thread) =>
      thread.archivedAt === null &&
      isListedThreadLineage(thread.lineage) &&
      threadActiveOn(thread, dayKey),
  );

  const projectByKey = new Map<string, (typeof projects)[number]>(
    projects.map((project) => [`${project.environmentId}:${project.id}`, project]),
  );
  const workspaceNameOf = (thread: Thread) =>
    projectByKey.get(`${thread.environmentId}:${thread.projectId}`)?.title ?? "Other";

  const daily = threads.find((thread) => thread.title === dailyThreadTitle(dayKey)) ?? null;
  const launchedBy = (thread: Thread) =>
    thread.launchedByThreadId === null
      ? null
      : `${thread.environmentId}:${thread.launchedByThreadId}`;
  const byUrgency = (left: Thread, right: Thread) =>
    TODAY_BUCKET_ORDER.indexOf(todayBucket(left)) -
      TODAY_BUCKET_ORDER.indexOf(todayBucket(right)) ||
    lastActivityAt(right).localeCompare(lastActivityAt(left));
  const shown = (thread: Thread) => filter === null || todayBucket(thread) === filter;

  const dailyKey = daily ? threadKeyOf(daily) : null;
  const dailyChildren = threads
    .filter((thread) => launchedBy(thread) === dailyKey)
    .toSorted(byUrgency);
  const placed = new Set([...(dailyKey ? [dailyKey] : []), ...dailyChildren.map(threadKeyOf)]);
  const rest = threads.filter((thread) => !placed.has(threadKeyOf(thread)));
  const restKeys = new Set(rest.map(threadKeyOf));
  // Within a workspace, a thread another one launched sits under it.
  const childrenOf = new Map<string, Thread[]>();
  for (const thread of rest) {
    const parent = launchedBy(thread);
    if (parent === null || !restKeys.has(parent)) continue;
    childrenOf.set(parent, [...(childrenOf.get(parent) ?? []), thread]);
  }
  const groups = new Map<string, Thread[]>();
  for (const thread of rest) {
    const parent = launchedBy(thread);
    if (parent !== null && restKeys.has(parent)) continue;
    const key = `${thread.environmentId}:${thread.projectId}`;
    groups.set(key, [...(groups.get(key) ?? []), thread]);
  }
  const orderedGroups = [...groups.entries()]
    .map(([key, list]) => ({ key, project: projectByKey.get(key), list: list.toSorted(byUrgency) }))
    .toSorted(
      (left, right) =>
        Number(right.project?.pinnedAt != null) - Number(left.project?.pinnedAt != null) ||
        (left.project?.title ?? "").localeCompare(right.project?.title ?? ""),
    );

  const counts = TODAY_BUCKET_ORDER.map((bucket) => ({
    bucket,
    count: threads.filter((thread) => todayBucket(thread) === bucket).length,
  })).filter((entry) => entry.count > 0);

  const openThread = (thread: Thread) =>
    void navigate({
      to: "/$environmentId/$threadId",
      params: buildThreadRouteParams(scopeThreadRef(thread.environmentId, thread.id)),
    });
  const goToDay = (nextOffset: number) =>
    void navigate({
      to: "/today",
      search: nextOffset === 0 ? {} : { day: localDayKey(now, nextOffset) },
    });

  const renderRows = (
    list: ReadonlyArray<Thread>,
    showWorkspace: boolean,
    nested = false,
  ): ReactNode[] =>
    list.flatMap((thread): ReactNode[] => [
      shown(thread) ? (
        <TodayRow
          key={threadKeyOf(thread)}
          thread={thread}
          workspaceName={showWorkspace ? workspaceNameOf(thread) : null}
          nested={nested}
          onOpen={openThread}
        />
      ) : null,
      ...renderRows(
        (childrenOf.get(threadKeyOf(thread)) ?? []).toSorted(byUrgency),
        showWorkspace,
        true,
      ),
    ]);

  const heading = new Date(`${dayKey}T12:00:00`).toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
  });

  return (
    <SidebarInset className="h-dvh min-h-0 overflow-hidden overscroll-y-none">
      <div
        {...workspaceAreaProps("today", 1, "Today")}
        className="flex min-h-0 min-w-0 flex-1 flex-col bg-background"
      >
        <WorkspacePageHeader electron={isElectron} className="bg-background">
          <WorkspaceBreadcrumb ariaLabel="Today breadcrumb">
            <WorkspaceBreadcrumbItem current>
              <h1 className="truncate">{offset === 0 ? `Today · ${heading}` : heading}</h1>
            </WorkspaceBreadcrumbItem>
          </WorkspaceBreadcrumb>
          <div className="min-w-0 flex-1" />
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label="Previous day"
            disabled={offset <= -MAX_DAYS_BACK}
            onClick={() => goToDay(offset - 1)}
          >
            <ChevronLeftIcon />
          </Button>
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label="Next day"
            disabled={offset >= 0}
            onClick={() => goToDay(offset + 1)}
          >
            <ChevronRightIcon />
          </Button>
        </WorkspacePageHeader>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <WorkspacePageContainer width="wide" className="gap-5">
            {counts.length > 0 ? (
              <div className="flex flex-wrap items-center gap-1.5">
                {counts.map(({ bucket, count }) => (
                  <Button
                    key={bucket}
                    size="xs"
                    variant={filter === bucket ? "secondary" : "ghost"}
                    aria-pressed={filter === bucket}
                    onClick={() => setFilter(filter === bucket ? null : bucket)}
                  >
                    <span aria-hidden className={cn("size-2 rounded-full", BUCKET_DOT[bucket])} />
                    {count} {BUCKET_LABEL[bucket].toLowerCase()}
                  </Button>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground text-sm">No threads were active this day.</p>
            )}

            {daily ? (
              <section className="flex flex-col gap-2">
                <h2 className="font-medium text-sm">Daily</h2>
                {filter === null ? <DailySummary thread={daily} /> : null}
                <ul className="flex flex-col">
                  {renderRows([daily], false)}
                  {renderRows(dailyChildren, true, true)}
                </ul>
              </section>
            ) : null}

            {orderedGroups.map(({ key, project, list }) => {
              const rows = renderRows(list, false).filter((row) => row !== null);
              if (rows.length === 0) return null;
              return (
                <section key={key} className="flex flex-col gap-1">
                  <h2 className="font-medium text-sm">{project?.title ?? "Other"}</h2>
                  <ul className="flex flex-col">{rows}</ul>
                </section>
              );
            })}
          </WorkspacePageContainer>
        </div>
      </div>
    </SidebarInset>
  );
}

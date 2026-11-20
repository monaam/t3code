import type { ClientSettings } from "@t3tools/contracts";
import { msg } from "gt-react";

// Ids are stored in client settings, so never rename one.
export const THREAD_DETAILS_ITEMS = [
  { id: "environment", label: msg("Environment and worktree"), defaultVisible: true },
  { id: "openIn", label: msg("Open in editor"), defaultVisible: true },
  { id: "scripts", label: msg("Project scripts"), defaultVisible: true },
  { id: "branch", label: msg("Branch and pull request"), defaultVisible: true },
  { id: "gitActions", label: msg("Git actions"), defaultVisible: true },
  {
    id: "changes",
    label: msg("Changes", { $context: "thread details item: version control changes" }),
    defaultVisible: true,
  },
  {
    id: "servers",
    label: msg("Servers", { $context: "thread details item: running dev servers" }),
    defaultVisible: true,
  },
  { id: "automations", label: msg("Automations"), defaultVisible: true },
  {
    id: "lineage",
    label: msg("Lineage", { $context: "thread details item: parent and child agents" }),
    defaultVisible: true,
  },
  { id: "sideChats", label: msg("Side chats"), defaultVisible: true },
  { id: "usage", label: msg("Usage limits"), defaultVisible: false },
  { id: "context", label: msg("Context window"), defaultVisible: false },
] as const;

export type ThreadDetailsItemId = (typeof THREAD_DETAILS_ITEMS)[number]["id"];
export type ThreadDetailsVisibility = Readonly<Record<ThreadDetailsItemId, boolean>>;

type ThreadDetailsItem = (typeof THREAD_DETAILS_ITEMS)[number];
type ThreadDetailsItemSettings = Pick<
  ClientSettings,
  "threadDetailsItems" | "threadDetailsUsageEnabled"
> &
  Partial<Pick<ClientSettings, "ceoModeEnabled">>;

const CODE_ONLY_ITEMS: ReadonlySet<ThreadDetailsItemId> = new Set([
  "openIn",
  "scripts",
  "branch",
  "gitActions",
  "changes",
]);

/** The items a person can show; CEO mode drops the code-only ones. */
export function threadDetailsItemsFor(ceoModeEnabled: boolean) {
  return ceoModeEnabled
    ? THREAD_DETAILS_ITEMS.filter((item) => !CODE_ONLY_ITEMS.has(item.id))
    : THREAD_DETAILS_ITEMS;
}

// People who turned on the retired Labs toggle keep Usage and Context until they change them here.
function defaultVisible(item: ThreadDetailsItem, settings: ThreadDetailsItemSettings) {
  return item.id === "usage" || item.id === "context"
    ? settings.threadDetailsUsageEnabled
    : item.defaultVisible;
}

export function resolveThreadDetailsVisibility(
  settings: ThreadDetailsItemSettings,
): ThreadDetailsVisibility {
  return Object.fromEntries(
    THREAD_DETAILS_ITEMS.map((item) => [
      item.id,
      !(settings.ceoModeEnabled && CODE_ONLY_ITEMS.has(item.id)) &&
        (settings.threadDetailsItems[item.id] ?? defaultVisible(item, settings)),
    ]),
  ) as Record<ThreadDetailsItemId, boolean>;
}

/** Stores only choices that differ from the default, so a later default change reaches everyone else. */
export function setThreadDetailsItem(
  settings: ThreadDetailsItemSettings,
  item: ThreadDetailsItem,
  visible: boolean,
): ClientSettings["threadDetailsItems"] {
  const { [item.id]: _previous, ...rest } = settings.threadDetailsItems;
  return visible === defaultVisible(item, settings) ? rest : { ...rest, [item.id]: visible };
}

export function isDefaultThreadDetailsVisibility(
  visibility: ThreadDetailsVisibility,
  items: ReadonlyArray<ThreadDetailsItem> = THREAD_DETAILS_ITEMS,
) {
  return items.every((item) => visibility[item.id] === item.defaultVisible);
}

/** Also clears the retired Labs flag, so Usage and Context return to off. */
export const RESET_THREAD_DETAILS_ITEMS = {
  threadDetailsItems: {},
  threadDetailsUsageEnabled: false,
} satisfies Partial<ClientSettings>;

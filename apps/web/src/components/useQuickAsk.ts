import { useAtomValue } from "@effect/atom-react";
import { thrownErrorMessage } from "@t3tools/client-runtime/errors";
import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import { squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";
import type { ProjectId } from "@t3tools/contracts";
import { resolveProjectSettings } from "@t3tools/shared/projectSettings";
import { useNavigate } from "@tanstack/react-router";
import { msg } from "gt-react";

import { m } from "~/i18n/messages";
import { newMessageId, newThreadId } from "~/lib/utils";
import { usePrimarySettings } from "../hooks/useSettings";
import { providerInstanceEntriesFor } from "../providerInstances";
import { useProjects } from "../state/entities";
import { usePrimaryEnvironmentId } from "../state/environments";
import { primaryServerProvidersAtom } from "../state/server";
import { threadEnvironment } from "../state/threads";
import { useOrchestrationCommand } from "../state/use-orchestration-command";
import { buildThreadRouteParams } from "../threadRoutes";
import { scheduledTaskDefaultModel } from "./settings/scheduledTasksSettings.logic";
import { toastManager } from "./ui/toast";

const TITLE_MAX_LENGTH = 80;

/**
 * CEO mode's quick ask: starts a thread in a workspace on this machine with the
 * brief as its first message, on that workspace's defaults, and stays where you are.
 */
export function useQuickAsk() {
  const environmentId = usePrimaryEnvironmentId();
  const settings = usePrimarySettings();
  const providers = useAtomValue(primaryServerProvidersAtom);
  const projects = useProjects();
  const navigate = useNavigate();
  const startTurn = useOrchestrationCommand(threadEnvironment.startTurn, { reportFailure: false });

  return async (input: {
    readonly projectId: ProjectId;
    readonly workspaceName: string;
    readonly brief: string;
  }) => {
    const project = projects.find(
      (candidate) => candidate.environmentId === environmentId && candidate.id === input.projectId,
    );
    const modelSelection =
      project === undefined
        ? null
        : scheduledTaskDefaultModel(
            settings,
            project,
            providerInstanceEntriesFor(providers, settings, project.id),
          );
    if (environmentId === null || project === undefined || modelSelection === null) {
      toastManager.add({
        type: "error",
        title: m(
          msg("Could not start a thread in {workspace}", { workspace: input.workspaceName }),
        ),
        description: m(msg("No provider is ready for this workspace.")),
      });
      return;
    }
    const { defaultRuntimeMode: runtimeMode } = resolveProjectSettings(
      settings,
      project.id,
      project,
    ).settings;
    const threadId = newThreadId();
    const createdAt = new Date().toISOString();
    const title = input.brief.split("\n")[0]!.slice(0, TITLE_MAX_LENGTH);
    const result = await startTurn({
      environmentId,
      input: {
        threadId,
        message: { messageId: newMessageId(), role: "user", text: input.brief, attachments: [] },
        modelSelection,
        titleSeed: input.brief,
        runtimeMode,
        interactionMode: "default",
        bootstrap: {
          createThread: {
            projectId: project.id,
            title,
            modelSelection,
            runtimeMode,
            interactionMode: "default",
            branch: null,
            worktreePath: null,
            createdAt,
          },
        },
        createdAt,
      },
    });
    if (result._tag === "Failure") {
      const error = squashAtomCommandFailure(result);
      toastManager.add({
        type: "error",
        title: m(
          msg("Could not start a thread in {workspace}", { workspace: input.workspaceName }),
        ),
        description: thrownErrorMessage(error, m) ?? m(msg("An error occurred.")),
      });
      return;
    }
    const id = toastManager.add({
      type: "success",
      title: m(msg("Started in {workspace}", { workspace: input.workspaceName })),
      description: title,
      actionProps: {
        children: m(msg("Open", { $context: "verb, opens the new thread" })),
        onClick: () => {
          toastManager.close(id);
          void navigate({
            to: "/$environmentId/$threadId",
            params: buildThreadRouteParams(scopeThreadRef(environmentId, threadId)),
          });
        },
      },
    });
  };
}

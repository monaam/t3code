export interface WorkspaceTerms {
  readonly one: string;
  readonly many: string;
  readonly One: string;
  readonly Many: string;
}

const PROJECT_TERMS: WorkspaceTerms = {
  one: "project",
  many: "projects",
  One: "Project",
  Many: "Projects",
};

const WORKSPACE_TERMS: WorkspaceTerms = {
  one: "workspace",
  many: "workspaces",
  One: "Workspace",
  Many: "Workspaces",
};

/** CEO mode calls projects workspaces in the everyday UI. */
export function workspaceTermsFor(ceoModeEnabled: boolean): WorkspaceTerms {
  return ceoModeEnabled ? WORKSPACE_TERMS : PROJECT_TERMS;
}

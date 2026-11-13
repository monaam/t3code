import { type WorkspaceTerms, workspaceTermsFor } from "../workspaceTerms";
import { useClientSettings } from "./useSettings";

export function useWorkspaceTerms(): WorkspaceTerms {
  return workspaceTermsFor(useClientSettings((settings) => settings.ceoModeEnabled));
}

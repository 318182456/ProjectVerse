export interface QueryRule {
  type: 'tag' | 'folder' | 'name';
  value: string; // e.g., "#frontend", "docs/api", "*design*"
}

export interface WorkspaceState {
  openTabs: string[];
  activeTab?: string;
}

export interface ProjectSpace {
  id: string;
  name: string;
  icon: string;
  color: string;
  createdAt: string;
  
  files: string[];       // Explicitly associated file paths (relative to vault root)
  folders: string[];     // Explicitly associated folder paths (relative to vault root)
  tags: string[];        // Explicitly associated tags (without #)
  queries: QueryRule[];  // Dynamic query rules
  
  dashboard?: string;
  workspace?: WorkspaceState;
}

export interface PluginSettings {
  enableDashboard: boolean;
  enableWorkspaceSync: boolean;
  enableDynamicQuery: boolean;
  showSpaceBadge: boolean;
  activeSpaceId?: string;
  spaces: ProjectSpace[];
}

export const DEFAULT_SETTINGS: PluginSettings = {
  enableDashboard: true,
  enableWorkspaceSync: true,
  enableDynamicQuery: true,
  showSpaceBadge: true,
  activeSpaceId: undefined,
  spaces: []
};

import { App, TFile, TFolder, normalizePath } from 'obsidian';
import { ProjectSpace, PluginSettings, QueryRule } from './types';

export class SpaceManager {
  private app: App;
  private settings: PluginSettings;
  private saveSettingsCallback: () => Promise<void>;
  public tempNoteSpaceMap: Record<string, string> = {};

  constructor(app: App, settings: PluginSettings, saveSettingsCallback: () => Promise<void>) {
    this.app = app;
    this.settings = settings;
    this.saveSettingsCallback = saveSettingsCallback;
  }

  getSpaces(): ProjectSpace[] {
    return this.settings.spaces;
  }

  getSpace(id: string): ProjectSpace | undefined {
    return this.settings.spaces.find(s => s.id === id);
  }

  async createSpace(name: string, icon: string = 'lucide-folder', color: string = '#4CAF50'): Promise<ProjectSpace> {
    const newSpace: ProjectSpace = {
      id: crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2, 15),
      name,
      icon,
      color,
      createdAt: new Date().toISOString().split('T')[0],
      files: [],
      folders: [],
      tags: [],
      queries: []
    };
    this.settings.spaces.push(newSpace);
    await this.saveSettingsCallback();
    return newSpace;
  }

  async updateSpace(id: string, updates: Partial<Omit<ProjectSpace, 'id'>>): Promise<void> {
    const space = this.getSpace(id);
    if (space) {
      Object.assign(space, updates);
      await this.saveSettingsCallback();
    }
  }

  async deleteSpace(id: string): Promise<void> {
    this.settings.spaces = this.settings.spaces.filter(s => s.id !== id);
    if (this.settings.activeSpaceId === id) {
      this.settings.activeSpaceId = undefined;
    }
    await this.saveSettingsCallback();
  }

  async reorderSpaces(fromId: string, toId: string): Promise<void> {
    const fromIdx = this.settings.spaces.findIndex(s => s.id === fromId);
    const toIdx = this.settings.spaces.findIndex(s => s.id === toId);
    if (fromIdx !== -1 && toIdx !== -1 && fromIdx !== toIdx) {
      const [movedSpace] = this.settings.spaces.splice(fromIdx, 1);
      this.settings.spaces.splice(toIdx, 0, movedSpace);
      await this.saveSettingsCallback();
    }
  }

  async duplicateSpace(id: string): Promise<ProjectSpace | undefined> {
    const source = this.getSpace(id);
    if (!source) return undefined;

    const newSpace: ProjectSpace = {
      ...JSON.parse(JSON.stringify(source)),
      id: crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2, 15),
      name: `${source.name} Copy`,
      createdAt: new Date().toISOString().split('T')[0]
    };
    this.settings.spaces.push(newSpace);
    await this.saveSettingsCallback();
    return newSpace;
  }

  async addFileToSpace(spaceId: string, filePath: string): Promise<void> {
    const space = this.getSpace(spaceId);
    if (space && !space.files.includes(filePath)) {
      space.files.push(filePath);
      await this.saveSettingsCallback();
    }
  }

  async removeFileFromSpace(spaceId: string, filePath: string): Promise<void> {
    const space = this.getSpace(spaceId);
    if (space) {
      space.files = space.files.filter(f => f !== filePath);
      await this.saveSettingsCallback();
    }
  }

  async addFolderToSpace(spaceId: string, folderPath: string): Promise<void> {
    const space = this.getSpace(spaceId);
    if (space && !space.folders.includes(folderPath)) {
      space.folders.push(folderPath);
      await this.saveSettingsCallback();
    }
  }

  async removeFolderFromSpace(spaceId: string, folderPath: string): Promise<void> {
    const space = this.getSpace(spaceId);
    if (space) {
      space.folders = space.folders.filter(f => f !== folderPath);
      await this.saveSettingsCallback();
    }
  }

  async addTagToSpace(spaceId: string, tag: string): Promise<void> {
    const cleanTag = tag.replace('#', '');
    const space = this.getSpace(spaceId);
    if (space && !space.tags.includes(cleanTag)) {
      space.tags.push(cleanTag);
      await this.saveSettingsCallback();
    }
  }

  async removeTagFromSpace(spaceId: string, tag: string): Promise<void> {
    const cleanTag = tag.replace('#', '');
    const space = this.getSpace(spaceId);
    if (space) {
      space.tags = space.tags.filter(t => t !== cleanTag);
      await this.saveSettingsCallback();
    }
  }

  async addQueryToSpace(spaceId: string, rule: QueryRule): Promise<void> {
    const space = this.getSpace(spaceId);
    if (space) {
      // Avoid duplicate query rules
      const exists = space.queries.some(q => q.type === rule.type && q.value === rule.value);
      if (!exists) {
        space.queries.push(rule);
        await this.saveSettingsCallback();
      }
    }
  }

  async removeQueryFromSpace(spaceId: string, ruleIndex: number): Promise<void> {
    const space = this.getSpace(spaceId);
    if (space && space.queries[ruleIndex]) {
      space.queries.splice(ruleIndex, 1);
      await this.saveSettingsCallback();
    }
  }

  // Handle file renames across the entire Vault
  async handleFileRename(oldPath: string, newPath: string): Promise<void> {
    // Clean up tempNoteSpaceMap entry if applicable
    if (this.tempNoteSpaceMap && this.tempNoteSpaceMap[oldPath]) {
      delete this.tempNoteSpaceMap[oldPath];
    }

    let changed = false;
    for (const space of this.settings.spaces) {
      // Update explicit file associations
      const fileIdx = space.files.indexOf(oldPath);
      if (fileIdx !== -indexOffsetMinusOne(fileIdx) && fileIdx !== -1) {
        space.files[fileIdx] = newPath;
        changed = true;
      }
      
      // Update explicit folder associations
      const folderIdx = space.folders.indexOf(oldPath);
      if (folderIdx !== -1) {
        space.folders[folderIdx] = newPath;
        changed = true;
      } else {
        // Also update folders nested
        space.folders = space.folders.map(f => {
          if (f === oldPath) {
            changed = true;
            return newPath;
          }
          if (f.startsWith(oldPath + '/')) {
            changed = true;
            return newPath + f.substring(oldPath.length);
          }
          return f;
        });
      }

      // Check dashboard
      if (space.dashboard === oldPath) {
        space.dashboard = newPath;
        changed = true;
      }
    }
    if (changed) {
      await this.saveSettingsCallback();
    }
  }

  // Handle file deletions
  async handleFileDelete(filePath: string): Promise<void> {
    // Clean up tempNoteSpaceMap entry if applicable
    if (this.tempNoteSpaceMap && this.tempNoteSpaceMap[filePath]) {
      delete this.tempNoteSpaceMap[filePath];
    }

    let changed = false;
    for (const space of this.settings.spaces) {
      const originalLen = space.files.length;
      space.files = space.files.filter(f => f !== filePath);
      if (space.files.length !== originalLen) changed = true;

      const origFolderLen = space.folders.length;
      space.folders = space.folders.filter(f => f !== filePath);
      if (space.folders.length !== origFolderLen) changed = true;

      if (space.dashboard === filePath) {
        space.dashboard = undefined;
        changed = true;
      }
    }
    if (changed) {
      await this.saveSettingsCallback();
    }
  }

  // Resolve all files belonging to a project space (both static and dynamic rules)
  getSpaceFiles(spaceId: string): TFile[] {
    const space = this.getSpace(spaceId);
    if (!space) return [];

    const allFiles = this.app.vault.getFiles();
    const matchedFiles = new Set<TFile>();

    // 1. Explicit files
    for (const path of space.files) {
      const file = this.app.vault.getAbstractFileByPath(path);
      if (file instanceof TFile) {
        matchedFiles.add(file);
      }
    }

    // Include any files created or tagged for this space (by space name frontmatter property or temp note mapping)
    for (const file of allFiles) {
      if (file.extension === 'md') {
        const cachedSpaceId = this.tempNoteSpaceMap?.[file.path];
        if (cachedSpaceId === spaceId) {
          matchedFiles.add(file);
        } else {
          // Fallback: check if the file's cache contains a 'space' property matching the space name
          const cache = this.app.metadataCache.getFileCache(file);
          if (cache && cache.frontmatter) {
            const spaceName = cache.frontmatter.space || cache.frontmatter.projectSpace;
            if (spaceName && String(spaceName).toLowerCase() === space.name.toLowerCase()) {
              matchedFiles.add(file);
            }
          }
        }
      }
    }

    // 2. Explicit folders
    for (const folderPath of space.folders) {
      const folder = this.app.vault.getAbstractFileByPath(folderPath);
      if (folder instanceof TFolder || folderPath === '/' || folderPath === '') {
        // Add all files recursively in this folder
        for (const file of allFiles) {
          if (file.path.startsWith(folderPath === '/' ? '' : folderPath + '/')) {
            matchedFiles.add(file);
          }
        }
      }
    }

    // 3. Explicit tags and Smart Queries
    if (space.tags.length > 0 || (this.settings.enableDynamicQuery && space.queries.length > 0)) {
      for (const file of allFiles) {

        // Match explicit tags
        if (space.tags.length > 0) {
          const fileTags = this.getFileTags(file);
          const hasMatchingTag = space.tags.some(t => fileTags.includes(t.toLowerCase()));
          if (hasMatchingTag) {
            matchedFiles.add(file);
            continue;
          }
        }

        // Match Smart Query rules
        if (this.settings.enableDynamicQuery && space.queries.length > 0) {
          let matchesQuery = false;
          for (const query of space.queries) {
            if (query.type === 'tag') {
              const cleanQueryTag = query.value.replace('#', '').toLowerCase();
              const fileTags = this.getFileTags(file);
              if (fileTags.includes(cleanQueryTag)) {
                matchesQuery = true;
                break;
              }
            } else if (query.type === 'folder') {
              const cleanFolder = normalizePath(query.value);
              if (file.path.startsWith(cleanFolder === '/' ? '' : cleanFolder + '/')) {
                matchesQuery = true;
                break;
              }
            } else if (query.type === 'name') {
              const pattern = query.value.replace(/\*/g, '.*');
              const regex = new RegExp(`^${pattern}$`, 'i');
              if (regex.test(file.name) || regex.test(file.basename)) {
                matchesQuery = true;
                break;
              }
            }
          }
          if (matchesQuery) {
            matchedFiles.add(file);
          }
        }
      }
    }

    return Array.from(matchedFiles);
  }

  // Utility to extract tags (lowercase, without '#') from file cache
  private getFileTags(file: TFile): string[] {
    const cache = this.app.metadataCache.getFileCache(file);
    if (!cache) return [];
    
    const tags = new Set<string>();
    
    // Frontmatter tags
    if (cache.frontmatter) {
      const fmTags = cache.frontmatter.tags || cache.frontmatter.tag;
      if (Array.isArray(fmTags)) {
        fmTags.forEach(t => tags.add(String(t).replace('#', '').toLowerCase().trim()));
      } else if (typeof fmTags === 'string') {
        fmTags.split(',').forEach(t => tags.add(t.replace('#', '').toLowerCase().trim()));
      }
    }

    // In-content tags
    if (cache.tags) {
      cache.tags.forEach(t => tags.add(t.tag.replace('#', '').toLowerCase().trim()));
    }

    return Array.from(tags);
  }

  getSpaceFolders(spaceId: string): TFolder[] {
    const space = this.getSpace(spaceId);
    if (!space) return [];

    const allLoaded = this.app.vault.getAllLoadedFiles();
    const matchedFolders = new Set<TFolder>();

    // Add explicit folders and their subfolders
    for (const folderPath of space.folders) {
      const folder = this.app.vault.getAbstractFileByPath(folderPath);
      if (folder instanceof TFolder) {
        matchedFolders.add(folder);
      }
      // Recursively find all subfolders in vault
      for (const file of allLoaded) {
        if (file instanceof TFolder && file.path.startsWith(folderPath === '/' ? '' : folderPath + '/')) {
          matchedFolders.add(file);
        }
      }
    }

    return Array.from(matchedFolders);
  }
}

// Dummy helper for renaming indexing (avoiding lint errors)
function indexOffsetMinusOne(idx: number) {
  return 0;
}

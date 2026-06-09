import { Plugin, WorkspaceLeaf, TFile, TFolder, Notice, normalizePath, Events, App, SuggestModal, Menu, MenuItem } from 'obsidian';
import { SpaceManager } from './spaceManager';
import { VIEW_TYPE_SPACE_EXPLORER, SpaceExplorerView } from './spaceExplorerView';
import { VIEW_TYPE_SPACE_DASHBOARD, SpaceDashboardView } from './spaceDashboardView';
import { PluginSettings, DEFAULT_SETTINGS, ProjectSpace } from './types';
import { SpaceModal } from './spaceModal';
import { SaveNoteModal } from './saveNoteModal';

function debounce<T extends (...args: unknown[]) => unknown>(fn: T, delay: number): (...args: Parameters<T>) => void {
  let timeout: number | null = null;
  return function(this: unknown, ...args: Parameters<T>) {
    if (timeout !== null) window.clearTimeout(timeout);
    timeout = window.setTimeout(() => fn.apply(this, args), delay);
  };
}

export default class VirtualProjectSpacePlugin extends Plugin {
  settings: PluginSettings = DEFAULT_SETTINGS;
  spaceManager!: SpaceManager;
  private isSavePending = false;
  private debouncedSave = debounce(() => {
    void this.performSave();
  }, 1000);

  async onload() {
    await this.loadPluginSettings();

    this.spaceManager = new SpaceManager(
      this.app,
      this.settings,
      async () => {
        await this.savePluginSettings();
        this.updateViews();
      }
    );

    // Register custom views
    this.registerView(
      VIEW_TYPE_SPACE_EXPLORER,
      (leaf) => new SpaceExplorerView(leaf, this.spaceManager)
    );

    this.registerView(
      VIEW_TYPE_SPACE_DASHBOARD,
      (leaf) => new SpaceDashboardView(leaf, this.spaceManager)
    );

    // Ribbon Icon
    this.addRibbonIcon('layers', '🗂️ 项目空间 Explorer', () => {
      void this.activateExplorerView();
    });

    // File Context Menu (Right Click)
    this.registerEvent(
      this.app.workspace.on('file-menu', (menu, file) => {
        if (!(file instanceof TFile) && !(file instanceof TFolder)) return;

        menu.addSeparator();
        menu.addItem((item) => {
          item.setTitle('添加到项目空间')
            .setIcon('folder-plus')
            .setSection('action');

          const subMenu = (item as unknown as { setSubmenu(): Menu }).setSubmenu();
          
          this.settings.spaces.forEach(space => {
            subMenu.addItem((subItem: MenuItem) => {
              subItem.setTitle(space.name)
                .onClick(() => {
                  if (file instanceof TFile) {
                    void this.spaceManager.addFileToSpace(space.id, file.path);
                  } else if (file instanceof TFolder) {
                    void this.spaceManager.addFolderToSpace(space.id, file.path);
                  }
                });
            });
          });

          subMenu.addSeparator();
          subMenu.addItem((subItem: MenuItem) => {
            subItem.setTitle('+ 新建空间并添加')
              .onClick(() => {
                new SpaceModal(this.app, async (name, icon, color) => {
                  const newSpace = await this.spaceManager.createSpace(name, icon, color);
                  if (file instanceof TFile) {
                    await this.spaceManager.addFileToSpace(newSpace.id, file.path);
                  } else if (file instanceof TFolder) {
                    await this.spaceManager.addFolderToSpace(newSpace.id, file.path);
                  }
                  void this.activateSpace(newSpace.id);
                }).open();
              });
          });
        });
      })
    );

    // Watch File Renames, Deletions, Creations, and Metadata Modifications
    this.registerEvent(
      this.app.vault.on('create', () => {
        this.updateViews();
      })
    );

    this.registerEvent(
      this.app.vault.on('rename', (file, oldPath) => {
        void (async () => {
          await this.spaceManager.handleFileRename(oldPath, file.path);
          this.updateViews();
        })();
      })
    );

    this.registerEvent(
      this.app.vault.on('delete', (file) => {
        void (async () => {
          await this.spaceManager.handleFileDelete(file.path);
          this.updateViews();
        })();
      })
    );

    this.registerEvent(
      this.app.metadataCache.on('changed', () => {
        this.updateViews();
      })
    );

    // Global Custom Workspace Switch Events
    const ws = this.app.workspace as unknown as Events;
    this.registerEvent(
      ws.on('vps-space-activated', (spaceId: unknown) => {
        void this.activateSpace(spaceId as string);
      })
    );

    this.registerEvent(
      ws.on('vps-open-dashboard', (spaceId: unknown) => {
        void this.openDashboard(spaceId as string);
      })
    );

    this.registerEvent(
      ws.on('vps-space-updated', () => {
        this.updateViews();
      })
    );

    this.registerEvent(
      ws.on('vps-space-deleted', () => {
        this.updateViews();
      })
    );

    // Commands
    this.addCommand({
      id: 'create-space',
      name: '新建项目空间 (Create Space)',
      callback: () => {
        new SpaceModal(this.app, async (name, icon, color) => {
          const space = await this.spaceManager.createSpace(name, icon, color);
          void this.activateSpace(space.id);
        }).open();
      }
    });

    this.addCommand({
      id: 'switch-space',
      name: '切换项目空间 (Switch Space)',
      callback: () => {
        const spaces = this.spaceManager.getSpaces();
        if (spaces.length === 0) {
          new Notice('暂无项目空间，请先创建一个！');
          return;
        }
        
        new SpaceSuggestModal(this.app, spaces, (space) => {
          void this.activateSpace(space.id);
        }).open();
      }
    });

    this.addCommand({
      id: 'open-active-dashboard',
      name: '打开当前空间控制面板 (Open Dashboard)',
      callback: () => {
        if (this.settings.activeSpaceId) {
          void this.openDashboard(this.settings.activeSpaceId);
        } else {
          new Notice('未激活任何项目空间！');
        }
      }
    });

    // Intercept Ctrl+Shift+S / Cmd+Shift+S to save/move notes using capturing listener to beat editor hotkeys
    this.registerDomEvent(activeDocument, 'keydown', (evt: KeyboardEvent) => {
      // Ensure the key itself is not a modifier key like Control, Meta, or Shift
      if (evt.key === 'Control' || evt.key === 'Meta' || evt.key === 'Shift') {
        return;
      }
      const isS = evt.key === 's' || evt.key === 'S' || evt.code === 'KeyS';
      if ((evt.ctrlKey || evt.metaKey) && evt.shiftKey && isS) {
        const activeFile = this.app.workspace.getActiveFile();
        if (activeFile) {
          evt.preventDefault();
          evt.stopPropagation();
          void this.promptSaveTempNote(activeFile);
        }
      }
    }, true);
  }

  onunload() {
    if (this.isSavePending) {
      void this.performSave();
    }
  }

  async loadPluginSettings() {
    const CONFIG_DIR = this.manifest.dir || `${this.app.vault.configDir}/plugins/project-verse`;
    const SETTINGS_PATH = `${CONFIG_DIR}/settings.json`;
    const SPACES_DIR = `${CONFIG_DIR}/spaces`;
    const adapter = this.app.vault.adapter;

    let loadedSettings: Partial<PluginSettings> | null = null;
    const spaces: ProjectSpace[] = [];
    let migrationNeeded = false;

    try {
      if (await adapter.exists(SETTINGS_PATH)) {
        const settingsContent = await adapter.read(SETTINGS_PATH);
        loadedSettings = JSON.parse(settingsContent) as Partial<PluginSettings>;

        if (await adapter.exists(SPACES_DIR)) {
          const filesList = await adapter.list(SPACES_DIR);
          for (const filePath of filesList.files) {
            if (filePath.endsWith('.json')) {
              try {
                const spaceContent = await adapter.read(filePath);
                const spaceObj = JSON.parse(spaceContent) as ProjectSpace;
                if (spaceObj && spaceObj.id) {
                  spaces.push(spaceObj);
                }
              } catch (err) {
                console.error(`Failed to load space file: ${filePath}`, err);
              }
            }
          }
        }
        
        this.settings = Object.assign({}, DEFAULT_SETTINGS, loadedSettings);
        this.settings.spaces = spaces;
      } else {
        const oldPluginDir = this.manifest.dir || `${this.app.vault.configDir}/plugins/project-verse`;
        const oldDataPath = `${oldPluginDir}/spaces.json`;
        let oldData: Partial<PluginSettings> | null = null;

        if (await adapter.exists(oldDataPath)) {
          try {
            const content = await adapter.read(oldDataPath);
            oldData = JSON.parse(content) as Partial<PluginSettings>;
            migrationNeeded = true;
          } catch (e) {
            console.warn("Failed to read old spaces.json", e);
          }
        } else {
          const standardData = await this.loadData() as Partial<PluginSettings> | null;
          if (standardData && (standardData.spaces || standardData.activeSpaceId)) {
            oldData = standardData;
            migrationNeeded = true;
          }
        }

        if (oldData) {
          this.settings = Object.assign({}, DEFAULT_SETTINGS, oldData);
          if (migrationNeeded) {
            this.isSavePending = true;
            await this.performSave();
            
            if (await adapter.exists(oldDataPath)) {
              try {
                await adapter.rename(oldDataPath, `${oldDataPath}.bak`);
              } catch (e) {
                console.warn("Failed to rename old spaces.json to .bak", e);
              }
            }
          }
        } else {
          this.settings = Object.assign({}, DEFAULT_SETTINGS);
        }
      }
    } catch (e) {
      console.error("Failed to load plugin settings", e);
      this.settings = Object.assign({}, DEFAULT_SETTINGS);
    }
  }

  async savePluginSettings() {
    this.isSavePending = true;
    this.debouncedSave();
  }

  async performSave() {
    if (!this.isSavePending) return;
    this.isSavePending = false;

    const CONFIG_DIR = this.manifest.dir || `${this.app.vault.configDir}/plugins/project-verse`;
    const SETTINGS_PATH = `${CONFIG_DIR}/settings.json`;
    const SPACES_DIR = `${CONFIG_DIR}/spaces`;
    const adapter = this.app.vault.adapter;

    try {
      if (!(await adapter.exists(CONFIG_DIR))) {
        await adapter.mkdir(CONFIG_DIR);
      }
      if (!(await adapter.exists(SPACES_DIR))) {
        await adapter.mkdir(SPACES_DIR);
      }

      const { spaces: _spaces, ...globalSettings } = this.settings;
      await adapter.write(SETTINGS_PATH, JSON.stringify(globalSettings, null, 2));

      const currentSpaceIds = new Set<string>();
      for (const space of this.settings.spaces) {
        currentSpaceIds.add(space.id);
        const spacePath = `${SPACES_DIR}/${space.id}.json`;
        await adapter.write(spacePath, JSON.stringify(space, null, 2));
      }

      try {
        const filesList = await adapter.list(SPACES_DIR);
        for (const filePath of filesList.files) {
          const fileName = filePath.split('/').pop() || '';
          if (fileName.endsWith('.json')) {
            const spaceId = fileName.slice(0, -5);
            if (!currentSpaceIds.has(spaceId)) {
              await adapter.remove(filePath);
            }
          }
        }
      } catch (e) {
        console.error("Failed to clean up deleted space files", e);
      }
    } catch (e) {
      console.error("Failed to perform save settings", e);
    }
  }

  async activateSpace(spaceId: string) {
    const oldSpaceId = this.settings.activeSpaceId;
    
    // 1. Save current workspace layout state (all open markdown tabs) for the old space
    if (oldSpaceId) {
      const oldSpace = this.spaceManager.getSpace(oldSpaceId);
      if (oldSpace) {
        const openTabs: string[] = [];
        this.app.workspace.iterateRootLeaves((leaf) => {
          if (leaf.view.getViewType() === 'markdown') {
            const file = (leaf.view as any).file;
            if (file instanceof TFile) {
              openTabs.push(file.path);
            }
          }
        });
        
        const activeFile = this.app.workspace.getActiveFile();
        await this.spaceManager.updateSpace(oldSpaceId, {
          workspace: {
            openTabs,
            activeTab: activeFile?.path
          }
        });
      }
    }

    // 2. Close all currently open markdown tabs
    this.app.workspace.iterateRootLeaves((leaf) => {
      if (leaf.view.getViewType() === 'markdown') {
        leaf.detach();
      }
    });

    // 3. Switch active space and refresh UI views
    this.settings.activeSpaceId = spaceId;
    await this.savePluginSettings();
    this.updateViews();

    // 4. Restore workspace layout state for the newly active space
    const newSpace = this.spaceManager.getSpace(spaceId);
    if (newSpace && newSpace.workspace && newSpace.workspace.openTabs) {
      const workspace = newSpace.workspace;
      for (const filePath of workspace.openTabs) {
        const file = this.app.vault.getAbstractFileByPath(filePath);
        if (file instanceof TFile) {
          await this.app.workspace.getLeaf('tab').openFile(file);
        }
      }
      
      // Restore active focused tab if it exists
      const activeTab = workspace.activeTab;
      if (activeTab) {
        this.app.workspace.iterateRootLeaves((leaf) => {
          if (leaf.view.getViewType() === 'markdown') {
            const file = (leaf.view as any).file;
            if (file instanceof TFile && file.path === activeTab) {
              this.app.workspace.setActiveLeaf(leaf, { focus: true });
            }
          }
        });
      }
    }

    // Open Dashboard automatically on activation
    if (this.settings.enableDashboard) {
      this.openDashboard(spaceId);
    }
  }

  async activateExplorerView() {
    const { workspace } = this.app;
    let leaf: WorkspaceLeaf | null = null;
    const leaves = workspace.getLeavesOfType(VIEW_TYPE_SPACE_EXPLORER);

    if (leaves.length > 0) {
      leaf = leaves[0];
    } else {
      const leftLeaf = workspace.getLeftLeaf(false);
      if (leftLeaf) {
        leaf = leftLeaf;
        await leaf.setViewState({
          type: VIEW_TYPE_SPACE_EXPLORER,
          active: true,
        });
      }
    }

    if (leaf) {
      workspace.revealLeaf(leaf);
    }
  }

  async openDashboard(spaceId: string) {
    const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_SPACE_DASHBOARD);
    let leaf: WorkspaceLeaf;

    if (leaves.length > 0) {
      leaf = leaves[0];
    } else {
      leaf = this.app.workspace.getLeaf('tab');
      await leaf.setViewState({
        type: VIEW_TYPE_SPACE_DASHBOARD,
        active: true,
      });
    }

    const view = leaf.view as SpaceDashboardView;
    view.setSpaceId(spaceId);
    this.app.workspace.revealLeaf(leaf);
  }

  updateViews() {
    this.app.workspace.getLeavesOfType(VIEW_TYPE_SPACE_EXPLORER).forEach((leaf) => {
      if (leaf.view instanceof SpaceExplorerView) {
        leaf.view.render();
      }
    });

    this.app.workspace.getLeavesOfType(VIEW_TYPE_SPACE_DASHBOARD).forEach((leaf) => {
      if (leaf.view instanceof SpaceDashboardView) {
        leaf.view.render();
      }
    });
  }

  async promptSaveTempNote(file: TFile) {
    let defaultFolder = '/';
    let activeSpace = this.settings.activeSpaceId ? this.spaceManager.getSpace(this.settings.activeSpaceId) : undefined;
    
    // Prioritize the space-specific last saved folder path first
    if (activeSpace && activeSpace.lastSavedFolderPath && this.app.vault.getAbstractFileByPath(activeSpace.lastSavedFolderPath) instanceof TFolder) {
      defaultFolder = activeSpace.lastSavedFolderPath;
    } else if (activeSpace) {
      if (activeSpace.folders.length > 0) {
        defaultFolder = activeSpace.folders[0];
      } else {
        // If the space has no folders configured, check if a folder with the same name as the space exists in the vault.
        // Try exact match first, then case-insensitive.
        const folders = this.app.vault.getAllLoadedFiles().filter(f => f instanceof TFolder) as TFolder[];
        const matchingFolder = folders.find(f => f.name === activeSpace.name) || 
                               folders.find(f => f.name.toLowerCase() === activeSpace.name.toLowerCase());
        if (matchingFolder) {
          defaultFolder = matchingFolder.path;
        }
      }
    }

    new SaveNoteModal(this.app, file, defaultFolder, async (newName, folderPath) => {
      let cleanFolder = folderPath === '/' ? '' : folderPath;
      if (cleanFolder.endsWith('/')) {
        cleanFolder = cleanFolder.substring(0, cleanFolder.length - 1);
      }
      
      const destPath = normalizePath(`${cleanFolder}/${newName}.md`);
      
      if (this.app.vault.getAbstractFileByPath(destPath)) {
        new Notice(`文件已存在: ${destPath}`);
        return;
      }

      try {
        await this.app.fileManager.renameFile(file, destPath);
        new Notice(`笔记已保存至: ${destPath}`);
        
        // Save the chosen folder path as space-specific last saved folder path in settings
        if (this.settings.activeSpaceId) {
          await this.spaceManager.updateSpace(this.settings.activeSpaceId, {
            lastSavedFolderPath: folderPath
          });
        }
        
        // Remove 'temp-note' tag and the > [!NOTE] temp banner from the file content
        const savedFile = this.app.vault.getAbstractFileByPath(destPath);
        if (savedFile instanceof TFile) {
          let content = await this.app.vault.read(savedFile);
          
          // 1. Remove the note block (> [!NOTE] ... 保存并选择目标文件夹。)
          content = content.replace(/>\s*\[!NOTE\]\s*\r?\n(>\s*这是临时笔记[^\r\n]*\r?\n?)+/gi, '');
          content = content.replace(/>\s*这是临时笔记[^\r\n]*\r?\n?/gi, '');
          
          // 2. Remove 'temp-note' from tags frontmatter
          // First, parse out the yaml frontmatter block
          const frontmatterMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
          if (frontmatterMatch) {
            let yaml = frontmatterMatch[1];
            // Remove 'temp-note' list item or string tag
            yaml = yaml.replace(/^\s*-\s*["']?temp-note["']?\s*\r?\n?/gm, '');
            yaml = yaml.replace(/tags:\s*\[\s*["']?temp-note["']?\s*\]\r?\n?/gi, '');
            yaml = yaml.replace(/tags:\s*["']?temp-note["']?\r?\n?/gi, '');
            // If tags is now empty or has empty lines, clean it up
            yaml = yaml.replace(/tags:\s*\r?\n(\s*\r?\n)+/gi, '');
            content = content.replace(frontmatterMatch[1], yaml);
          }

          // Clean up empty lines or multiple consecutive spaces that may result
          content = content.trim() + '\n';
          await this.app.vault.modify(savedFile, content);
        }

        if (this.settings.activeSpaceId) {
          const space = this.spaceManager.getSpace(this.settings.activeSpaceId);
          if (space) {
            const isSubfolder = space.folders.some(f => 
              destPath.startsWith(f === '/' ? '' : f + '/')
            );
            if (!isSubfolder) {
              await this.spaceManager.addFileToSpace(space.id, destPath);
            }
          }
        }
        
        // Ensure to remove the map reference after save has finalized
        if (this.spaceManager.tempNoteSpaceMap && this.spaceManager.tempNoteSpaceMap[file.path]) {
          delete this.spaceManager.tempNoteSpaceMap[file.path];
        }

        this.updateViews();
      } catch (e) {
        console.error("Failed to save temp note", e);
        new Notice("保存失败，请检查路径是否正确。");
      }
    }).open();
  }
}

class SpaceSuggestModal extends SuggestModal<ProjectSpace> {
  private spaces: ProjectSpace[];
  private onChoose: (space: ProjectSpace) => void;

  constructor(app: App, spaces: ProjectSpace[], onChoose: (space: ProjectSpace) => void) {
    super(app);
    this.spaces = spaces;
    this.onChoose = onChoose;
    this.setPlaceholder("选择要切换的项目空间...");
  }

  getSuggestions(query: string): ProjectSpace[] {
    return this.spaces.filter(space => space.name.toLowerCase().includes(query.toLowerCase()));
  }

  renderSuggestion(space: ProjectSpace, el: HTMLElement) {
    el.createEl("div", { text: space.name });
  }

  onChooseSuggestion(space: ProjectSpace, evt: MouseEvent | KeyboardEvent) {
    this.onChoose(space);
  }
}


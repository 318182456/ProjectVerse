import { Plugin, WorkspaceLeaf, TFile, TFolder, TAbstractFile, Notice, normalizePath } from 'obsidian';
import { SpaceManager } from './spaceManager';
import { VIEW_TYPE_SPACE_EXPLORER, SpaceExplorerView } from './spaceExplorerView';
import { VIEW_TYPE_SPACE_DASHBOARD, SpaceDashboardView } from './spaceDashboardView';
import { PluginSettings, DEFAULT_SETTINGS } from './types';
import { SpaceModal } from './spaceModal';
import { SaveNoteModal } from './saveNoteModal';

export default class VirtualProjectSpacePlugin extends Plugin {
  settings: PluginSettings = DEFAULT_SETTINGS;
  spaceManager!: SpaceManager;

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
    this.addRibbonIcon('rocket', '🚀 项目空间 Explorer', () => {
      this.activateExplorerView();
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

          const subMenu = (item as any).setSubmenu();
          
          this.settings.spaces.forEach(space => {
            subMenu.addItem((subItem: any) => {
              subItem.setTitle(space.name)
                .onClick(async () => {
                  if (file instanceof TFile) {
                    await this.spaceManager.addFileToSpace(space.id, file.path);
                  } else if (file instanceof TFolder) {
                    await this.spaceManager.addFolderToSpace(space.id, file.path);
                  }
                });
            });
          });

          subMenu.addSeparator();
          subMenu.addItem((subItem: any) => {
            subItem.setTitle('+ 新建空间并添加')
              .onClick(() => {
                new SpaceModal(this.app, async (name, icon, color) => {
                  const newSpace = await this.spaceManager.createSpace(name, icon, color);
                  if (file instanceof TFile) {
                    await this.spaceManager.addFileToSpace(newSpace.id, file.path);
                  } else if (file instanceof TFolder) {
                    await this.spaceManager.addFolderToSpace(newSpace.id, file.path);
                  }
                  this.activateSpace(newSpace.id);
                }).open();
              });
          });
        });
      })
    );

    // Watch File Renames and Deletions
    this.registerEvent(
      this.app.vault.on('rename', async (file, oldPath) => {
        await this.spaceManager.handleFileRename(oldPath, file.path);
        this.updateViews();
      })
    );

    this.registerEvent(
      this.app.vault.on('delete', async (file) => {
        await this.spaceManager.handleFileDelete(file.path);
        this.updateViews();
      })
    );

    // Global Custom Workspace Switch Events
    const ws = this.app.workspace as any;
    this.registerEvent(
      ws.on('vps-space-activated', (spaceId: string) => {
        this.activateSpace(spaceId);
      })
    );

    this.registerEvent(
      ws.on('vps-open-dashboard', (spaceId: string) => {
        this.openDashboard(spaceId);
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
          this.activateSpace(space.id);
        }).open();
      }
    });

    this.addCommand({
      id: 'switch-space',
      name: '切换项目空间 (Switch Space)',
      callback: () => {
        // Build a quick picker using a custom modal or command list
        // Obsidian commands usually don't have built-in quick pickers, but we can use fuzzy suggest modals
        // Let's implement a simple list of sub-commands or show switch prompt
        const spaces = this.spaceManager.getSpaces();
        if (spaces.length === 0) {
          alert('暂无项目空间，请先创建一个！');
          return;
        }
        
        // Use standard prompt for simplicity
        const names = spaces.map((s, idx) => `${idx + 1}. ${s.name}`).join('\n');
        const selection = prompt(`请输入要切换的空间序号：\n${names}`);
        if (selection) {
          const idx = parseInt(selection) - 1;
          if (spaces[idx]) {
            this.activateSpace(spaces[idx].id);
          }
        }
      }
    });

    this.addCommand({
      id: 'open-active-dashboard',
      name: '打开当前空间控制面板 (Open Dashboard)',
      callback: () => {
        if (this.settings.activeSpaceId) {
          this.openDashboard(this.settings.activeSpaceId);
        } else {
          alert('未激活任何项目空间！');
        }
      }
    });

    // Intercept Ctrl+S / Cmd+S to save temporary notes
    this.registerDomEvent(window, 'keydown', (evt: KeyboardEvent) => {
      if ((evt.ctrlKey || evt.metaKey) && evt.key === 's') {
        const activeFile = this.app.workspace.getActiveFile();
        if (activeFile && activeFile.name.startsWith('_temp_')) {
          evt.preventDefault();
          this.promptSaveTempNote(activeFile);
        }
      }
    });
  }

  async onunload() {
    this.app.workspace.detachLeavesOfType(VIEW_TYPE_SPACE_EXPLORER);
    this.app.workspace.detachLeavesOfType(VIEW_TYPE_SPACE_DASHBOARD);
  }

  async loadPluginSettings() {
    const pluginDir = this.manifest.dir || '.obsidian/plugins/projectVerse';
    const dataPath = `${pluginDir}/spaces.json`;
    let loadedData: any = null;

    try {
      if (await this.app.vault.adapter.exists(dataPath)) {
        const content = await this.app.vault.adapter.read(dataPath);
        loadedData = JSON.parse(content);
      } else {
        // Fallback to standard data.json
        loadedData = await this.loadData();
      }
    } catch (e) {
      console.warn("Failed to load spaces.json, falling back to empty settings", e);
    }

    this.settings = Object.assign({}, DEFAULT_SETTINGS, loadedData);
  }

  async savePluginSettings() {
    // Save to the custom path requested
    const pluginDir = this.manifest.dir || '.obsidian/plugins/projectVerse';
    const dataPath = `${pluginDir}/spaces.json`;
    try {
      // Ensure plugin folder exists
      if (!(await this.app.vault.adapter.exists(pluginDir))) {
        await this.app.vault.adapter.mkdir(pluginDir);
      }
      await this.app.vault.adapter.write(dataPath, JSON.stringify(this.settings, null, 2));
    } catch (e) {
      console.error("Failed to write to spaces.json", e);
    }
    await this.saveData(this.settings);
  }

  async activateSpace(spaceId: string) {
    const oldSpaceId = this.settings.activeSpaceId;
    
    // Save current workspace layout state if setting enabled
    if (this.settings.enableWorkspaceSync && oldSpaceId) {
      const oldSpace = this.spaceManager.getSpace(oldSpaceId);
      if (oldSpace) {
        const openTabs: string[] = [];
        this.app.workspace.iterateAllLeaves((leaf) => {
          const file = (leaf.view as any).file;
          if (file instanceof TFile) {
            openTabs.push(file.path);
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

    this.settings.activeSpaceId = spaceId;
    await this.savePluginSettings();
    this.updateViews();

    // Restore workspace layout state for the new space
    if (this.settings.enableWorkspaceSync) {
      const newSpace = this.spaceManager.getSpace(spaceId);
      if (newSpace && newSpace.workspace && newSpace.workspace.openTabs.length > 0) {
        // Close all current markdown leaves
        this.app.workspace.iterateRootLeaves((leaf) => {
          if (leaf.view.getViewType() === 'markdown') {
            leaf.detach();
          }
        });

        // Open stored files
        for (const filePath of newSpace.workspace.openTabs) {
          const file = this.app.vault.getAbstractFileByPath(filePath);
          if (file instanceof TFile) {
            await this.app.workspace.getLeaf('tab').openFile(file);
          }
        }
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
    if (this.settings.activeSpaceId) {
      const space = this.spaceManager.getSpace(this.settings.activeSpaceId);
      if (space && space.folders.length > 0) {
        defaultFolder = space.folders[0];
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
        
        this.updateViews();
      } catch (e) {
        console.error("Failed to save temp note", e);
        new Notice("保存失败，请检查路径是否正确。");
      }
    }).open();
  }
}

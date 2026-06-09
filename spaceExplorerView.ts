import { ItemView, WorkspaceLeaf, setIcon, TFile, TFolder, Menu, normalizePath, Notice, Modal, Setting, App } from 'obsidian';
import { SpaceManager } from './spaceManager';
import { SpaceModal } from './spaceModal';

export const VIEW_TYPE_SPACE_EXPLORER = 'virtual-project-space-explorer';

interface VirtualNode {
  name: string;
  path: string;
  isFolder: boolean;
  children: Map<string, VirtualNode>;
  file?: TFile;
}

export class SpaceExplorerView extends ItemView {
  private spaceManager: SpaceManager;
  private searchKeyword: string = '';
  private expandedPaths: Set<string> = new Set<string>();
  private selectedPath: string | null = null;
  private selectedIsFolder: boolean = false;

  constructor(leaf: WorkspaceLeaf, spaceManager: SpaceManager) {
    super(leaf);
    this.spaceManager = spaceManager;
  }

  getViewType(): string {
    return VIEW_TYPE_SPACE_EXPLORER;
  }

  getDisplayText(): string {
    return '项目空间';
  }

  getIcon(): string {
    return 'layers';
  }

  async onOpen() {
    this.render();
  }

  async onClose() {
    // Nothing to clean up
  }

  setKeyword(kw: string) {
    this.searchKeyword = kw;
    this.render();
  }

  public render() {
    const container = this.containerEl.children[1];
    container.empty();
    container.addClass('vps-explorer-container');

    // 1. Header
    const header = container.createDiv({ cls: 'vps-explorer-header' });
    header.createDiv({ cls: 'vps-explorer-title', text: '🗂️ 项目空间' });
    
    const headerActions = header.createDiv({ cls: 'vps-explorer-header-actions' });
    headerActions.addEventListener('click', (e) => e.stopPropagation());
    
    const activeSpaceId = (this.app as unknown as { plugins: { plugins: Record<string, { settings: { activeSpaceId: string } }> } }).plugins?.plugins?.['project-verse']?.settings?.activeSpaceId;
    const activeSpace = activeSpaceId ? this.spaceManager.getSpace(activeSpaceId) : null;

    const addBtn = headerActions.createDiv({ cls: 'vps-space-action-btn' });
    setIcon(addBtn, 'plus');
    addBtn.setAttribute('title', '新建空间/笔记/文件夹');
    addBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (activeSpace) {
        const menu = new Menu();
        
        // 1. New Note
        menu.addItem(item => {
          item.setTitle("新建笔记")
            .setIcon("file-plus")
            .onClick(async () => {
              const path = this.selectedPath;
              const isFolder = this.selectedIsFolder;
              let parentPath = '';
              if (path) {
                parentPath = path;
                if (!isFolder) {
                  const lastSlash = path.lastIndexOf('/');
                  parentPath = lastSlash !== -1 ? path.substring(0, lastSlash) : '';
                }
              }
              new InputModal(this.app, "新建笔记", "笔记名称", "请输入笔记名称...", "", async (noteName) => {
                if (noteName) {
                  const newPath = normalizePath(`${parentPath}/${noteName}.md`);
                  if (await this.app.vault.adapter.exists(newPath)) {
                    new Notice("该笔记已存在！");
                    return;
                  }
                  await this.app.vault.create(newPath, "");
                  const space = this.spaceManager.getSpace(activeSpace.id);
                  if (space) {
                    const isSubfolder = space.folders.some(f => newPath.startsWith(f === '/' ? '' : f + '/'));
                    if (!isSubfolder) {
                      await this.spaceManager.addFileToSpace(activeSpace.id, newPath);
                    }
                  }
                  new Notice(`笔记创建成功: ${newPath}`);
                  this.render();
                }
              }).open();
            });
        });

        // 2. New Folder
        menu.addItem(item => {
          item.setTitle("新建文件夹")
            .setIcon("folder-plus")
            .onClick(async () => {
              const path = this.selectedPath;
              const isFolder = this.selectedIsFolder;
              let parentPath = '';
              if (path) {
                parentPath = path;
                if (!isFolder) {
                  const lastSlash = path.lastIndexOf('/');
                  parentPath = lastSlash !== -1 ? path.substring(0, lastSlash) : '';
                }
              }
              new InputModal(this.app, "新建文件夹", "文件夹名称", "请输入文件夹名称...", "", async (folderName) => {
                if (folderName) {
                  const newPath = normalizePath(`${parentPath}/${folderName}`);
                  if (await this.app.vault.adapter.exists(newPath)) {
                    new Notice("该文件夹已存在！");
                    return;
                  }
                  await this.app.vault.createFolder(newPath);
                  await this.spaceManager.addFolderToSpace(activeSpace.id, newPath);
                  new Notice(`文件夹创建成功: ${newPath}`);
                  this.render();
                }
              }).open();
            });
        });

        menu.addSeparator();

        // 3. New Project Space
        menu.addItem(item => {
          item.setTitle("新建项目空间")
            .setIcon("folder-git")
            .onClick(() => {
              new SpaceModal(this.app, async (name, icon, color) => {
                const space = await this.spaceManager.createSpace(name, icon, color);
                this.app.workspace.trigger('vps-space-activated', space.id);
                this.render();
              }).open();
            });
        });

        menu.showAtMouseEvent(e);
      } else {
        // No active space -> directly create space
        new SpaceModal(this.app, async (name, icon, color) => {
          const space = await this.spaceManager.createSpace(name, icon, color);
          this.app.workspace.trigger('vps-space-activated', space.id);
          this.render();
        }).open();
      }
    });

    if (activeSpace) {
      // Copy Space/Folder/File
      const copyBtn = headerActions.createDiv({ cls: 'vps-space-action-btn' });
      setIcon(copyBtn, 'copy');
      copyBtn.setAttribute('title', '复制空间/文件夹/笔记');
      copyBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const path = this.selectedPath;
        const isFolder = this.selectedIsFolder;
        if (path) {
          if (isFolder) {
            // Copy Folder
            new InputModal(this.app, "复制文件夹", "新文件夹名称", "请输入新文件夹名称...", "", async (folderName) => {
              if (folderName) {
                const lastSlash = path.lastIndexOf('/');
                const parentPath = lastSlash !== -1 ? path.substring(0, lastSlash) : '';
                const newFolderPath = normalizePath(`${parentPath}/${folderName}`);
                if (await this.app.vault.adapter.exists(newFolderPath)) {
                  new Notice("目标文件夹已存在！");
                  return;
                }
                await this.app.vault.createFolder(newFolderPath);
                
                const files = this.app.vault.getFiles();
                const sourcePrefix = path + '/';
                for (const file of files) {
                  if (file.path.startsWith(sourcePrefix)) {
                    const relativePath = file.path.substring(sourcePrefix.length);
                    const destPath = normalizePath(`${newFolderPath}/${relativePath}`);
                    const destLastSlash = destPath.lastIndexOf('/');
                    if (destLastSlash !== -1) {
                      const destParent = destPath.substring(0, destLastSlash);
                      if (!(await this.app.vault.adapter.exists(destParent))) {
                        await this.app.vault.createFolder(destParent);
                      }
                    }
                    await this.app.vault.copy(file, destPath);
                    
                    const space = this.spaceManager.getSpace(activeSpace.id);
                    if (space) {
                      const isSubfolder = space.folders.some(f => destPath.startsWith(f === '/' ? '' : f + '/'));
                      if (!isSubfolder) {
                        await this.spaceManager.addFileToSpace(activeSpace.id, destPath);
                      }
                    }
                  }
                }
                new Notice("文件夹复制成功！");
                this.render();
              }
            }).open();
          } else {
            // Copy File
            const lastSlash = path.lastIndexOf('/');
            const parentPath = lastSlash !== -1 ? path.substring(0, lastSlash) : '';
            const extMatch = path.match(/\.[^/.]+$/);
            const ext = extMatch ? extMatch[0] : '';
            const baseName = extMatch ? path.substring(lastSlash + 1, path.length - ext.length) : path.substring(lastSlash + 1);
            new InputModal(this.app, "复制笔记", "新笔记名称", "请输入新笔记名称...", `${baseName}_copy`, async (newName) => {
              if (newName) {
                const newPath = normalizePath(`${parentPath}/${newName}${ext}`);
                const file = this.app.vault.getAbstractFileByPath(path);
                if (file instanceof TFile) {
                  await this.app.vault.copy(file, newPath);
                  const space = this.spaceManager.getSpace(activeSpace.id);
                  if (space) {
                    const isSubfolder = space.folders.some(f => newPath.startsWith(f === '/' ? '' : f + '/'));
                    if (!isSubfolder) {
                      await this.spaceManager.addFileToSpace(activeSpace.id, newPath);
                    }
                  }
                  new Notice("文件复制成功！");
                  this.render();
                }
              }
            }).open();
          }
        } else {
          const newSpace = await this.spaceManager.duplicateSpace(activeSpace.id);
          if (newSpace) {
            this.app.workspace.trigger('vps-space-activated', newSpace.id);
          }
          this.render();
        }
      });

      // Edit Space/Folder/File
      const editBtn = headerActions.createDiv({ cls: 'vps-space-action-btn' });
      setIcon(editBtn, 'pencil');
      editBtn.setAttribute('title', '编辑空间/重命名');
      editBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const path = this.selectedPath;
        const isFolder = this.selectedIsFolder;
        if (path) {
          if (isFolder) {
            // Rename Folder
            const lastSlash = path.lastIndexOf('/');
            const parentPath = lastSlash !== -1 ? path.substring(0, lastSlash) : '';
            const currentName = lastSlash !== -1 ? path.substring(lastSlash + 1) : path;
            new InputModal(this.app, "重命名文件夹", "新文件夹名称", "请输入新文件夹名称...", currentName, async (newName) => {
              if (newName && newName !== currentName) {
                const newPath = normalizePath(`${parentPath}/${newName}`);
                const folder = this.app.vault.getAbstractFileByPath(path);
                if (folder instanceof TFolder) {
                  await this.app.fileManager.renameFile(folder, newPath);
                  this.selectedPath = newPath;
                  new Notice("文件夹重命名成功！");
                  this.render();
                }
              }
            }).open();
          } else {
            // Rename File
            const lastSlash = path.lastIndexOf('/');
            const parentPath = lastSlash !== -1 ? path.substring(0, lastSlash) : '';
            const extMatch = path.match(/\.[^/.]+$/);
            const ext = extMatch ? extMatch[0] : '';
            const baseName = extMatch ? path.substring(lastSlash + 1, path.length - ext.length) : path.substring(lastSlash + 1);
            new InputModal(this.app, "重命名笔记", "新笔记名称", "请输入新笔记名称...", baseName, async (newName) => {
              if (newName && newName !== baseName) {
                const newPath = normalizePath(`${parentPath}/${newName}${ext}`);
                const file = this.app.vault.getAbstractFileByPath(path);
                if (file instanceof TFile) {
                  await this.app.fileManager.renameFile(file, newPath);
                  this.selectedPath = newPath;
                  new Notice("文件重命名成功！");
                  this.render();
                }
              }
            }).open();
          }
        } else {
          new SpaceModal(this.app, async (name, icon, color) => {
            await this.spaceManager.updateSpace(activeSpace.id, { name, icon, color });
            this.render();
            this.app.workspace.trigger('vps-space-updated', activeSpace.id);
          }, activeSpace).open();
        }
      });

      // Delete Space/Folder/File
      const deleteBtn = headerActions.createDiv({ cls: 'vps-space-action-btn' });
      setIcon(deleteBtn, 'trash-2');
      deleteBtn.setAttribute('title', '删除空间/移出/物理删除');
      deleteBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (this.selectedPath) {
          if (this.selectedIsFolder) {
            const confirmRemove = await CustomConfirmModal.show(this.app, "移出文件夹", `确定要从当前空间移出文件夹 "${this.selectedPath}" 及其包含的所有文件吗？\n（此操作不会物理删除文件夹与文件）`, [
              { text: "确定移出", variant: "danger", value: true },
              { text: "取消", variant: "secondary", value: false }
            ], false);
            if (confirmRemove) {
              const space = this.spaceManager.getSpace(activeSpace.id);
              if (space) {
                space.files = space.files.filter(f => !f.startsWith(this.selectedPath + '/'));
                space.folders = space.folders.filter(f => f !== this.selectedPath && !f.startsWith(this.selectedPath + '/'));
                await this.spaceManager.updateSpace(activeSpace.id, {
                  files: space.files,
                  folders: space.folders
                });
                this.selectedPath = null;
                this.render();
              }
            }
          } else {
            const choice = await CustomConfirmModal.show(this.app, "删除或移出文件", `您想如何处理文件 "${this.selectedPath}"？`, [
              { text: "彻底删除文件", variant: "danger", value: "delete" },
              { text: "仅移出当前空间", variant: "cta", value: "remove" },
              { text: "取消", variant: "secondary", value: "cancel" }
            ], "cancel");
            if (choice === "delete") {
              const file = this.app.vault.getAbstractFileByPath(this.selectedPath);
              if (file instanceof TFile) {
                await this.app.fileManager.trashFile(file);
                this.selectedPath = null;
                this.render();
              }
            } else if (choice === "remove") {
              await this.spaceManager.removeFileFromSpace(activeSpace.id, this.selectedPath);
              this.selectedPath = null;
              this.render();
            }
          }
        } else {
          const confirmDelete = await CustomConfirmModal.show(this.app, "删除空间", `确定要删除空间 "${activeSpace.name}" 吗？\n此操作不会删除物理文件。`, [
            { text: "确定删除", variant: "danger", value: true },
            { text: "取消", variant: "secondary", value: false }
          ], false);
          if (confirmDelete) {
            await this.spaceManager.deleteSpace(activeSpace.id);
            this.render();
            this.app.workspace.trigger('vps-space-deleted', activeSpace.id);
          }
        }
      });
    }

    // Add global click listener on container to clear selection
    container.addEventListener('click', () => {
      if (this.selectedPath) {
        this.selectedPath = null;
        this.render();
      }
    });

    // 2. Space List
    const spaces = this.spaceManager.getSpaces();

    const spacesListEl = container.createDiv({ cls: 'vps-spaces-list' });
    
    spaces.forEach(space => {
      // Simple filter
      if (this.searchKeyword && !space.name.toLowerCase().includes(this.searchKeyword.toLowerCase())) {
        return;
      }

      const isActive = space.id === activeSpaceId;
      const spaceItem = spacesListEl.createDiv({ 
        cls: `vps-space-item ${isActive ? 'is-active' : ''}` 
      });
      
      // Apply space color
      spaceItem.style.setProperty('--space-color', space.color);
      
      const iconEl = spaceItem.createDiv({ cls: 'vps-space-icon' });
      setIcon(iconEl, space.icon.replace('lucide-', ''));

      const infoEl = spaceItem.createDiv({ cls: 'vps-space-info' });
      infoEl.createDiv({ cls: 'vps-space-name', text: space.name });

      // Activate Space on click
      spaceItem.addEventListener('click', (e) => {
        e.stopPropagation();
        this.selectedPath = null;
        this.app.workspace.trigger('vps-space-activated', space.id);
      });

      // Drag & Drop for reordering spaces
      spaceItem.setAttribute('draggable', 'true');
      
      spaceItem.addEventListener('dragstart', (e: DragEvent) => {
        if (e.dataTransfer) {
          e.dataTransfer.setData('vps-space-drag', space.id);
          e.dataTransfer.effectAllowed = 'move';
        }
        spaceItem.addClass('is-dragging');
      });

      spaceItem.addEventListener('dragend', () => {
        spaceItem.removeClass('is-dragging');
      });

      spaceItem.addEventListener('dragover', (e: DragEvent) => {
        if (e.dataTransfer && e.dataTransfer.types.includes('vps-space-drag')) {
          e.preventDefault();
          spaceItem.addClass('drag-over');
        }
      });

      spaceItem.addEventListener('dragleave', () => {
        spaceItem.removeClass('drag-over');
      });

      spaceItem.addEventListener('drop', async (e: DragEvent) => {
        if (e.dataTransfer) {
          const draggedId = e.dataTransfer.getData('vps-space-drag');
          if (draggedId && draggedId !== space.id) {
            e.preventDefault();
            e.stopPropagation();
            spaceItem.removeClass('drag-over');
            await this.spaceManager.reorderSpaces(draggedId, space.id);
            this.render();
          }
        }
      });
    });

    // 4. Virtual File Tree of Active Space
    if (activeSpaceId) {
      const activeSpace = this.spaceManager.getSpace(activeSpaceId);
      if (activeSpace) {
        const treeContainer = container.createDiv({ cls: 'vps-tree-container' });
        


        // Build Virtual Folder Tree
        const files = this.spaceManager.getSpaceFiles(activeSpaceId);
        const folders = this.spaceManager.getSpaceFolders(activeSpaceId);
        if (files.length === 0 && folders.length === 0) {
          treeContainer.createDiv({ 
            text: '该空间暂无关联文件。右键文件列表选择 "Add to Space" 加入。',
            cls: 'vps-space-meta vps-space-meta-padding'
          });
        } else {
          const rootNode = this.buildVirtualTree(files, folders);
          this.renderTreeNodes(treeContainer, rootNode, 0, activeSpaceId);
        }

        // Drop on root area to move to vault root
        treeContainer.addEventListener('dragover', (e: DragEvent) => {
          // Only highlight root if we're not dropping directly on a child node
          const target = e.target as HTMLElement;
          if (target === treeContainer || target.classList.contains('vps-tree-title') || target.classList.contains('vps-tree-header')) {
            e.preventDefault();
            treeContainer.addClass('drag-over');
          }
        });

        treeContainer.addEventListener('dragleave', (e: DragEvent) => {
          treeContainer.removeClass('drag-over');
        });

        treeContainer.addEventListener('drop', async (e: DragEvent) => {
          const target = e.target as HTMLElement;
          if (target === treeContainer || target.classList.contains('vps-tree-title') || target.classList.contains('vps-tree-header') || treeContainer.classList.contains('drag-over')) {
            e.preventDefault();
            e.stopPropagation();
            treeContainer.removeClass('drag-over');

            if (e.dataTransfer) {
              const dragPath = e.dataTransfer.getData('text/plain');
              const sourceSpaceId = e.dataTransfer.getData('source-space-id');
              if (!dragPath) return;

              const dragFile = this.app.vault.getAbstractFileByPath(dragPath);
              if (dragFile) {
                const newDestPath = normalizePath(dragFile.name);
                if (dragPath !== newDestPath) {
                  try {
                    await this.app.fileManager.renameFile(dragFile, newDestPath);
                    new Notice(`物理移动至根目录: ${newDestPath}`);

                    if (dragFile instanceof TFile) {
                      if (sourceSpaceId && sourceSpaceId !== activeSpaceId) {
                        await this.spaceManager.removeFileFromSpace(sourceSpaceId, dragPath);
                      }
                      
                      const space = this.spaceManager.getSpace(activeSpaceId);
                      if (space) {
                        const isSubfolder = space.folders.some(f => newDestPath.startsWith(f === '/' ? '' : f + '/'));
                        if (!isSubfolder) {
                          await this.spaceManager.addFileToSpace(activeSpaceId, newDestPath);
                        }
                      }
                    } else if (dragFile instanceof TFolder) {
                      if (sourceSpaceId) {
                        await this.spaceManager.removeFolderFromSpace(sourceSpaceId, dragPath);
                      }
                      await this.spaceManager.addFolderToSpace(activeSpaceId, newDestPath);
                    }
                  } catch (err) {
                    console.error("Failed to move item to root", err);
                    new Notice("移至根目录失败！");
                  }
                }
                this.render();
              }
            }
          }
        });
      }
    }
  }

  private buildVirtualTree(files: TFile[], folders: TFolder[]): VirtualNode {
    const root: VirtualNode = {
      name: 'root',
      path: '',
      isFolder: true,
      children: new Map<string, VirtualNode>()
    };

    // First, add all folders
    folders.forEach(folder => {
      if (folder.path === '' || folder.path === '/') return;
      const parts = folder.path.split('/');
      let current = root;
      for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        const currentPath = parts.slice(0, i + 1).join('/');
        if (!current.children.has(part)) {
          current.children.set(part, {
            name: part,
            path: currentPath,
            isFolder: true,
            children: new Map()
          });
        }
        current = current.children.get(part)!;
      }
    });

    // Then, add all files
    files.forEach(file => {
      const parts = file.path.split('/');
      let current = root;

      for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        const isLast = i === parts.length - 1;
        const currentPath = parts.slice(0, i + 1).join('/');

        if (isLast) {
          current.children.set(part, {
            name: part,
            path: currentPath,
            isFolder: false,
            children: new Map(),
            file
          });
        } else {
          if (!current.children.has(part)) {
            current.children.set(part, {
              name: part,
              path: currentPath,
              isFolder: true,
              children: new Map()
            });
          }
          current = current.children.get(part)!;
        }
      }
    });

    return root;
  }

  private renderTreeNodes(parentEl: HTMLElement, node: VirtualNode, depth: number, spaceId: string) {
    // Sort folder first, then files alphabetically
    const sortedKeys = Array.from(node.children.keys()).sort((a, b) => {
      const nodeA = node.children.get(a)!;
      const nodeB = node.children.get(b)!;
      if (nodeA.isFolder && !nodeB.isFolder) return -1;
      if (!nodeA.isFolder && nodeB.isFolder) return 1;
      return a.localeCompare(b);
    });

    sortedKeys.forEach(key => {
      const childNode = node.children.get(key)!;
      
      // Determine if folder should be expanded
      const isExpanded = this.expandedPaths.has(childNode.path);

      const isSelected = childNode.path === this.selectedPath;
      const nodeEl = parentEl.createDiv({ 
        cls: `vps-tree-node vps-tree-node-depth-${depth} ${isSelected ? 'is-selected' : ''}` 
      });
      
      const iconEl = nodeEl.createDiv({ cls: 'vps-tree-node-icon' });
      setIcon(iconEl, childNode.isFolder ? (isExpanded ? 'chevron-down' : 'chevron-right') : 'file-text');

      nodeEl.createDiv({ cls: 'vps-tree-node-name', text: childNode.name });

      // Action context menu
      nodeEl.addEventListener('contextmenu', (e: MouseEvent) => {
        e.preventDefault();
        const menu = new Menu();
        
        if (childNode.isFolder) {
          // Copy Folder
          menu.addItem(item => {
            item.setTitle('复制文件夹')
              .setIcon('copy')
              .onClick(() => {
                new InputModal(this.app, "复制文件夹", "新文件夹名称", "请输入新文件夹名称...", "", async (folderName) => {
                  if (folderName) {
                    const path = childNode.path;
                    const lastSlash = path.lastIndexOf('/');
                    const parentPath = lastSlash !== -1 ? path.substring(0, lastSlash) : '';
                    const newFolderPath = normalizePath(`${parentPath}/${folderName}`);
                    if (await this.app.vault.adapter.exists(newFolderPath)) {
                      new Notice("目标文件夹已存在！");
                      return;
                    }
                    await this.app.vault.createFolder(newFolderPath);
                    
                    const files = this.app.vault.getFiles();
                    const sourcePrefix = path + '/';
                    for (const file of files) {
                      if (file.path.startsWith(sourcePrefix)) {
                        const relativePath = file.path.substring(sourcePrefix.length);
                        const destPath = normalizePath(`${newFolderPath}/${relativePath}`);
                        const destLastSlash = destPath.lastIndexOf('/');
                        if (destLastSlash !== -1) {
                          const destParent = destPath.substring(0, destLastSlash);
                          if (!(await this.app.vault.adapter.exists(destParent))) {
                            await this.app.vault.createFolder(destParent);
                          }
                        }
                        await this.app.vault.copy(file, destPath);
                        
                        const space = this.spaceManager.getSpace(spaceId);
                        if (space) {
                          const isSubfolder = space.folders.some(f => destPath.startsWith(f === '/' ? '' : f + '/'));
                          if (!isSubfolder) {
                            await this.spaceManager.addFileToSpace(spaceId, destPath);
                          }
                        }
                      }
                    }
                    new Notice("文件夹复制成功！");
                    this.render();
                  }
                }).open();
              });
          });

          // Rename Folder
          menu.addItem(item => {
            item.setTitle('重命名文件夹')
              .setIcon('pencil')
              .onClick(() => {
                const path = childNode.path;
                const lastSlash = path.lastIndexOf('/');
                const parentPath = lastSlash !== -1 ? path.substring(0, lastSlash) : '';
                const currentName = lastSlash !== -1 ? path.substring(lastSlash + 1) : path;
                new InputModal(this.app, "重命名文件夹", "新文件夹名称", "请输入新文件夹名称...", currentName, async (newName) => {
                  if (newName && newName !== currentName) {
                    const newPath = normalizePath(`${parentPath}/${newName}`);
                    const folder = this.app.vault.getAbstractFileByPath(path);
                    if (folder instanceof TFolder) {
                      await this.app.fileManager.renameFile(folder, newPath);
                      if (this.selectedPath === path) {
                        this.selectedPath = newPath;
                      }
                      new Notice("文件夹重命名成功！");
                      this.render();
                    }
                  }
                }).open();
              });
          });

          menu.addSeparator();

          menu.addItem(item => {
            item.setTitle('移出文件夹下的所有文件')
              .setIcon('folder-minus')
              .onClick(async () => {
                const space = this.spaceManager.getSpace(spaceId);
                if (space) {
                  space.files = space.files.filter(f => !f.startsWith(childNode.path + '/'));
                  space.folders = space.folders.filter(f => f !== childNode.path && !f.startsWith(childNode.path + '/'));
                  await this.spaceManager.updateSpace(spaceId, {
                    files: space.files,
                    folders: space.folders
                  });
                  if (this.selectedPath === childNode.path) {
                    this.selectedPath = null;
                  }
                  this.render();
                }
              });
          });

          // Physically delete folder
          menu.addItem(item => {
            item.setTitle('彻底删除该文件夹')
              .setIcon('trash-2')
              .onClick(async () => {
                const confirmDelete = await CustomConfirmModal.show(this.app, "彻底删除文件夹", `确定要将文件夹 "${childNode.name}" 及其包含的所有物理文件从您的库中彻底删除吗？\n此操作无法撤销。`, [
                  { text: "确定删除", variant: "danger", value: true },
                  { text: "取消", variant: "secondary", value: false }
                ], false);
                if (confirmDelete) {
                  const folder = this.app.vault.getAbstractFileByPath(childNode.path);
                  if (folder instanceof TFolder) {
                    const space = this.spaceManager.getSpace(spaceId);
                    if (space) {
                      space.files = space.files.filter(f => !f.startsWith(childNode.path + '/'));
                      space.folders = space.folders.filter(f => f !== childNode.path && !f.startsWith(childNode.path + '/'));
                      await this.spaceManager.updateSpace(spaceId, {
                        files: space.files,
                        folders: space.folders
                      });
                    }
                    await this.app.fileManager.trashFile(folder);
                    if (this.selectedPath === childNode.path) {
                      this.selectedPath = null;
                    }
                    this.render();
                    new Notice("文件夹已成功彻底物理删除！");
                  }
                }
              });
          });
        } else {
          // Copy File
          menu.addItem(item => {
            item.setTitle('复制笔记')
              .setIcon('copy')
              .onClick(() => {
                const path = childNode.path;
                const lastSlash = path.lastIndexOf('/');
                const parentPath = lastSlash !== -1 ? path.substring(0, lastSlash) : '';
                const extMatch = path.match(/\.[^/.]+$/);
                const ext = extMatch ? extMatch[0] : '';
                const baseName = extMatch ? path.substring(lastSlash + 1, path.length - ext.length) : path.substring(lastSlash + 1);
                new InputModal(this.app, "复制笔记", "新笔记名称", "请输入新笔记名称...", `${baseName}_copy`, async (newName) => {
                  if (newName) {
                    const newPath = normalizePath(`${parentPath}/${newName}${ext}`);
                    const file = this.app.vault.getAbstractFileByPath(path);
                    if (file instanceof TFile) {
                      await this.app.vault.copy(file, newPath);
                      const space = this.spaceManager.getSpace(spaceId);
                      if (space) {
                        const isSubfolder = space.folders.some(f => newPath.startsWith(f === '/' ? '' : f + '/'));
                        if (!isSubfolder) {
                          await this.spaceManager.addFileToSpace(spaceId, newPath);
                        }
                      }
                      new Notice("文件复制成功！");
                      this.render();
                    }
                  }
                }).open();
              });
          });

          // Rename File
          menu.addItem(item => {
            item.setTitle('重命名笔记')
              .setIcon('pencil')
              .onClick(() => {
                const path = childNode.path;
                const lastSlash = path.lastIndexOf('/');
                const parentPath = lastSlash !== -1 ? path.substring(0, lastSlash) : '';
                const extMatch = path.match(/\.[^/.]+$/);
                const ext = extMatch ? extMatch[0] : '';
                const baseName = extMatch ? path.substring(lastSlash + 1, path.length - ext.length) : path.substring(lastSlash + 1);
                new InputModal(this.app, "重命名笔记", "新笔记名称", "请输入新笔记名称...", baseName, async (newName) => {
                  if (newName && newName !== baseName) {
                    const newPath = normalizePath(`${parentPath}/${newName}${ext}`);
                    const file = this.app.vault.getAbstractFileByPath(path);
                    if (file instanceof TFile) {
                      await this.app.fileManager.renameFile(file, newPath);
                      if (this.selectedPath === path) {
                        this.selectedPath = newPath;
                      }
                      new Notice("文件重命名成功！");
                      this.render();
                    }
                  }
                }).open();
              });
          });

          menu.addSeparator();

          menu.addItem(item => {
            item.setTitle('从空间移出文件')
              .setIcon('file-minus')
              .onClick(async () => {
                await this.spaceManager.removeFileFromSpace(spaceId, childNode.path);
                if (this.selectedPath === childNode.path) {
                  this.selectedPath = null;
                }
                this.render();
              });
          });

          // Physically delete note
          menu.addItem(item => {
            item.setTitle('彻底删除该笔记')
              .setIcon('trash-2')
              .onClick(async () => {
                const confirmDelete = await CustomConfirmModal.show(this.app, "彻底删除笔记", `确定要将文件 "${childNode.name}" 从您的库中物理删除吗？\n此操作无法撤销。`, [
                  { text: "确定删除", variant: "danger", value: true },
                  { text: "取消", variant: "secondary", value: false }
                ], false);
                if (confirmDelete) {
                  if (childNode.file) {
                    await this.app.fileManager.trashFile(childNode.file);
                    if (this.selectedPath === childNode.path) {
                      this.selectedPath = null;
                    }
                    this.render();
                  }
                }
              });
          });
        }
        menu.showAtMouseEvent(e);
      });

      // Enable drag and drop support
      nodeEl.setAttribute('draggable', 'true');
      nodeEl.addEventListener('dragstart', (e: DragEvent) => {
        if (e.dataTransfer) {
          e.dataTransfer.setData('text/plain', childNode.path);
          e.dataTransfer.setData('source-space-id', spaceId);
          e.dataTransfer.effectAllowed = 'move';
        }
        nodeEl.addClass('is-dragging');
      });

      nodeEl.addEventListener('dragend', () => {
        nodeEl.removeClass('is-dragging');
      });

      nodeEl.addEventListener('dragover', (e: DragEvent) => {
        e.preventDefault();
        nodeEl.addClass('drag-over');
      });

      nodeEl.addEventListener('dragleave', () => {
        nodeEl.removeClass('drag-over');
      });

      nodeEl.addEventListener('drop', async (e: DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        nodeEl.removeClass('drag-over');
        if (e.dataTransfer) {
          const dragPath = e.dataTransfer.getData('text/plain');
          const sourceSpaceId = e.dataTransfer.getData('source-space-id');
          
          if (!dragPath) return;

          const dragFile = this.app.vault.getAbstractFileByPath(dragPath);
          if (!dragFile) return;

          // Target folder path
          let targetFolder = '';
          if (childNode.isFolder) {
            targetFolder = childNode.path;
          } else {
            // If it's a file, get its containing directory
            const lastSlash = childNode.path.lastIndexOf('/');
            if (lastSlash !== -1) {
              targetFolder = childNode.path.substring(0, lastSlash);
            }
          }

          // Case A: Dragging a file/folder into a folder node in the tree to move it physically
          // OR dragging onto a file node inside a folder to move it into that same folder.
          if (dragFile instanceof TFile) {
            const newDestPath = normalizePath(`${targetFolder}/${dragFile.name}`);

            if (dragPath !== newDestPath) {
              try {
                // Perform physical vault move
                await this.app.fileManager.renameFile(dragFile, newDestPath);
                new Notice(`物理移动文件至: ${newDestPath}`);

                // Manage space associations
                if (sourceSpaceId && sourceSpaceId !== spaceId) {
                  await this.spaceManager.removeFileFromSpace(sourceSpaceId, dragPath);
                }

                const space = this.spaceManager.getSpace(spaceId);
                if (space) {
                  const isSubfolder = space.folders.some(f => newDestPath.startsWith(f === '/' ? '' : f + '/'));
                  if (!isSubfolder) {
                    await this.spaceManager.addFileToSpace(spaceId, newDestPath);
                  }
                }
              } catch (err) {
                console.error("Failed to move file", err);
                new Notice("文件移动失败！");
              }
            }
            this.render();
            return;
          } else if (dragFile instanceof TFolder) {
            const newDestPath = normalizePath(`${targetFolder}/${dragFile.name}`);

            if (dragPath !== newDestPath) {
              try {
                // Perform physical vault move
                await this.app.fileManager.renameFile(dragFile, newDestPath);
                new Notice(`物理移动文件夹至: ${newDestPath}`);

                // Update association in space manager
                if (sourceSpaceId) {
                  await this.spaceManager.removeFolderFromSpace(sourceSpaceId, dragPath);
                }
                await this.spaceManager.addFolderToSpace(spaceId, newDestPath);
              } catch (err) {
                console.error("Failed to move folder", err);
                new Notice("文件夹移动失败！");
              }
            }
            this.render();
            return;
          }

          // Case B: Cross-space drag (dragging to another space's nodes or root)
          if (sourceSpaceId && sourceSpaceId !== spaceId) {
            if (dragFile instanceof TFile) {
              await this.spaceManager.removeFileFromSpace(sourceSpaceId, dragPath);
              await this.spaceManager.addFileToSpace(spaceId, dragPath);
            } else if (dragFile instanceof TFolder) {
              await this.spaceManager.removeFolderFromSpace(sourceSpaceId, dragPath);
              await this.spaceManager.addFolderToSpace(spaceId, dragPath);
            }
            this.render();
          }
        }
      });

      if (childNode.isFolder) {
        nodeEl.addEventListener('click', (e) => {
          e.stopPropagation();
          if (this.selectedPath === childNode.path) {
            this.selectedPath = null;
          } else {
            this.selectedPath = childNode.path;
            this.selectedIsFolder = true;
          }
          
          if (this.expandedPaths.has(childNode.path)) {
            this.expandedPaths.delete(childNode.path);
          } else {
            this.expandedPaths.add(childNode.path);
          }
          this.render();
        });

        if (isExpanded) {
          const childrenContainer = parentEl.createDiv();
          this.renderTreeNodes(childrenContainer, childNode, depth + 1, spaceId);
        }
      } else {
        nodeEl.addEventListener('click', (e) => {
          e.stopPropagation();
          this.selectedPath = childNode.path;
          this.selectedIsFolder = false;
          this.render();
          if (childNode.file) {
            void this.app.workspace.getLeaf(e.ctrlKey || e.metaKey).openFile(childNode.file);
          }
        });
      }
    });
  }
}

class InputModal extends Modal {
  private value: string;
  private titleText: string;
  private labelText: string;
  private placeholderText: string;
  private onSubmit: (value: string) => void;

  constructor(app: App, titleText: string, labelText: string, placeholderText: string, defaultValue: string, onSubmit: (value: string) => void) {
    super(app);
    this.titleText = titleText;
    this.labelText = labelText;
    this.placeholderText = placeholderText;
    this.value = defaultValue;
    this.onSubmit = onSubmit;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl('h2', { text: this.titleText });

    new Setting(contentEl)
      .setName(this.labelText)
      .addText(text => text
        .setPlaceholder(this.placeholderText)
        .setValue(this.value)
        .onChange(val => this.value = val));

    new Setting(contentEl)
      .addButton(btn => btn
        .setButtonText("确定")
        .setCta()
        .onClick(() => {
          this.onSubmit(this.value);
          this.close();
        }))
      .addButton(btn => btn
        .setButtonText("取消")
        .onClick(() => this.close()));
  }

  onClose() {
    this.contentEl.empty();
  }
}

interface ConfirmButtonOption<T> {
  text: string;
  variant?: 'cta' | 'danger' | 'secondary';
  value: T;
}

export class CustomConfirmModal<T = unknown> extends Modal {
  private titleText: string;
  private message: string;
  private buttons: ConfirmButtonOption<T>[];
  private onChoose: (value: T) => void;
  private isChosen = false;
  private defaultValue: T;

  constructor(
    app: App,
    titleText: string,
    message: string,
    buttons: ConfirmButtonOption<T>[],
    defaultValue: T,
    onChoose: (value: T) => void
  ) {
    super(app);
    this.titleText = titleText;
    this.message = message;
    this.buttons = buttons;
    this.defaultValue = defaultValue;
    this.onChoose = onChoose;
  }

  private handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      const confirmBtn = this.buttons.find(b => b.variant === 'danger' || b.variant === 'cta') || this.buttons[0];
      if (confirmBtn) {
        this.isChosen = true;
        this.onChoose(confirmBtn.value);
        this.close();
      }
    }
  };

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('vps-confirm-modal');

    contentEl.createEl('h2', { text: this.titleText, cls: 'vps-confirm-title' });
    
    const messageEl = contentEl.createDiv({ cls: 'vps-confirm-message' });
    const lines = this.message.split('\n');
    lines.forEach((line, index) => {
      if (index > 0) messageEl.createEl('br');
      messageEl.createSpan({ text: line });
    });

    const buttonContainer = contentEl.createDiv({ cls: 'vps-confirm-buttons' });

    this.buttons.forEach(opt => {
      const btn = buttonContainer.createEl('button', {
        text: opt.text,
        cls: `vps-confirm-btn vps-confirm-btn-${opt.variant || 'secondary'}`
      });
      btn.addEventListener('click', () => {
        this.isChosen = true;
        this.onChoose(opt.value);
        this.close();
      });
    });

    window.addEventListener('keydown', this.handleKeyDown);
  }

  onClose() {
    window.removeEventListener('keydown', this.handleKeyDown);
    this.contentEl.empty();
    if (!this.isChosen) {
      this.onChoose(this.defaultValue);
    }
  }

  static show<T>(
    app: App,
    title: string,
    message: string,
    buttons: ConfirmButtonOption<T>[],
    defaultValue: T
  ): Promise<T> {
    return new Promise((resolve) => {
      const modal = new CustomConfirmModal(app, title, message, buttons, defaultValue, (val) => resolve(val));
      modal.open();
    });
  }
}


import { ItemView, WorkspaceLeaf, setIcon, TFile, TFolder, Menu, normalizePath, Notice } from 'obsidian';
import { SpaceManager } from './spaceManager';
import { ProjectSpace } from './types';
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
    
    const addBtn = headerActions.createDiv({ cls: 'vps-space-action-btn' });
    setIcon(addBtn, 'plus');
    addBtn.setAttribute('title', '新建空间');
    addBtn.addEventListener('click', () => {
      new SpaceModal(this.app, async (name, icon, color) => {
        const space = await this.spaceManager.createSpace(name, icon, color);
        // Automatically activate newly created space
        this.app.workspace.trigger('vps-space-activated', space.id);
        this.render();
      }).open();
    });

    const activeSpaceId = (this.app as any).plugins?.plugins?.['projectVerse']?.settings?.activeSpaceId;
    const activeSpace = activeSpaceId ? this.spaceManager.getSpace(activeSpaceId) : null;

    if (activeSpace) {
      // Copy Space
      const copyBtn = headerActions.createDiv({ cls: 'vps-space-action-btn' });
      setIcon(copyBtn, 'copy');
      copyBtn.setAttribute('title', '复制空间');
      copyBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const newSpace = await this.spaceManager.duplicateSpace(activeSpace.id);
        if (newSpace) {
          this.app.workspace.trigger('vps-space-activated', newSpace.id);
        }
        this.render();
      });

      // Edit Space
      const editBtn = headerActions.createDiv({ cls: 'vps-space-action-btn' });
      setIcon(editBtn, 'pencil');
      editBtn.setAttribute('title', '编辑空间');
      editBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        new SpaceModal(this.app, async (name, icon, color) => {
          await this.spaceManager.updateSpace(activeSpace.id, { name, icon, color });
          this.render();
          this.app.workspace.trigger('vps-space-updated', activeSpace.id);
        }, activeSpace).open();
      });

      // Delete Space
      const deleteBtn = headerActions.createDiv({ cls: 'vps-space-action-btn' });
      setIcon(deleteBtn, 'trash-2');
      deleteBtn.setAttribute('title', '删除空间');
      deleteBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (confirm(`确定要删除空间 "${activeSpace.name}" 吗？此操作不会删除物理文件。`)) {
          await this.spaceManager.deleteSpace(activeSpace.id);
          this.render();
          this.app.workspace.trigger('vps-space-deleted', activeSpace.id);
        }
      });
    }

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
      spaceItem.addEventListener('click', () => {
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
        if (files.length === 0) {
          const d = treeContainer.createDiv({ 
            text: '该空间暂无关联文件。右键文件列表选择 "Add to Space" 加入。',
            cls: 'vps-space-meta'
          });
          d.style.cssText = 'padding: 8px;';
        } else {
          const rootNode = this.buildVirtualTree(files);
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
              if (dragFile && dragFile instanceof TFile) {
                // Root folder path is empty string/slash in renameFile
                const newDestPath = normalizePath(dragFile.name);
                if (dragPath !== newDestPath) {
                  try {
                    await this.app.fileManager.renameFile(dragFile, newDestPath);
                    new Notice(`物理移动文件至根目录: ${newDestPath}`);

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
                  } catch (err) {
                    console.error("Failed to move file to root", err);
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

  private buildVirtualTree(files: TFile[]): VirtualNode {
    const root: VirtualNode = {
      name: 'root',
      path: '',
      isFolder: true,
      children: new Map<string, VirtualNode>()
    };

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

      const nodeEl = parentEl.createDiv({ 
        cls: `vps-tree-node vps-tree-node-depth-${depth}` 
      });
      
      const iconEl = nodeEl.createDiv({ cls: 'vps-tree-node-icon' });
      setIcon(iconEl, childNode.isFolder ? (isExpanded ? 'chevron-down' : 'chevron-right') : 'file-text');

      nodeEl.createDiv({ cls: 'vps-tree-node-name', text: childNode.name });

      // Action context menu
      nodeEl.addEventListener('contextmenu', (e: MouseEvent) => {
        e.preventDefault();
        const menu = new Menu();
        
        if (childNode.isFolder) {
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
                  this.render();
                }
              });
          });
        } else {
          menu.addItem(item => {
            item.setTitle('从空间移出文件')
              .setIcon('file-minus')
              .onClick(async () => {
                await this.spaceManager.removeFileFromSpace(spaceId, childNode.path);
                this.render();
              });
          });

          // Physically delete note
          menu.addItem(item => {
            item.setTitle('彻底删除该笔记')
              .setIcon('trash-2')
              .onClick(async () => {
                if (confirm(`确定要将文件 "${childNode.name}" 从您的库中物理删除吗？此操作无法撤销。`)) {
                  if (childNode.file) {
                    await this.app.vault.delete(childNode.file);
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

          // Case A: Dragging a file into a folder node in the tree to move it physically
          // OR dragging onto a file node inside a folder to move it into that same folder.
          if (dragFile instanceof TFile) {
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

            // Target folder path
            const newDestPath = normalizePath(`${targetFolder}/${dragFile.name}`);

            if (dragPath !== newDestPath) {
              try {
                // Perform physical vault move
                await this.app.fileManager.renameFile(dragFile, newDestPath);
                new Notice(`物理移动文件至: ${newDestPath}`);

                // Manage space associations
                if (sourceSpaceId && sourceSpaceId !== spaceId) {
                  // Dragged from another space -> remove old association, new one is handled by rename automatically if folder is tracked,
                  // or we explicitly add it to the destination space.
                  await this.spaceManager.removeFileFromSpace(sourceSpaceId, dragPath);
                }

                // If target space has folder tracking, it might auto-include it. 
                // Just in case, let's update explicit association if needed
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
          if (childNode.file) {
            this.app.workspace.getLeaf(e.ctrlKey || e.metaKey).openFile(childNode.file);
          }
        });
      }
    });
  }
}

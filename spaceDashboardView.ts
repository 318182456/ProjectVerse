import { ItemView, WorkspaceLeaf, setIcon, TFile, normalizePath } from 'obsidian';
import { SpaceManager } from './spaceManager';
import { ProjectSpace } from './types';

export const VIEW_TYPE_SPACE_DASHBOARD = 'virtual-project-space-dashboard';

interface SpaceTask {
  file: TFile;
  lineIndex: number;
  text: string;
  completed: boolean;
  rawLine: string;
}

interface VirtualNode {
  name: string;
  path: string;
  isFolder: boolean;
  children: Map<string, VirtualNode>;
  file?: TFile;
}

export class SpaceDashboardView extends ItemView {
  private spaceManager: SpaceManager;
  private spaceId?: string;
  private tasks: SpaceTask[] = [];
  private expandedPaths: Set<string> = new Set<string>();
  private currentRenderVersion = 0;

  constructor(leaf: WorkspaceLeaf, spaceManager: SpaceManager) {
    super(leaf);
    this.spaceManager = spaceManager;
  }

  getViewType(): string {
    return VIEW_TYPE_SPACE_DASHBOARD;
  }

  getDisplayText(): string {
    const activeSpaceId = (this.app as any).plugins?.plugins?.['projectVerse']?.settings?.activeSpaceId;
    const targetId = this.spaceId || activeSpaceId;
    if (targetId) {
      const space = this.spaceManager.getSpace(targetId);
      if (space) return `${space.name} - Dashboard`;
    }
    return '项目控制面板';
  }

  getIcon(): string {
    return 'presentation';
  }

  setSpaceId(spaceId: string) {
    this.spaceId = spaceId;
    this.render();
  }

  async onOpen() {
    this.render();
  }

  async render() {
    const activeSpaceId = (this.app as any).plugins?.plugins?.['projectVerse']?.settings?.activeSpaceId;
    const targetId = activeSpaceId || this.spaceId;
    this.spaceId = targetId;

    const renderVersion = ++this.currentRenderVersion;
    const container = this.contentEl;

    if (!targetId) {
      container.empty();
      const d = container.createDiv({
        text: '请在侧边栏选择并激活一个项目空间以加载 Dashboard。',
        cls: 'vps-space-meta'
      });
      d.style.cssText = 'padding: 24px; text-align: center;';
      return;
    }

    const space = this.spaceManager.getSpace(targetId);
    if (!space) {
      container.empty();
      const d = container.createDiv({
        text: '未找到选定的项目空间。',
        cls: 'vps-space-meta'
      });
      d.style.cssText = 'padding: 24px; text-align: center;';
      return;
    }

    // Load tasks from space files
    await this.scanTasks(space);

    if (renderVersion !== this.currentRenderVersion) {
      return;
    }

    container.empty();

    const dashboardEl = container.createDiv({ cls: 'vps-dashboard-container' });

    // 1. Premium Header Banner
    const banner = dashboardEl.createDiv({ cls: 'vps-dashboard-banner' });
    banner.style.setProperty('--banner-color-start', space.color);
    banner.style.setProperty('--banner-color-end', this.adjustColorBrightness(space.color, -30));
    banner.style.setProperty('--banner-color-shadow', this.hexToRgba(space.color, 0.4));

    const bannerIcon = banner.createDiv({ cls: 'vps-dashboard-banner-icon' });
    setIcon(bannerIcon, space.icon.replace('lucide-', ''));

    const bannerInfo = banner.createDiv({ cls: 'vps-dashboard-banner-info' });
    bannerInfo.createEl('h1', { cls: 'vps-dashboard-banner-title', text: space.name });
    bannerInfo.createDiv({ 
      cls: 'vps-dashboard-banner-meta', 
      text: `创建于 ${space.createdAt} | 包含 ${space.files.length} 个直接关联文件，${space.folders.length} 个文件夹` 
    });

    // 2. Stats Grid
    const statsRow = dashboardEl.createDiv({ cls: 'vps-stats-row' });
    
    // Stat: Files Count
    const filesStat = statsRow.createDiv({ cls: 'vps-stat-item' });
    filesStat.style.setProperty('--space-color', space.color);
    const filesCount = this.spaceManager.getSpaceFiles(space.id).length;
    filesStat.createDiv({ cls: 'vps-stat-value', text: String(filesCount) });
    filesStat.createDiv({ cls: 'vps-stat-label', text: '总关联文件数' });

    // Stat: Pending Tasks
    const pendingTasksCount = this.tasks.filter(t => !t.completed).length;
    const tasksStat = statsRow.createDiv({ cls: 'vps-stat-item' });
    tasksStat.style.setProperty('--space-color', space.color);
    tasksStat.createDiv({ cls: 'vps-stat-value', text: String(pendingTasksCount) });
    tasksStat.createDiv({ cls: 'vps-stat-label', text: '待办任务数' });

    // Stat: Rules Count
    const rulesStat = statsRow.createDiv({ cls: 'vps-stat-item' });
    rulesStat.style.setProperty('--space-color', space.color);
    const rulesCount = space.tags.length + space.queries.length;
    rulesStat.createDiv({ cls: 'vps-stat-value', text: String(rulesCount) });
    rulesStat.createDiv({ cls: 'vps-stat-label', text: '关联规则数' });

    // 3. Grid for Files and Tasks Cards
    const grid = dashboardEl.createDiv({ cls: 'vps-dashboard-grid' });

    // Card A: Files List
    const filesCard = grid.createDiv({ cls: 'vps-dashboard-card' });
    const filesTitle = filesCard.createDiv({ cls: 'vps-dashboard-card-title', text: '📄 项目文件' });
    
    const quickActions = filesTitle.createDiv({ cls: 'vps-quick-actions' });
    const addNoteBtn = quickActions.createEl('button', { cls: 'vps-btn vps-btn-secondary', text: '新建笔记' });
    addNoteBtn.style.setProperty('--space-color', space.color);
    addNoteBtn.addEventListener('click', () => this.createNewSpaceNote(space));

    const filesList = filesCard.createDiv();
    filesList.style.cssText = 'max-height: 300px; overflow-y: auto; display: flex; flex-direction: column; gap: 4px;';
    const allSpaceFiles = this.spaceManager.getSpaceFiles(space.id);
    if (allSpaceFiles.length === 0) {
      filesList.createDiv({ text: '当前空间无文件', cls: 'vps-space-meta' });
    } else {
      const rootNode = this.buildVirtualTree(allSpaceFiles);
      this.renderTreeNodes(filesList, rootNode, 0);
    }

    // Card B: Tasks List
    const tasksCard = grid.createDiv({ cls: 'vps-dashboard-card' });
    tasksCard.createDiv({ cls: 'vps-dashboard-card-title', text: '☑️ 待办事项' });
    
    const tasksList = tasksCard.createDiv();
    tasksList.style.cssText = 'max-height: 300px; overflow-y: auto; display: flex; flex-direction: column; gap: 8px;';
    if (this.tasks.length === 0) {
      tasksList.createDiv({ text: '未在关联文件中找到待办任务', cls: 'vps-space-meta' });
    } else {
      this.tasks.forEach((task, idx) => {
        const taskRow = tasksList.createDiv({ 
          cls: `vps-task-item ${task.completed ? 'is-completed' : ''}` 
        });

        const checkbox = taskRow.createEl('input', {
          cls: 'vps-task-checkbox',
          type: 'checkbox'
        });
        checkbox.checked = task.completed;
        checkbox.addEventListener('change', async () => {
          await this.toggleTaskCompletion(task);
          this.render(); // Re-render to show updated state
        });

        const taskText = taskRow.createDiv({ cls: 'vps-task-text', text: task.text });
        taskText.addEventListener('click', async () => {
          checkbox.checked = !checkbox.checked;
          await this.toggleTaskCompletion(task);
          this.render();
        });

        taskRow.createDiv({ 
          cls: 'vps-task-source', 
          text: task.file.basename 
        });
      });
    }
  }

  private async scanTasks(space: ProjectSpace) {
    const files = this.spaceManager.getSpaceFiles(space.id);
    this.tasks = [];

    for (const file of files) {
      if (file.extension !== 'md') continue;
      
      const content = await this.app.vault.read(file);
      const lines = content.split('\n');
      
      lines.forEach((line, index) => {
        // Regex to match markdown tasks: - [ ] or - [x] or - [X]
        const match = line.match(/^\s*[-*]\s*\[([ xX])\]\s*(.*)$/);
        if (match) {
          const completed = match[1].toLowerCase() === 'x';
          const text = match[2].trim();
          this.tasks.push({
            file,
            lineIndex: index,
            text,
            completed,
            rawLine: line
          });
        }
      });
    }
  }

  private async toggleTaskCompletion(task: SpaceTask) {
    const file = task.file;
    const content = await this.app.vault.read(file);
    const lines = content.split('\n');
    
    // Safety check: verify line matches the original text roughly
    if (lines[task.lineIndex] !== undefined && lines[task.lineIndex].includes(task.text)) {
      const line = lines[task.lineIndex];
      const newCompletedState = !task.completed;
      
      // Update check symbol
      const updatedLine = line.replace(/(\s*[-*]\s*\[)([ xX])(\]\s*.*)/, `$1${newCompletedState ? 'x' : ' '}$3`);
      lines[task.lineIndex] = updatedLine;
      
      await this.app.vault.modify(file, lines.join('\n'));
      
      // Update local state
      task.completed = newCompletedState;
      task.rawLine = updatedLine;
    }
  }

  private async createNewSpaceNote(space: ProjectSpace) {
    let folderPath = '/';
    if (space.folders.length > 0) {
      folderPath = space.folders[0];
    }
    
    let noteName = '未命名笔记';
    let fullPath = normalizePath(`${folderPath === '/' ? '' : folderPath + '/'}${noteName}.md`);
    
    // Make sure path is unique
    let counter = 1;
    while (this.app.vault.getAbstractFileByPath(fullPath)) {
      noteName = `未命名笔记 (${counter})`;
      fullPath = normalizePath(`${folderPath === '/' ? '' : folderPath + '/'}${noteName}.md`);
      counter++;
    }

    const templateContent = `# ${noteName}\n\n创建于项目空间: ${space.name}\n\n## 任务\n- [ ] 开始编写笔记...\n`;
    const newFile = await this.app.vault.create(fullPath, templateContent);
    
    // Explicitly associate with the space if it's not matching folder
    if (folderPath === '/') {
      await this.spaceManager.addFileToSpace(space.id, newFile.path);
    }
    
    // Open the new file
    this.app.workspace.getLeaf(false).openFile(newFile);
    this.render();
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

  private renderTreeNodes(parentEl: HTMLElement, node: VirtualNode, depth: number) {
    const sortedKeys = Array.from(node.children.keys()).sort((a, b) => {
      const nodeA = node.children.get(a)!;
      const nodeB = node.children.get(b)!;
      if (nodeA.isFolder && !nodeB.isFolder) return -1;
      if (!nodeA.isFolder && nodeB.isFolder) return 1;
      return a.localeCompare(b);
    });

    sortedKeys.forEach(key => {
      const childNode = node.children.get(key)!;
      const isExpanded = this.expandedPaths.has(childNode.path);

      const nodeEl = parentEl.createDiv({ 
        cls: `vps-tree-node vps-tree-node-depth-${depth}` 
      });
      
      const iconEl = nodeEl.createDiv({ cls: 'vps-tree-node-icon' });
      setIcon(iconEl, childNode.isFolder ? (isExpanded ? 'chevron-down' : 'chevron-right') : 'file-text');

      nodeEl.createDiv({ cls: 'vps-tree-node-name', text: childNode.name });

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
          this.renderTreeNodes(childrenContainer, childNode, depth + 1);
        }
      } else {
        nodeEl.addEventListener('click', (e) => {
          e.stopPropagation();
          if (childNode.file) {
            this.app.workspace.getLeaf(false).openFile(childNode.file);
          }
        });
      }
    });
  }

  // Helper to adjust color brightness
  private adjustColorBrightness(hex: string, percent: number): string {
    let R = parseInt(hex.substring(1, 3), 16);
    let G = parseInt(hex.substring(3, 5), 16);
    let B = parseInt(hex.substring(5, 7), 16);

    R = Math.max(0, Math.min(255, R + (R * percent / 100)));
    G = Math.max(0, Math.min(255, G + (G * percent / 100)));
    B = Math.max(0, Math.min(255, B + (B * percent / 100)));

    const rHex = Math.round(R).toString(16).padStart(2, '0');
    const gHex = Math.round(G).toString(16).padStart(2, '0');
    const bHex = Math.round(B).toString(16).padStart(2, '0');

    return `#${rHex}${gHex}${bHex}`;
  }

  private hexToRgba(hex: string, alpha: number): string {
    const r = parseInt(hex.substring(1, 3), 16);
    const g = parseInt(hex.substring(3, 5), 16);
    const b = parseInt(hex.substring(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
}

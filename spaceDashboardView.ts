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

export class SpaceDashboardView extends ItemView {
  private spaceManager: SpaceManager;
  private spaceId?: string;
  private tasks: SpaceTask[] = [];

  constructor(leaf: WorkspaceLeaf, spaceManager: SpaceManager) {
    super(leaf);
    this.spaceManager = spaceManager;
  }

  getViewType(): string {
    return VIEW_TYPE_SPACE_DASHBOARD;
  }

  getDisplayText(): string {
    if (this.spaceId) {
      const space = this.spaceManager.getSpace(this.spaceId);
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
    const container = this.containerEl.children[1];
    container.empty();

    if (!this.spaceId) {
      const d = container.createDiv({
        text: '请在侧边栏选择并激活一个项目空间以加载 Dashboard。',
        cls: 'vps-space-meta'
      });
      d.style.cssText = 'padding: 24px; text-align: center;';
      return;
    }

    const space = this.spaceManager.getSpace(this.spaceId);
    if (!space) {
      const d = container.createDiv({
        text: '未找到选定的项目空间。',
        cls: 'vps-space-meta'
      });
      d.style.cssText = 'padding: 24px; text-align: center;';
      return;
    }

    // Load tasks from space files
    await this.scanTasks(space);

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
    filesList.style.cssText = 'max-height: 300px; overflow-y: auto; display: flex; flex-direction: column; gap: 8px;';
    const allSpaceFiles = this.spaceManager.getSpaceFiles(space.id);
    if (allSpaceFiles.length === 0) {
      filesList.createDiv({ text: '当前空间无文件', cls: 'vps-space-meta' });
    } else {
      allSpaceFiles.forEach(file => {
        const fileRow = filesList.createDiv({ cls: 'vps-task-item' });
        const iconEl = fileRow.createDiv();
        iconEl.style.cssText = 'display:flex;align-items:center;';
        setIcon(iconEl, 'file-text');
        
        const fileLink = fileRow.createDiv({ cls: 'vps-task-text', text: file.name });
        fileLink.addEventListener('click', () => {
          this.app.workspace.getLeaf(false).openFile(file);
        });

        const pathEl = fileRow.createDiv({ cls: 'vps-task-source', text: file.parent?.path !== '/' ? file.parent?.path : '' });
      });
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

import {
  ItemView,
  WorkspaceLeaf,
  setIcon,
  TFile,
  normalizePath,
  Notice,
  App,
  Menu,
  Modal,
  Setting,
  MarkdownRenderer,
  Component,
} from "obsidian";
import { SpaceManager } from "./spaceManager";
import { ProjectSpace } from "./types";

export const VIEW_TYPE_SPACE_DASHBOARD = "virtual-project-space-dashboard";

interface SpaceTask {
  file?: TFile;
  lineIndex?: number;
  text: string;
  completed: boolean;
  rawLine?: string;
  customTaskId?: string;
}

class TodoModal extends Modal {
  private onSubmit: (text: string) => void;
  private text: string = "";

  constructor(app: App, onSubmit: (text: string) => void) {
    super(app);
    this.onSubmit = onSubmit;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h2", { text: "添加待办任务" });

    new Setting(contentEl)
      .setName("任务内容")
      .addText(text => text
        .setPlaceholder("请输入待办事项内容")
        .onChange(value => {
          this.text = value;
        })
      );

    new Setting(contentEl)
      .addButton(btn => btn
        .setButtonText("添加")
        .setCta()
        .onClick(() => {
          if (this.text.trim()) {
            this.onSubmit(this.text.trim());
            this.close();
          }
        })
      )
      .addButton(btn => btn
        .setButtonText("取消")
        .onClick(() => {
          this.close();
        })
      );
  }

  onClose() {
    this.contentEl.empty();
  }
}

class MemoModal extends Modal {
  private onSubmit: (text: string) => void;
  private text: string = "";
  private titleText: string;
  private buttonText: string;

  constructor(app: App, titleText: string, buttonText: string, initialText: string, onSubmit: (text: string) => void) {
    super(app);
    this.titleText = titleText;
    this.buttonText = buttonText;
    this.text = initialText;
    this.onSubmit = onSubmit;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h2", { text: this.titleText });

    new Setting(contentEl)
      .setName("备忘内容")
      .addTextArea(text => {
        text.inputEl.style.width = "100%";
        text.inputEl.style.height = "120px";
        text
          .setValue(this.text)
          .setPlaceholder("请输入备忘事项内容")
          .onChange(value => {
            this.text = value;
          });

        text.inputEl.addEventListener("paste", async (e: ClipboardEvent) => {
          const files = e.clipboardData?.files;
          if (files && files.length > 0) {
            for (let i = 0; i < files.length; i++) {
              const file = files[i];
              if (file.type.startsWith("image/")) {
                e.preventDefault(); // Stop default paste text behavior

                try {
                  const arrayBuffer = await file.arrayBuffer();
                  const extension = file.name.split(".").pop() || "png";
                  const filename = `paste-${Date.now()}.${extension}`;
                  const folderPath = "attachments";

                  // Ensure folder exists
                  if (!this.app.vault.getAbstractFileByPath(folderPath)) {
                    await this.app.vault.createFolder(folderPath);
                  }

                  const filePath = `${folderPath}/${filename}`;
                  const tFile = await this.app.vault.createBinary(filePath, arrayBuffer);
                  const linkText = `![[${tFile.path}]]`;

                  const textarea = text.inputEl;
                  const startPos = textarea.selectionStart;
                  const endPos = textarea.selectionEnd;
                  const currentText = textarea.value;

                  const newText = currentText.substring(0, startPos) + linkText + currentText.substring(endPos);
                  textarea.value = newText;
                  this.text = newText;
                  text.setValue(newText);

                  textarea.focus();
                  textarea.setSelectionRange(startPos + linkText.length, startPos + linkText.length);
                } catch (error: any) {
                  console.error("Failed to save pasted image:", error);
                  new Notice("粘贴图片保存失败：" + (error instanceof Error ? error.message : String(error)));
                }
              }
            }
          }
        });
      });

    new Setting(contentEl)
      .addButton(btn => btn
        .setButtonText(this.buttonText)
        .setCta()
        .onClick(() => {
          if (this.text.trim()) {
            this.onSubmit(this.text.trim());
            this.close();
          }
        })
      )
      .addButton(btn => btn
        .setButtonText("取消")
        .onClick(() => {
          this.close();
        })
      );
  }

  onClose() {
    this.contentEl.empty();
  }
}

class MemoPreviewModal extends Modal {
  private text: string;
  private resolveImageLinks: (markdown: string) => string;
  private component: Component;

  constructor(app: App, text: string, resolveImageLinks: (markdown: string) => string, component: Component) {
    super(app);
    this.text = text;
    this.resolveImageLinks = resolveImageLinks;
    this.component = component;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();

    // Style modal window
    this.modalEl.style.width = "95vw";
    this.modalEl.style.maxHeight = "95vh";

    const container = contentEl.createDiv({ cls: "vps-memo-preview-container" });
    container.style.cssText = "padding: 10px; overflow-y: auto; max-height: calc(80vh - 80px);";

    const resolvedMarkdown = this.resolveImageLinks(this.text);
    MarkdownRenderer.renderMarkdown(resolvedMarkdown, container, "", this.component);
  }

  onClose() {
    this.contentEl.empty();
  }
}

export class SpaceDashboardView extends ItemView {
  private spaceManager: SpaceManager;
  private spaceId?: string;
  private tasks: SpaceTask[] = [];
  private currentRenderVersion = 0;
  private hideCompleted = false;

  constructor(leaf: WorkspaceLeaf, spaceManager: SpaceManager) {
    super(leaf);
    this.spaceManager = spaceManager;
  }

  getViewType(): string {
    return VIEW_TYPE_SPACE_DASHBOARD;
  }

  getDisplayText(): string {
    const activeSpaceId = (this.app as any).plugins?.plugins?.["projectVerse"]
      ?.settings?.activeSpaceId;
    const targetId = this.spaceId || activeSpaceId;
    if (targetId) {
      const space = this.spaceManager.getSpace(targetId);
      if (space) return `${space.name} - Dashboard`;
    }
    return "项目控制面板";
  }

  getIcon(): string {
    return "presentation";
  }

  setSpaceId(spaceId: string) {
    this.spaceId = spaceId;
    this.render();
  }

  async onOpen() {
    this.render();
  }

  async render() {
    const activeSpaceId = (this.app as any).plugins?.plugins?.["projectVerse"]
      ?.settings?.activeSpaceId;
    const targetId = this.spaceId || activeSpaceId;
    this.spaceId = targetId;

    (this.leaf as any).updateHeader();
    const viewAny = this as any;
    if (viewAny.titleEl) {
      viewAny.titleEl.setText(this.getDisplayText());
    }

    const renderVersion = ++this.currentRenderVersion;
    const container = this.contentEl;

    if (!targetId) {
      container.empty();
      const d = container.createDiv({
        text: "请在侧边栏选择并激活一个项目空间以加载 Dashboard。",
        cls: "vps-space-meta",
      });
      d.style.cssText = "padding: 24px; text-align: center;";
      return;
    }

    const space = this.spaceManager.getSpace(targetId);
    if (!space) {
      container.empty();
      const d = container.createDiv({
        text: "未找到选定的项目空间。",
        cls: "vps-space-meta",
      });
      d.style.cssText = "padding: 24px; text-align: center;";
      return;
    }

    // Load tasks from space files and data
    const loadedTasks = await this.scanTasks(space);

    if (renderVersion !== this.currentRenderVersion) {
      return;
    }

    this.tasks = loadedTasks;

    // Load persistent setting for hideCompleted
    this.hideCompleted = space.hideCompletedTasks || false;

    container.empty();

    const dashboardEl = container.createDiv({ cls: "vps-dashboard-container" });

    // 1. Premium Header Banner
    const banner = dashboardEl.createDiv({ cls: "vps-dashboard-banner" });
    banner.style.setProperty("--banner-color-start", space.color);
    banner.style.setProperty(
      "--banner-color-end",
      this.adjustColorBrightness(space.color, -30),
    );
    banner.style.setProperty(
      "--banner-color-shadow",
      this.hexToRgba(space.color, 0.4),
    );

    const bannerIcon = banner.createDiv({ cls: "vps-dashboard-banner-icon" });
    setIcon(bannerIcon, space.icon.replace("lucide-", ""));

    const bannerInfo = banner.createDiv({ cls: "vps-dashboard-banner-info" });
    bannerInfo.createEl("h1", {
      cls: "vps-dashboard-banner-title",
      text: space.name,
    });
    bannerInfo.createDiv({
      cls: "vps-dashboard-banner-meta",
      text: `创建于 ${space.createdAt} | 包含 ${space.files.length} 个直接关联文件，${space.folders.length} 个文件夹`,
    });

    // 2. Stats Grid
    const statsRow = dashboardEl.createDiv({ cls: "vps-stats-row" });

    // Stat: Files Count
    const filesStat = statsRow.createDiv({ cls: "vps-stat-item" });
    filesStat.style.setProperty("--space-color", space.color);
    const filesCount = this.spaceManager.getSpaceFiles(space.id).length;
    filesStat.createDiv({ cls: "vps-stat-value", text: String(filesCount) });
    filesStat.createDiv({ cls: "vps-stat-label", text: "总关联文件数" });

    // Stat: Pending Tasks
    const pendingTasksCount = this.tasks.filter((t) => !t.completed).length;
    const tasksStat = statsRow.createDiv({ cls: "vps-stat-item" });
    tasksStat.style.setProperty("--space-color", space.color);
    tasksStat.createDiv({
      cls: "vps-stat-value",
      text: String(pendingTasksCount),
    });
    tasksStat.createDiv({ cls: "vps-stat-label", text: "待办任务数" });

    // Stat: Rules Count
    const rulesStat = statsRow.createDiv({ cls: "vps-stat-item" });
    rulesStat.style.setProperty("--space-color", space.color);
    const rulesCount = space.tags.length + space.queries.length;
    rulesStat.createDiv({ cls: "vps-stat-value", text: String(rulesCount) });
    rulesStat.createDiv({ cls: "vps-stat-label", text: "关联规则数" });

    // 3. Grid for Tasks Card (Files List card has been removed)
    const grid = dashboardEl.createDiv({ cls: "vps-dashboard-grid" });

    // Card B: Tasks List
    const tasksCard = grid.createDiv({ cls: "vps-dashboard-card" });
    const tasksTitle = tasksCard.createDiv({
      cls: "vps-dashboard-card-title",
      text: "☑️ 待办事项",
    });

    const tasksActions = tasksTitle.createDiv({ cls: "vps-quick-actions" });
    const hideCompletedLabel = tasksActions.createEl("label", {
      cls: "vps-hide-completed-label",
    });
    hideCompletedLabel.style.cssText =
      "display: flex; align-items: center; gap: 4px; font-size: 0.8em; font-weight: normal; cursor: pointer; user-select: none; color: var(--text-muted);";

    const hideCompletedCheckbox = hideCompletedLabel.createEl("input", {
      type: "checkbox",
    });
    hideCompletedCheckbox.checked = this.hideCompleted;
    hideCompletedLabel.createSpan({ text: "隐藏已完成" });

    hideCompletedCheckbox.addEventListener("change", async () => {
      this.hideCompleted = hideCompletedCheckbox.checked;
      await this.spaceManager.updateSpace(space.id, { hideCompletedTasks: this.hideCompleted });
      this.render();
    });

    const tasksList = tasksCard.createDiv();
    tasksList.style.cssText =
      "max-height: 300px; overflow-y: auto; display: flex; flex-direction: column; gap: 8px;";

    // Context Menu for Tasks Card (Right click to add todo task)
    tasksCard.addEventListener("contextmenu", (event: MouseEvent) => {
      event.preventDefault();
      const menu = new Menu();
      menu.addItem((item) => {
        item.setTitle("添加待办任务")
          .setIcon("plus")
          .onClick(() => {
            new TodoModal(this.app, async (text) => {
              const currentSpace = this.spaceManager.getSpace(this.spaceId!);
              if (currentSpace) {
                if (!currentSpace.tasks) currentSpace.tasks = [];
                currentSpace.tasks.push({
                  id: Math.random().toString(36).substring(2, 11),
                  text,
                  completed: false
                });
                await this.spaceManager.updateSpace(currentSpace.id, { tasks: currentSpace.tasks });
              }
            }).open();
          });
      });

      const target = event.target as HTMLElement;
      const taskItemEl = target.closest(".vps-task-item");
      if (taskItemEl) {
        const taskId = taskItemEl.getAttribute("data-task-id");
        if (taskId) {
          menu.addSeparator();
          menu.addItem((item) => {
            item.setTitle("删除待办任务")
              .setIcon("trash")
              .onClick(async () => {
                const currentSpace = this.spaceManager.getSpace(this.spaceId!);
                if (currentSpace && currentSpace.tasks) {
                  currentSpace.tasks = currentSpace.tasks.filter(t => t.id !== taskId);
                  await this.spaceManager.updateSpace(currentSpace.id, { tasks: currentSpace.tasks });
                }
              });
          });
        }
      }

      menu.showAtPosition({ x: event.clientX, y: event.clientY });
    });

    const displayedTasks = this.hideCompleted
      ? this.tasks.filter((t) => !t.completed)
      : this.tasks;

    if (displayedTasks.length === 0) {
      tasksList.createDiv({
        text: this.hideCompleted
          ? "暂无未完成的任务"
          : "未在关联文件中找到待办任务",
        cls: "vps-space-meta",
      });
    } else {
      displayedTasks.forEach((task) => {
        const taskRow = tasksList.createDiv({
          cls: `vps-task-item ${task.completed ? "is-completed" : ""}`,
        });

        if (task.customTaskId) {
          taskRow.setAttribute("data-task-id", task.customTaskId);
        }

        const checkbox = taskRow.createEl("input", {
          cls: "vps-task-checkbox",
          type: "checkbox",
        });
        checkbox.checked = task.completed;
        checkbox.addEventListener("change", async () => {
          await this.toggleTaskCompletion(task);
          this.render(); // Re-render to show updated state
        });

        const taskText = taskRow.createDiv({
          cls: "vps-task-text",
          text: task.text,
        });
        taskText.addEventListener("click", async () => {
          checkbox.checked = !checkbox.checked;
          await this.toggleTaskCompletion(task);
          this.render();
        });

        taskRow.createDiv({
          cls: "vps-task-source",
          text: task.file ? task.file.basename : "数据",
        });
      });
    }

    // Card C: Memo List
    const memoCard = grid.createDiv({ cls: "vps-dashboard-card" });
    const memoHeader = memoCard.createDiv({
      cls: "vps-dashboard-card-title",
      text: "📝 备忘录",
    });

    const memoActions = memoHeader.createDiv({ cls: "vps-quick-actions" });
    const addMemoBtn = memoActions.createEl("button", {
      cls: "vps-btn-icon",
      title: "添加备忘"
    });
    setIcon(addMemoBtn, "plus");
    
    addMemoBtn.style.cssText = "background: none; border: none; padding: 2px; cursor: pointer; color: var(--text-muted); display: flex; align-items: center;";
    addMemoBtn.addEventListener("mouseenter", () => { addMemoBtn.style.color = "var(--text-normal)"; });
    addMemoBtn.addEventListener("mouseleave", () => { addMemoBtn.style.color = "var(--text-muted)"; });

    const openAddMemoModal = () => {
      new MemoModal(this.app, "添加备忘录", "添加", "", async (text) => {
        const currentSpace = this.spaceManager.getSpace(this.spaceId!);
        if (currentSpace) {
          if (!currentSpace.memos) currentSpace.memos = [];
          currentSpace.memos.push({
            id: Math.random().toString(36).substring(2, 11),
            text,
            updatedAt: this.getJSTTimestamp()
          });
          await this.spaceManager.updateSpace(currentSpace.id, { memos: currentSpace.memos });
        }
      }).open();
    };

    addMemoBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      openAddMemoModal();
    });

    const memoList = memoCard.createDiv({ cls: "vps-memo-list" });
    memoList.style.cssText =
      "max-height: 300px; overflow-y: auto; display: flex; flex-direction: column; gap: 10px;";

    // Context Menu for Memo Card
    memoCard.addEventListener("contextmenu", (event: MouseEvent) => {
      event.preventDefault();
      const menu = new Menu();
      menu.addItem((item) => {
        item.setTitle("添加备忘")
          .setIcon("plus")
          .onClick(() => {
            openAddMemoModal();
          });
      });

      const target = event.target as HTMLElement;
      const memoItemEl = target.closest(".vps-memo-item");
      if (memoItemEl) {
        const memoId = memoItemEl.getAttribute("data-memo-id");
        if (memoId) {
          menu.addSeparator();
          menu.addItem((item) => {
            item.setTitle("编辑备忘")
              .setIcon("pencil")
              .onClick(() => {
                const currentSpace = this.spaceManager.getSpace(this.spaceId!);
                const memo = currentSpace?.memos?.find(m => m.id === memoId);
                if (memo) {
                  new MemoModal(this.app, "修改备忘录", "保存", memo.text, async (newText) => {
                    memo.text = newText;
                    memo.updatedAt = this.getJSTTimestamp();
                    await this.spaceManager.updateSpace(currentSpace!.id, { memos: currentSpace!.memos });
                  }).open();
                }
              });
          });
          menu.addItem((item) => {
            item.setTitle("删除备忘")
              .setIcon("trash")
              .onClick(async () => {
                const currentSpace = this.spaceManager.getSpace(this.spaceId!);
                if (currentSpace && currentSpace.memos) {
                  const targetMemo = currentSpace.memos.find(m => m.id === memoId);
                  if (targetMemo) {
                    await this.deleteMemoAttachments(targetMemo.text);
                  }
                  currentSpace.memos = currentSpace.memos.filter(m => m.id !== memoId);
                  await this.spaceManager.updateSpace(currentSpace.id, { memos: currentSpace.memos });
                }
              });
          });
        }
      }
      menu.showAtPosition({ x: event.clientX, y: event.clientY });
    });

    const displayedMemos = (space.memos || []).slice().reverse(); // Show newest first

    // Double click to add memo on empty area or anywhere inside memoList that is not a memo item
    memoList.addEventListener("dblclick", (e) => {
      const target = e.target as HTMLElement;
      if (!target.closest(".vps-memo-item")) {
        openAddMemoModal();
      }
    });

    if (displayedMemos.length === 0) {
      memoList.createDiv({
        text: "暂无备忘信息，双击或点击右上角按钮添加",
        cls: "vps-space-meta",
      });
    } else {
      displayedMemos.forEach((memo) => {
        const memoItem = memoList.createDiv({
          cls: "vps-memo-item",
        });
        memoItem.setAttribute("data-memo-id", memo.id);

        const memoContent = memoItem.createDiv({
          cls: "vps-memo-text",
        });
        const resolvedMarkdown = this.resolveImageLinks(memo.text);
        MarkdownRenderer.renderMarkdown(resolvedMarkdown, memoContent, "", this);

        // Click on image inside memo text to preview
        memoContent.addEventListener("click", (e) => {
          const target = e.target as HTMLElement;
          if (target.tagName === "IMG") {
            e.stopPropagation();
            new MemoPreviewModal(this.app, memo.text, this.resolveImageLinks.bind(this), this).open();
          }
        });

        // Double click text to edit
        memoContent.addEventListener("dblclick", (e) => {
          e.stopPropagation();
          new MemoModal(this.app, "修改备忘录", "保存", memo.text, async (newText) => {
            const currentSpace = this.spaceManager.getSpace(this.spaceId!);
            if (currentSpace && currentSpace.memos) {
              const targetMemo = currentSpace.memos.find(m => m.id === memo.id);
              if (targetMemo) {
                targetMemo.text = newText;
                targetMemo.updatedAt = this.getJSTTimestamp();
                await this.spaceManager.updateSpace(currentSpace.id, { memos: currentSpace.memos });
              }
            }
          }).open();
        });

        const memoFooter = memoItem.createDiv({
          cls: "vps-memo-footer",
        });

        memoFooter.createDiv({
          cls: "vps-memo-time",
          text: memo.updatedAt,
        });

        const memoItemActions = memoFooter.createDiv({
          cls: "vps-memo-actions",
        });

        const previewBtn = memoItemActions.createEl("span", {
          cls: "vps-memo-action-btn preview-btn",
          title: "预览"
        });
        setIcon(previewBtn, "expand");
        previewBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          new MemoPreviewModal(this.app, memo.text, this.resolveImageLinks.bind(this), this).open();
        });

        const editBtn = memoItemActions.createEl("span", {
          cls: "vps-memo-action-btn edit-btn",
          title: "编辑"
        });
        setIcon(editBtn, "pencil");
        editBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          new MemoModal(this.app, "修改备忘录", "保存", memo.text, async (newText) => {
            const currentSpace = this.spaceManager.getSpace(this.spaceId!);
            if (currentSpace && currentSpace.memos) {
              const targetMemo = currentSpace.memos.find(m => m.id === memo.id);
              if (targetMemo) {
                targetMemo.text = newText;
                targetMemo.updatedAt = this.getJSTTimestamp();
                await this.spaceManager.updateSpace(currentSpace.id, { memos: currentSpace.memos });
              }
            }
          }).open();
        });

        const deleteBtn = memoItemActions.createEl("span", {
          cls: "vps-memo-action-btn delete-btn",
          title: "删除"
        });
        setIcon(deleteBtn, "trash");
        deleteBtn.addEventListener("click", async (e) => {
          e.stopPropagation();
          const currentSpace = this.spaceManager.getSpace(this.spaceId!);
          if (currentSpace && currentSpace.memos) {
            const targetMemo = currentSpace.memos.find(m => m.id === memo.id);
            if (targetMemo) {
              await this.deleteMemoAttachments(targetMemo.text);
            }
            currentSpace.memos = currentSpace.memos.filter(m => m.id !== memo.id);
            await this.spaceManager.updateSpace(currentSpace.id, { memos: currentSpace.memos });
          }
        });
      });
    }
  }

  private async scanTasks(space: ProjectSpace): Promise<SpaceTask[]> {
    const files = this.spaceManager.getSpaceFiles(space.id);
    const tasks: SpaceTask[] = [];

    // Scan file-based tasks
    for (const file of files) {
      if (file.extension !== "md") continue;

      const content = await this.app.vault.read(file);
      const lines = content.split("\n");

      lines.forEach((line, index) => {
        // Regex to match markdown tasks: - [ ] or - [x] or - [X]
        const match = line.match(/^\s*[-*]\s*\[([ xX])\]\s*(.*)$/);
        if (match) {
          const completed = match[1].toLowerCase() === "x";
          const text = match[2].trim();
          tasks.push({
            file,
            lineIndex: index,
            text,
            completed,
            rawLine: line,
          });
        }
      });
    }

    // Load custom tasks stored in data settings
    if (space.tasks) {
      space.tasks.forEach(customTask => {
        tasks.push({
          text: customTask.text,
          completed: customTask.completed,
          customTaskId: customTask.id
        });
      });
    }

    return tasks;
  }

  private async toggleTaskCompletion(task: SpaceTask) {
    if (task.customTaskId) {
      const space = this.spaceManager.getSpace(this.spaceId!);
      if (space && space.tasks) {
        const customTask = space.tasks.find(t => t.id === task.customTaskId);
        if (customTask) {
          customTask.completed = !task.completed;
          task.completed = customTask.completed;
          await this.spaceManager.updateSpace(space.id, { tasks: space.tasks });
        }
      }
      return;
    }

    const file = task.file;
    if (!file || task.lineIndex === undefined) return;
    const content = await this.app.vault.read(file);
    const lines = content.split("\n");

    // Safety check: verify line matches the original text roughly
    if (
      lines[task.lineIndex] !== undefined &&
      lines[task.lineIndex].includes(task.text)
    ) {
      const line = lines[task.lineIndex];
      const newCompletedState = !task.completed;

      // Update check symbol
      const updatedLine = line.replace(
        /(\s*[-*]\s*\[)([ xX])(\]\s*.*)/,
        `$1${newCompletedState ? "x" : " "}$3`,
      );
      lines[task.lineIndex] = updatedLine;

      await this.app.vault.modify(file, lines.join("\n"));

      // Update local state
      task.completed = newCompletedState;
      task.rawLine = updatedLine;
    }
  }

  // Helper to adjust color brightness
  private adjustColorBrightness(hex: string, percent: number): string {
    let R = parseInt(hex.substring(1, 3), 16);
    let G = parseInt(hex.substring(3, 5), 16);
    let B = parseInt(hex.substring(5, 7), 16);

    R = Math.max(0, Math.min(255, R + (R * percent) / 100));
    G = Math.max(0, Math.min(255, G + (G * percent) / 100));
    B = Math.max(0, Math.min(255, B + (B * percent) / 100));

    const rHex = Math.round(R).toString(16).padStart(2, "0");
    const gHex = Math.round(G).toString(16).padStart(2, "0");
    const bHex = Math.round(B).toString(16).padStart(2, "0");

    return `#${rHex}${gHex}${bHex}`;
  }

  private hexToRgba(hex: string, alpha: number): string {
    const r = parseInt(hex.substring(1, 3), 16);
    const g = parseInt(hex.substring(3, 5), 16);
    const b = parseInt(hex.substring(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  private resolveImageLinks(markdown: string): string {
    const wikiRegex = /!\[\[([^\]]+)\]\]/g;
    let resolved = markdown.replace(wikiRegex, (match, content) => {
      const parts = content.split("|");
      const linkpath = parts[0].trim();
      const width = parts[1] ? parts[1].trim() : "";

      const file = this.app.vault.getAbstractFileByPath(linkpath) || 
                   this.app.metadataCache.getFirstLinkpathDest(linkpath, "");
      if (file instanceof TFile) {
        const resourcePath = this.app.vault.getResourcePath(file);
        if (width) {
          return `<img src="${resourcePath}" width="${width}" />`;
        }
        return `![image](${resourcePath})`;
      }
      return match;
    });

    const mdRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;
    resolved = resolved.replace(mdRegex, (match, alt, href) => {
      if (/^(https?|app|data):/i.test(href)) {
        return match;
      }
      const file = this.app.vault.getAbstractFileByPath(href) || 
                   this.app.metadataCache.getFirstLinkpathDest(href, "");
      if (file instanceof TFile) {
        return `![${alt}](${this.app.vault.getResourcePath(file)})`;
      }
      return match;
    });

    return resolved;
  }

  private async deleteMemoAttachments(text: string) {
    const wikiRegex = /!\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g;
    const mdRegex = /!\[[^\]]*\]\(([^)]+)\)/g;
    const paths: string[] = [];
    let match;

    while ((match = wikiRegex.exec(text)) !== null) {
      paths.push(match[1].trim());
    }
    while ((match = mdRegex.exec(text)) !== null) {
      const href = match[1].trim();
      if (!/^(https?|app|data):/i.test(href)) {
        paths.push(href);
      }
    }

    for (const path of paths) {
      if (path.startsWith("attachments/paste-")) {
        const file = this.app.vault.getAbstractFileByPath(path);
        if (file instanceof TFile) {
          try {
            await this.app.vault.delete(file);
          } catch (err) {
            console.error("Failed to delete attachment file:", path, err);
          }
        }
      }
    }
  }

  private getJSTTimestamp(date: Date = new Date()): string {
    return date.toLocaleString("ja-JP", {
      timeZone: "Asia/Tokyo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false
    }).replace(/\//g, "-") + " (JST)";
  }
}

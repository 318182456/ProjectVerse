import { App, Modal, Setting, TFolder, TFile, Notice } from 'obsidian';
import { FolderSuggestModal } from './folderSuggestModal';

export class SaveNoteModal extends Modal {
  private file: TFile;
  private fileName: string;
  private folderPath: string;
  private onSave: (newName: string, folderPath: string) => Promise<void>;

  constructor(app: App, file: TFile, defaultFolderPath: string, onSave: (newName: string, folderPath: string) => Promise<void>) {
    super(app);
    this.file = file;
    // Strip _temp_ prefix and timestamps if any
    this.fileName = file.basename.startsWith('_temp_') 
      ? file.basename.replace(/^_temp_(_\d+)?_/, '') 
      : file.basename;
    this.folderPath = defaultFolderPath;
    this.onSave = onSave;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl('h2', { text: '保存临时笔记' });

    let fileNameSetting = new Setting(contentEl)
      .setName('文件名')
      .setDesc('请输入笔记文件名')
      .addText(text => text
        .setValue(this.fileName)
        .onChange(value => {
          this.fileName = value;
        }));

    let folderSetting = new Setting(contentEl)
      .setName('保存文件夹')
      .setDesc('选择笔记要保存的文件夹路径')
      .addText(text => {
        text.setValue(this.folderPath);
        text.onChange(value => {
          this.folderPath = value;
        });
        text.inputEl.style.width = '180px';
        
        // Expose text component so we can update it from the button callback
        (this as any).folderTextComponent = text;
      })
      .addButton(btn => btn
        .setButtonText('浏览...')
        .onClick(() => {
          new FolderSuggestModal(this.app, (folder) => {
            const path = folder.path === '/' ? '/' : folder.path;
            this.folderPath = path;
            if ((this as any).folderTextComponent) {
              (this as any).folderTextComponent.setValue(path);
            }
          }).open();
        })
      );

    new Setting(contentEl)
      .addButton(btn => btn
        .setButtonText('保存')
        .setCta()
        .onClick(async () => {
          if (!this.fileName.trim()) {
            new Notice('文件名不能为空！');
            return;
          }
          await this.onSave(this.fileName, this.folderPath);
          this.close();
        }))
      .addButton(btn => btn
        .setButtonText('取消')
        .onClick(() => this.close()));
  }

  onClose() {
    this.contentEl.empty();
  }
}

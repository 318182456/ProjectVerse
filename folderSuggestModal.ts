import { App, FuzzySuggestModal, TFolder } from 'obsidian';

export class FolderSuggestModal extends FuzzySuggestModal<TFolder> {
  private onSubmit: (folder: TFolder) => void;

  constructor(app: App, onSubmit: (folder: TFolder) => void) {
    super(app);
    this.onSubmit = onSubmit;
  }

  getItems(): TFolder[] {
    const folders: TFolder[] = [];
    const files = this.app.vault.getAllLoadedFiles();
    files.forEach(f => {
      if (f instanceof TFolder) {
        folders.push(f);
      }
    });
    // Add root folder too
    folders.push(this.app.vault.getRoot());
    return folders;
  }

  getItemText(folder: TFolder): string {
    return folder.path === '/' ? '/' : folder.path;
  }

  onChooseItem(folder: TFolder, evt: MouseEvent | KeyboardEvent): void {
    this.onSubmit(folder);
  }
}

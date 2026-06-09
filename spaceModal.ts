import { App, Modal, Setting } from 'obsidian';
import { ProjectSpace } from './types';

export class SpaceModal extends Modal {
  private space?: ProjectSpace;
  private onSubmit: (name: string, icon: string, color: string) => void;

  private name: string = '';
  private icon: string = 'lucide-folder';
  private color: string = '#4CAF50';

  constructor(app: App, onSubmit: (name: string, icon: string, color: string) => void, space?: ProjectSpace) {
    super(app);
    this.onSubmit = onSubmit;
    this.space = space;
    
    if (this.space) {
      this.name = this.space.name;
      this.icon = this.space.icon;
      this.color = this.space.color;
    }
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    
    contentEl.createEl('h2', { text: this.space ? '编辑项目空间' : '新建项目空间' });

    new Setting(contentEl)
      .setName('空间名称')
      .setDesc('为您的逻辑项目空间命名')
      .addText(text => text
        .setValue(this.name)
        .setPlaceholder('例如: Frontend project')
        .onChange(value => {
          this.name = value;
        }));

    const icons = [
      { name: '默认文件夹', value: 'lucide-folder' },
      { name: '代码', value: 'lucide-code' },
      { name: '文档', value: 'lucide-book' },
      { name: '网页/全球', value: 'lucide-globe' },
      { name: '数据库', value: 'lucide-database' },
      { name: '任务/对勾', value: 'lucide-check-square' },
      { name: '火箭', value: 'lucide-rocket' },
      { name: '设置/齿轮', value: 'lucide-settings' }
    ];

    new Setting(contentEl)
      .setName('空间图标')
      .setDesc('在侧边栏显示的图标')
      .addDropdown(dropdown => {
        for (const i of icons) {
          dropdown.addOption(i.value, i.name);
        }
        dropdown.setValue(this.icon);
        dropdown.onChange(value => {
          this.icon = value;
        });
      });


    new Setting(contentEl)
      .setName('主题色')
      .setDesc('该空间的主色调')
      .addColorPicker(colorPicker => {
        colorPicker.setValue(this.color);
        colorPicker.onChange(value => {
          this.color = value;
        });
      });

    new Setting(contentEl)
      .addButton(btn => btn
        .setButtonText(this.space ? '保存修改' : '立即创建')
        .setCta()
        .onClick(() => {
          if (!this.name.trim()) {
            this.name = this.space ? this.space.name : '未命名空间';
          }
          this.onSubmit(this.name, this.icon, this.color);
          this.close();
        }))
      .addButton(btn => btn
        .setButtonText('取消')
        .onClick(() => {
          this.close();
        }));
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}

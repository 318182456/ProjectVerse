import fs from 'fs';
import path from 'path';

const targetDir = 'C:\\Users\\admin\\Documents\\Obsidian\\WorkSpace\\.obsidian\\plugins\\project-verse';
const filesToCopy = ['main.js', 'manifest.json', 'styles.css'];

try {
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
    console.log(`Created target directory: ${targetDir}`);
  }

  filesToCopy.forEach(file => {
    const src = path.join(process.cwd(), file);
    const dest = path.join(targetDir, file);
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, dest);
      console.log(`Successfully copied ${file} to target plugin directory.`);
    } else {
      console.warn(`Source file ${file} does not exist, skipping.`);
    }
  });

  console.log('Deployment finished successfully!');
} catch (e) {
  console.error('Failed to deploy files to Obsidian plugin directory:', e);
  process.exit(1);
}

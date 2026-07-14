const fs = require('node:fs');
const path = require('node:path');

const rootDir = path.resolve(__dirname, '..');
const distDir = path.join(rootDir, 'dist');

const publicConfig = {
  url: process.env.SUPABASE_URL || '',
  publishableKey: process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || '',
};

function copyRecursive(source, destination) {
  const stat = fs.statSync(source);

  if (stat.isDirectory()) {
    fs.mkdirSync(destination, { recursive: true });
    for (const entry of fs.readdirSync(source)) {
      copyRecursive(path.join(source, entry), path.join(destination, entry));
    }
    return;
  }

  fs.copyFileSync(source, destination);
}

fs.rmSync(distDir, { recursive: true, force: true });
fs.mkdirSync(distDir, { recursive: true });

copyRecursive(path.join(rootDir, 'index.html'), path.join(distDir, 'index.html'));
copyRecursive(path.join(rootDir, 'src'), path.join(distDir, 'src'));

const envJs = `window.__SUPABASE_CONFIG__ = ${JSON.stringify(publicConfig, null, 2)};\n`;
fs.writeFileSync(path.join(distDir, 'src', 'env.js'), envJs, 'utf8');

const fs = require('fs');
const path = require('path');

const rootDir = path.join(__dirname, '..');
const backendDir = path.join(rootDir, 'dist-backend');

// Create backend directory if it doesn't exist
if (!fs.existsSync(backendDir)) {
  fs.mkdirSync(backendDir, { recursive: true });
}

console.log('Copying deployment files to dist-backend...');

// 1. Copy commands folder
const commandsSource = path.join(rootDir, 'commands');
const commandsDest = path.join(backendDir, 'commands');

if (!fs.existsSync(commandsDest)) {
  fs.mkdirSync(commandsDest, { recursive: true });
  console.log('Created dist-backend/commands directory');
}

const commandFiles = fs.readdirSync(commandsSource);
let commandCount = 0;
commandFiles.forEach(file => {
  if (file.endsWith('.js')) {
    fs.copyFileSync(path.join(commandsSource, file), path.join(commandsDest, file));
    console.log(`✓ Copied commands/${file}`);
    commandCount++;
  }
});

// 2. Copy deploy-commands.js
const deploySource = path.join(rootDir, 'deploy-commands.js');
const deployDest = path.join(backendDir, 'deploy-commands.js');
fs.copyFileSync(deploySource, deployDest);
console.log(`✓ Copied deploy-commands.js`);

// 3. Copy utils folder
const utilsSource = path.join(rootDir, 'utils');
const utilsDest = path.join(backendDir, 'utils');

if (!fs.existsSync(utilsDest)) {
  fs.mkdirSync(utilsDest, { recursive: true });
  console.log('Created dist-backend/utils directory');
}

const utilFiles = fs.readdirSync(utilsSource);
let utilCount = 0;
utilFiles.forEach(file => {
  if (file.endsWith('.js')) {
    fs.copyFileSync(path.join(utilsSource, file), path.join(utilsDest, file));
    console.log(`✓ Copied utils/${file}`);
    utilCount++;
  }
});

// 4. Copy all node_modules for deploy-commands.js
// Copying all modules to avoid missing dependency issues
const nodeModulesSource = path.join(rootDir, 'node_modules');
const nodeModulesDest = path.join(backendDir, 'node_modules');

console.log('Copying node_modules (this may take a moment)...');

if (fs.existsSync(nodeModulesSource)) {
  fs.cpSync(nodeModulesSource, nodeModulesDest, {
    recursive: true,
    filter: (src) => {
      // Exclude large unnecessary folders to save space
      const excludeDirs = ['.bin', '.cache', '.vite'];
      return !excludeDirs.some(dir => src.includes(`node_modules${path.sep}${dir}`));
    }
  });
  console.log(`✓ Copied node_modules`);
} else {
  console.warn(`⚠ node_modules not found at ${nodeModulesSource}`);
}

console.log(`\nDeployment files copied successfully!`);
console.log(`  - ${commandCount} command files`);
console.log(`  - ${utilCount} util files`);
console.log(`  - All npm modules copied`);
console.log(`  - 1 deploy script`);

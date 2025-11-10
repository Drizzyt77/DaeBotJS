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

// 4. Copy required node_modules for deploy-commands.js
const nodeModulesDest = path.join(backendDir, 'node_modules');

if (!fs.existsSync(nodeModulesDest)) {
  fs.mkdirSync(nodeModulesDest, { recursive: true });
}

// List of modules required by deploy-commands.js
const requiredModules = [
  '@discordjs',
  'discord-api-types',
  'discord.js'
];

const nodeModulesSource = path.join(rootDir, 'node_modules');
let moduleCount = 0;

requiredModules.forEach(moduleName => {
  const source = path.join(nodeModulesSource, moduleName);
  const dest = path.join(nodeModulesDest, moduleName);

  if (fs.existsSync(source)) {
    // Copy recursively
    fs.cpSync(source, dest, { recursive: true });
    console.log(`✓ Copied node_modules/${moduleName}`);
    moduleCount++;
  } else {
    console.warn(`⚠ Module not found: ${moduleName}`);
  }
});

console.log(`\nDeployment files copied successfully!`);
console.log(`  - ${commandCount} command files`);
console.log(`  - ${utilCount} util files`);
console.log(`  - ${moduleCount} npm modules`);
console.log(`  - 1 deploy script`);

#!/usr/bin/env node
/**
 * Build script for Google Apps Script deployment
 *
 * This script:
 * 1. Builds the Svelte sidebar to a single HTML file
 * 2. Compiles TypeScript GAS files
 * 3. Prepares the dist folder for clasp push
 */

import { execSync } from 'child_process';
import { readFileSync, writeFileSync, mkdirSync, existsSync, copyFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import ts from 'typescript';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT_DIR = join(__dirname, '..');
const DIST_DIR = join(ROOT_DIR, 'dist');
const GAS_DIR = join(ROOT_DIR, 'src', 'gas');
const GAS_DIST_DIR = join(DIST_DIR, 'gas');

console.log('Building Vaquill Google Docs Extension...\n');

// Step 1: Build Svelte sidebar
console.log('1. Building Svelte sidebar...');
try {
  execSync('npm run build', { cwd: ROOT_DIR, stdio: 'inherit' });
  console.log('   Sidebar built successfully!\n');
} catch (error) {
  console.error('   Failed to build sidebar:', error.message);
  process.exit(1);
}

// Step 2: Create GAS dist directory
console.log('2. Preparing GAS distribution...');
if (!existsSync(GAS_DIST_DIR)) {
  mkdirSync(GAS_DIST_DIR, { recursive: true });
}

// Step 3: Convert sidebar to GAS HTML template
console.log('3. Converting sidebar to GAS HTML template...');
const distHtmlPath = join(DIST_DIR, 'index.html');
if (existsSync(distHtmlPath)) {
  let sidebarHtml = readFileSync(distHtmlPath, 'utf8');

  // Wrap in GAS HTML template tags if using templated HTML
  // For now, we'll use raw HTML which works with HtmlService.createHtmlOutput

  // Write as sidebar.html for GAS
  writeFileSync(join(GAS_DIST_DIR, 'sidebar.html'), sidebarHtml);
  console.log('   sidebar.html created!\n');
} else {
  console.error('   dist/index.html not found. Build may have failed.');
  process.exit(1);
}

// Step 4: Copy GAS TypeScript files and convert to JavaScript
console.log('4. Processing GAS TypeScript files...');
const gasFiles = readdirSync(GAS_DIR).filter(f => f.endsWith('.ts'));

/**
 * Transpile a GAS TypeScript file to plain JavaScript.
 *
 * Google Apps Script uses a single shared global scope, not ES modules, so we
 * first drop import/export keywords (cross-file references go through
 * globalThis), then let the real TypeScript compiler strip the types. Using the
 * compiler instead of regex avoids silently corrupting code, for example string
 * literals that contain "): " or object-literal call arguments.
 */
function transpileGas(content) {
  const withoutModules = content
    // Drop whole import lines (type-only and value imports both go away; GAS
    // shares one global scope so there is nothing to import at runtime).
    .replace(/^\s*import\s+[\s\S]*?;\s*$/gm, '')
    // Drop the leading `export` keyword but keep the declaration itself.
    .replace(/^(\s*)export\s+(?=default\s|const\s|let\s|var\s|function\s|async\s|class\s|interface\s|type\s|enum\s|\{)/gm, '$1');

  const out = ts.transpileModule(withoutModules, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2019,
      module: ts.ModuleKind.None,
      removeComments: false,
      newLine: ts.NewLineKind.LineFeed,
    },
    reportDiagnostics: false,
  });

  return out.outputText.trim();
}

for (const file of gasFiles) {
  const content = readFileSync(join(GAS_DIR, file), 'utf8');
  const jsContent = transpileGas(content);

  // Write as .gs file (Google Apps Script)
  const outputName = file.replace('.ts', '.gs');
  writeFileSync(join(GAS_DIST_DIR, outputName), jsContent);
  console.log(`   ${file} -> ${outputName}`);
}

// Step 5: Copy appsscript.json
console.log('\n5. Copying appsscript.json...');
const appscriptPath = join(ROOT_DIR, 'appsscript.json');
if (existsSync(appscriptPath)) {
  copyFileSync(appscriptPath, join(GAS_DIST_DIR, 'appsscript.json'));
  console.log('   appsscript.json copied!\n');
}

// Step 6: Maintain the push-ready .clasp.json at the repo ROOT (clasp is run
// from the root; rootDir points into dist/gas). It lives at the root, not in
// dist/, precisely because the Svelte build empties dist/ on every run, which
// would otherwise wipe the user's Script ID. We always refresh rootDir and
// filePushOrder from the template so they track the real files, while
// preserving an existing real scriptId (or accepting one via CLASP_SCRIPT_ID).
console.log('6. Writing .clasp.json (repo root)...');
const claspPath = join(ROOT_DIR, '.clasp.json');
const templatePath = join(ROOT_DIR, '.clasp.json.template');
const PLACEHOLDER_ID = 'YOUR_SCRIPT_ID_HERE';

// Resolve the Script ID: an existing root .clasp.json wins (persistent across
// builds), then the CLASP_SCRIPT_ID env var, otherwise the placeholder.
let scriptId = PLACEHOLDER_ID;
if (existsSync(claspPath)) {
  try {
    const existing = JSON.parse(readFileSync(claspPath, 'utf8'));
    if (existing.scriptId && existing.scriptId !== PLACEHOLDER_ID) {
      scriptId = existing.scriptId;
    }
  } catch {
    // Corrupt/partial file; fall through to env or placeholder.
  }
}
if (scriptId === PLACEHOLDER_ID && process.env.CLASP_SCRIPT_ID) {
  scriptId = process.env.CLASP_SCRIPT_ID.trim();
}

// Start from the checked-in template so rootDir/filePushOrder are the single
// source of truth; fall back to an inline default if the template is missing.
let claspConfig;
if (existsSync(templatePath)) {
  claspConfig = JSON.parse(readFileSync(templatePath, 'utf8'));
} else {
  claspConfig = {
    rootDir: './dist/gas',
    fileExtension: 'gs',
    filePushOrder: [
      'Code.gs',
      'AuthService.gs',
      'ApiClient.gs',
      'NativeSuggestionService.gs',
      'SuggestionService.gs',
      'sidebar.html',
    ],
  };
}
claspConfig.scriptId = scriptId;
writeFileSync(claspPath, JSON.stringify(claspConfig, null, 2) + '\n');

if (scriptId === PLACEHOLDER_ID) {
  console.log('   .clasp.json written (set your Script ID before pushing).\n');
} else {
  console.log('   .clasp.json written (scriptId preserved).\n');
}

console.log('Build complete!');
console.log('\nNext steps:');
if (scriptId === PLACEHOLDER_ID) {
  console.log('1. One-time: `npm run gas:login`, then set the Script ID via');
  console.log('   `CLASP_SCRIPT_ID=<id> npm run build:gas` or edit ./.clasp.json.');
  console.log('2. Push: `npm run gas:push`   (build + push: `npm run deploy`)');
} else {
  console.log('1. Push: `npm run gas:push`   (build + push: `npm run deploy`)');
}
console.log('   Open in the editor: `npm run gas:open`');

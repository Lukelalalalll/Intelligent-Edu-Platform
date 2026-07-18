import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const MAX_LINES = 500;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const BASELINE_PATH = path.join(__dirname, 'file-size-baseline.txt');

function normalizeRelativePath(filePath) {
  return filePath.trim().replaceAll(path.sep, '/').replace(/^\.\/+/, '');
}

function readBaseline() {
  if (!existsSync(BASELINE_PATH)) {
    return new Set();
  }

  const content = readFileSync(BASELINE_PATH, 'utf8');
  return new Set(
    content
      .split(/\r?\n/)
      .map(normalizeRelativePath)
      .filter(Boolean),
  );
}

function listChangedFiles() {
  const commands = [
    ['git', ['diff', '--name-only', '--diff-filter=ACMRTUXB', 'HEAD']],
    ['git', ['ls-files', '--others', '--exclude-standard']],
  ];

  const files = new Set();

  for (const [command, args] of commands) {
    try {
      const output = execFileSync(command, args, {
        cwd: ROOT,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      for (const line of output.split(/\r?\n/)) {
        const normalized = normalizeRelativePath(line);
        if (normalized) files.add(normalized);
      }
    } catch {
      // Ignore git failures and keep the files gathered so far.
    }
  }

  return [...files];
}

function countLines(filePath) {
  const content = readFileSync(filePath, 'utf8');
  const matches = content.match(/\r?\n/g);
  return matches ? matches.length : 0;
}

function main() {
  const baseline = readBaseline();
  const changedFiles = listChangedFiles().filter((file) =>
    /\.(ts|tsx|css)$/.test(file),
  );

  const failures = [];

  for (const relativePath of changedFiles) {
    const absolutePath = path.join(ROOT, relativePath);
    if (!existsSync(absolutePath)) {
      continue;
    }

    const lineCount = countLines(absolutePath);
    if (lineCount > MAX_LINES && !baseline.has(relativePath)) {
      failures.push({ relativePath, lineCount });
    }
  }

  if (failures.length > 0) {
    console.error(`[file-size] Found ${failures.length} over-limit file(s):`);
    for (const failure of failures) {
      console.error(`- ${failure.relativePath} (${failure.lineCount} > ${MAX_LINES})`);
    }
    process.exit(1);
  }

  console.log(
    `[file-size] OK (${changedFiles.length} changed TS/TSX/CSS file(s), baseline ${baseline.size})`,
  );
}

main();

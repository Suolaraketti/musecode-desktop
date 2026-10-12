import { realpath, readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const exec = promisify(execFile);
const hidden = new Set(['.git', 'node_modules', 'target', 'dist', 'release', '.next', '.venv']);
export async function confined(root, relative = '') {
  if (typeof relative !== 'string' || relative.includes('\0')) throw new Error('Invalid file path.');
  const base = await realpath(root);
  const target = await realpath(path.resolve(base, relative));
  const rel = path.relative(base, target);
  if (rel === '..' || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel)) throw new Error('This file is outside the selected project.');
  return target;
}
export async function files(root, relative = '') {
  const directory = await confined(root, relative);
  const entries = await readdir(directory, { withFileTypes: true });
  return entries.filter(e => !hidden.has(e.name) && !e.isSymbolicLink())
    .sort((a,b) => Number(b.isDirectory()) - Number(a.isDirectory()) || a.name.localeCompare(b.name))
    .slice(0, 1000).map(e => ({ name: e.name, path: path.join(relative,e.name), directory: e.isDirectory() }));
}
export async function fileText(root, relative) {
  const target = await confined(root, relative);
  const info = await stat(target);
  if (!info.isFile()) throw new Error('Choose a file.');
  if (info.size > 1024 * 1024) throw new Error('File exceeds the 1 MB preview limit.');
  const data = await readFile(target);
  if (data.includes(0)) throw new Error('Binary files cannot be previewed.');
  return data.toString('utf8');
}
async function git(root, args) {
  const result = await exec('git', ['-C', await realpath(root), ...args], { windowsHide: true, timeout: 15000, maxBuffer: 4 * 1024 * 1024 });
  return result.stdout;
}
export function parseStatus(raw) {
  const entries = raw.split('\0'); const result = [];
  for (let i=0; i<entries.length; i++) {
    const row = entries[i]; if (!row) continue;
    const status = row.slice(0,2); const file = row.slice(3);
    const original = /[RC]/.test(status) ? entries[++i] : undefined;
    result.push({ path: file, status, ...(original ? { original } : {}) });
  }
  return result;
}
export async function changes(root) {
  try {
    const [status, branch] = await Promise.all([git(root,['status','--porcelain=v1','-z']),git(root,['branch','--show-current'])]);
    return { branch: branch.trim() || 'detached HEAD', files: parseStatus(status), repository: true };
  } catch (error) {
    if (/not a git repository/i.test(error.stderr || '')) return { branch: '', files: [], repository: false };
    throw error;
  }
}
export async function diff(root, relative, status) {
  // Deleted paths cannot be realpathed; resolve their parent to enforce containment.
  await confined(root, path.dirname(relative));
  if (path.isAbsolute(relative) || relative.split(/[\\/]/).includes('..')) throw new Error('Invalid diff path.');
  if (status === '??') {
    const content = await fileText(root,relative);
    return `--- /dev/null\n+++ b/${relative}\n@@ new file @@\n${content.split('\n').map(line => `+${line}`).join('\n')}`;
  }
  const [staged, unstaged] = await Promise.all([
    git(root,['diff','--cached','--no-ext-diff','--no-color','--',relative]),
    git(root,['diff','--no-ext-diff','--no-color','--',relative])
  ]);
  return [staged && `Staged changes\n${staged}`,unstaged && `Working tree changes\n${unstaged}`].filter(Boolean).join('\n') || 'No textual diff. This may be a binary file or a metadata change.';
}

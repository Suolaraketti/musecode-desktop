import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { confined, files, fileText, parseStatus, changes, diff } from '../electron/workspace.mjs';
test('File previews enforce root containment and reject binary/oversized files',async()=>{
  const root=await mkdtemp(path.join(tmpdir(),'musecode-test-'));
  try{
    const project=path.join(root,'project');await mkdir(project);await writeFile(path.join(root,'outside.txt'),'private');await writeFile(path.join(project,'hello.ts'),'hello');await writeFile(path.join(project,'binary.dat'),Buffer.from([0,1,2]));await writeFile(path.join(project,'large.txt'),'x'.repeat(1024*1024+1));
    await mkdir(path.join(project,'node_modules'));await symlink(root,path.join(project,'escape'),process.platform==='win32'?'junction':'dir');
    assert.equal(await fileText(project,'hello.ts'),'hello');
    await assert.rejects(()=>confined(project,'../outside.txt'),/outside/);
    await assert.rejects(()=>fileText(project,'escape/outside.txt'),/outside/);
    await assert.rejects(()=>fileText(project,'binary.dat'),/Binary/);
    await assert.rejects(()=>fileText(project,'large.txt'),/1 MB/);
    assert.ok(!(await files(project)).some(f=>['escape','node_modules'].includes(f.name)));
  }finally{await rm(root,{recursive:true,force:true});}
});
test('Git parsing keeps spaces and rename pairs; changes show staged, unstaged and untracked content',async()=>{
  assert.deepEqual(parseStatus('R  new name.ts\0old name.ts\0?? added.ts\0'),[{path:'new name.ts',status:'R ',original:'old name.ts'},{path:'added.ts',status:'??'}]);
  const root=await mkdtemp(path.join(tmpdir(),'musecode-git-'));const git=(...args)=>execFileSync('git',['-C',root,...args],{windowsHide:true});
  try{git('init');await writeFile(path.join(root,'code.txt'),'first\n');git('add','code.txt');await writeFile(path.join(root,'code.txt'),'second\n');await writeFile(path.join(root,'new file.txt'),'new content');
    const status=await changes(root);assert.equal(status.repository,true);assert.equal(status.files.length,2);
    const patch=await diff(root,'code.txt','AM');assert.match(patch,/Staged changes/);assert.match(patch,/Working tree changes/);assert.match(patch,/\+second/);
    assert.match(await diff(root,'new file.txt','??'),/\+new content/);
    await assert.rejects(()=>diff(root,'../outside.txt','??'),/outside|Invalid/);
  }finally{await rm(root,{recursive:true,force:true});}
});

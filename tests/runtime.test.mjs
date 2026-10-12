import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { MuseRuntime } from '../electron/runtime.mjs';
const fixture=fileURLToPath(new URL('./fixture-host.mjs',import.meta.url));
async function until(check){const end=Date.now()+5000;while(Date.now()<end){if(check())return;await new Promise(r=>setTimeout(r,15));}assert.fail('Timed out waiting for protocol event.');}
test('MSP initializes, streams, keeps authoritative text, and round-trips explicit approval',async()=>{
  const events=[];const runtime=new MuseRuntime(e=>events.push(e));
  try{
    const info=await runtime.connect(process.execPath,process.cwd(),[fixture]);assert.equal(info.serverInfo.name,'fixture-muse');
    await runtime.acquire('session/start',{workspaceRoot:process.cwd()});
    await runtime.command('turn/start',{sessionId:'test-session',input:[{type:'text',text:'Test prompt'}],ifBusy:'steer'});
    await until(()=>runtime.snapshot('test-session').approvals.length===1);
    assert.equal(runtime.snapshot('test-session').items.find(i=>i.itemId==='agent-1').text,'Streamed answer.');
    await assert.rejects(()=>runtime.approve('test-session','approval-1','invented-choice'),/did not offer/);
    await runtime.approve('test-session','approval-1','allow-once');
    await until(()=>runtime.snapshot('test-session').items.find(i=>i.itemId==='agent-1')?.status==='completed');
    assert.equal(runtime.snapshot('test-session').items.find(i=>i.itemId==='agent-1').text,'Authoritative final answer.');
    assert.equal(runtime.snapshot('test-session').approvals.length,0);
    await until(()=>events.some(e=>e.method==='turn/completed'));
    assert.deepEqual((await runtime.request('session/read',{sessionId:'test-session'})).receipt,{});
    assert.equal(events.filter(e=>e.type==='error').length,0);
  }finally{await runtime.disconnect();}
});
test('Resume restores server history and invalid operations are refused',async()=>{
  const runtime=new MuseRuntime(()=>{});
  try{await runtime.connect(process.execPath,process.cwd(),[fixture]);await runtime.acquire('session/resume',{sessionId:'test-session',history:'inline'});assert.equal(runtime.snapshot('test-session').items[0].text,'Restored history.');await assert.rejects(()=>runtime.command('dangerous/unknown',{}),/Unsupported/);}
  finally{await runtime.disconnect();}
  assert.throws(()=>runtime.requireHost(),/Connect/);
});
test('Missing binary fails cleanly',async()=>{const runtime=new MuseRuntime(()=>{});await assert.rejects(()=>runtime.connect('nonexistent-muse-fixture-12345'),/ENOENT|spawn|EPIPE/);assert.ok(!runtime.host);});

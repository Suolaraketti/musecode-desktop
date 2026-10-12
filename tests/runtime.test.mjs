import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { MuseRuntime, normalizeUsage } from '../electron/runtime.mjs';
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
test('normalizeUsage reads the native subscription envelope without inventing token quotas',()=>{
  const observedAtMs=Date.parse('2026-10-12T20:00:00Z');
  const usage=normalizeUsage({usage:{observedAtMs,tier:'test',window:{usedPercent:25,windowDurationMins:300,resetsAtMs:Date.parse('2026-10-13T01:00:00Z')},weekly:{usedPercent:125,resetsAtMs:Date.parse('2026-10-19T00:00:00Z')}}});
  assert.equal(usage.supported,true);assert.equal(usage.windows.length,2);
  assert.equal(usage.windows[0].label,'5 hour');assert.equal(usage.windows[0].percent,25);assert.equal(usage.windows[0].remaining,null);assert.equal(usage.windows[0].used,null);
  assert.equal(usage.windows[0].resetsAt,'2026-10-13T01:00:00.000Z');assert.equal(usage.observedAtMs,observedAtMs);
  assert.equal(usage.windows[1].label,'Weekly');assert.equal(usage.windows[1].percent,125);
  assert.deepEqual(normalizeUsage({}),{supported:true,windows:[]});
  assert.deepEqual(normalizeUsage({usage:{window:{usedPercent:'',windowDurationMins:300}}}).windows,[]);
  assert.deepEqual(normalizeUsage(null),{supported:false,windows:[]});
  const unknown=normalizeUsage({somethingElse:42});assert.equal(unknown.supported,true);assert.deepEqual(unknown.windows,[]);assert.equal(unknown.unrecognized,true);
});
test('accountUsage reads host windows and hides unsupported hosts',async()=>{
  const runtime=new MuseRuntime(()=>{});
  try{
    await runtime.connect(process.execPath,process.cwd(),[fixture]);
    const usage=await runtime.accountUsage();
    assert.equal(usage.supported,true);assert.equal(usage.windows.length,2);
    assert.equal(usage.windows[0].percent,25);assert.equal(usage.windows[1].percent,18);
    runtime.host.connection.request=async()=>{throw Object.assign(new Error('Method not found'),{kind:'methodNotFound'});};
    assert.deepEqual(await runtime.accountUsage(),{supported:false,windows:[]});
  }finally{await runtime.disconnect();}
});
test('approval mode selector switches the active session and rejects invented modes',async()=>{
  const runtime=new MuseRuntime(()=>{});
  try{
    await runtime.connect(process.execPath,process.cwd(),[fixture]);
    const row=await runtime.acquire('session/start',{workspaceRoot:process.cwd(),approvalMode:'onRequest'});
    assert.equal(row.approvalMode.mode,'onRequest');
    const result=await runtime.command('session/setApprovalMode',{sessionId:'test-session',mode:'allowAll'});
    assert.equal(result.effectiveMode.mode,'allowAll');
    await until(()=>runtime.snapshot('test-session').row.approvalMode?.mode==='allowAll');
    await assert.rejects(()=>runtime.command('session/setApprovalMode',{sessionId:'test-session',mode:'yolo'}),/approval mode Muse offers/);
    await assert.rejects(()=>runtime.acquire('session/start',{workspaceRoot:process.cwd(),approvalMode:'yolo'}),/approval mode Muse offers/);
  }finally{await runtime.disconnect();}
});
test('Closing during startup shuts down the owned host and rejects the unfinished handshake',async()=>{
  const runtime=new MuseRuntime(()=>{});const connecting=runtime.connect(process.execPath,process.cwd(),[fixture],{...process.env,MUSECODE_FIXTURE_STALL_INITIALIZE:'1'});
  const refused=assert.rejects(connecting);await until(()=>!!runtime.starting);await runtime.disconnect();await refused;assert.ok(!runtime.host);assert.ok(!runtime.starting);
});

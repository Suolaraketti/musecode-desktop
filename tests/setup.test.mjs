import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { RuntimeInstaller, SetupController, resolveBinary, loginUrl, signedIn } from '../electron/setup.mjs';

function harness({installed=false,authenticated=false,openFails=false}={}){
  const calls=[],events=[],settings={autoConnect:true},runtime={host:null};let state=authenticated?'accountLogin':'loggedOut';
  runtime.connect=async()=>{calls.push('connect');runtime.host={};};runtime.disconnect=async()=>{runtime.host=null;};
  runtime.account=async()=>({state,credentialRequired:true,label:state==='accountLogin'?'Test user':undefined});
  runtime.request=async(method,params)=>{calls.push({method,params});if(method==='account/loginStart')return{verificationUrl:'https://auth.meta.com/device',userCode:'TEST-CODE'};return{};};
  const installer={directory:path.join(tmpdir(),'managed-runtime'),ensure:async()=>{calls.push('install');installed=true;return'/runtime/muse';},cancel:()=>calls.push('cancel')};
  const setup=new SetupController({runtime,installer,settings,save:async()=>{},emit:e=>events.push(e),openBrowser:async url=>{calls.push({open:url});if(openFails)throw new Error('No browser.');},discover:async()=>installed?'/runtime/muse':''});
  return{setup,runtime,calls,events,settings,grant:()=>{state='accountLogin';return setup.notification({type:'notification',method:'account/changed',params:{state,credentialRequired:true,label:'Test user'}});}};
}
test('First run downloads once, uses host-owned login, and becomes ready only on account confirmation',async()=>{
  const h=harness();assert.equal((await h.setup.initialize()).phase,'welcome');
  const [first,second]=await Promise.all([h.setup.start(),h.setup.start()]);
  assert.equal(first.phase,'waiting');assert.equal(second.phase,'waiting');assert.equal(h.calls.filter(c=>c==='install').length,1);
  assert.deepEqual(h.calls.find(c=>c.method==='account/loginStart').params,{type:'deviceCode'});
  assert.equal(h.setup.state.account,undefined);assert.equal(h.setup.state.userCode,'TEST-CODE');
  await h.grant();assert.equal(h.setup.state.phase,'ready');assert.equal(h.setup.state.userCode,undefined);assert.equal(h.setup.state.verificationUrl,undefined);assert.equal(h.settings.autoConnect,true);
});
test('Returning account connects automatically without login or download; manual disconnect persists',async()=>{
  const h=harness({installed:true,authenticated:true});
  await Promise.all([h.setup.initialize(),h.setup.initialize()]);assert.equal(h.setup.state.phase,'ready');assert.deepEqual(h.calls,['connect']);
  await h.setup.disconnect();assert.equal(h.settings.autoConnect,false);assert.equal(h.runtime.host,null);assert.equal(h.setup.state.phase,'welcome');
});
test('Expired and denied sign-ins offer recovery; browser failure retains a usable native link',async()=>{
  const h=harness({installed:true,openFails:true});await h.setup.start();assert.equal(h.setup.state.phase,'waiting');assert.match(h.setup.state.message,/Open the sign-in page/);
  await h.setup.notification({type:'notification',method:'account/loginCompleted',params:{outcome:'expired'}});assert.equal(h.setup.state.phase,'error');assert.match(h.setup.state.message,/expired/);
  await h.setup.start();await h.setup.notification({type:'notification',method:'account/loginCompleted',params:{outcome:'denied'}});assert.match(h.setup.state.message,/wasn’t approved/);
  await h.setup.cancel();assert.equal(h.setup.state.phase,'welcome');assert.equal(h.setup.state.userCode,undefined);
});
test('A transport connection alone is not treated as account authentication',async()=>{
  const h=harness({installed:true});await h.setup.initialize();assert.ok(h.runtime.host);assert.equal(h.setup.state.phase,'welcome');assert.equal(signedIn({state:'futureUnknown',credentialRequired:true}),false);
  await h.setup.notification({type:'disconnected'});assert.match(h.setup.state.message,/Connection interrupted/);
});
test('Sign-in links require a known Meta HTTPS origin',()=>{
  assert.equal(loginUrl('https://auth.meta.com/device?code=TEST'),'https://auth.meta.com/device?code=TEST');
  for(const url of ['http://auth.meta.com/device','https://auth.meta.com.evil.test/','https://evil.test','https://user:secret@auth.meta.com/'])assert.throws(()=>loginUrl(url));
});
test('Binary discovery follows the official active-version marker, not filename sorting',async()=>{
  const root=await mkdtemp(path.join(tmpdir(),'muse-setup-'));
  try{await writeFile(path.join(root,'.muse-version'),'1.4.6-R6000.1');await writeFile(path.join(root,'muse-bin-1.4.6-R6000.1.exe'),'fixture');assert.equal(await resolveBinary({managed:root,platform:'win32',env:{}}),path.join(root,'muse-bin-1.4.6-R6000.1.exe'));await writeFile(path.join(root,'.muse-version'),'../../outside');assert.equal(await resolveBinary({managed:root,platform:'win32',env:{}}),'');}
  finally{await rm(root,{recursive:true,force:true});}
});
test('Managed installation stays private to the app, hides the shell, and checks download integrity',async()=>{
  const root=await mkdtemp(path.join(tmpdir(),'muse-install-'));let captured;
  const fakeSpawn=(command,args,options)=>{
    captured={command,args,options};const child=new EventEmitter();child.stdout=new PassThrough();child.stderr=new PassThrough();child.kill=()=>{};
    setTimeout(async()=>{await writeFile(path.join(root,'.muse-version'),'1.4.6-R6000.1');await writeFile(path.join(root,'muse-bin-1.4.6-R6000.1.exe'),'fixture');child.emit('close',0);},5);return child;
  };
  try{
    const installer=new RuntimeInstaller({directory:root,platform:'win32',env:{SystemRoot:'C:\\Windows',PSMODULEPATH:'old-modules',PSModulePath:'other-modules'},fetcher:async()=>new Response('fixture installer'),spawnProcess:fakeSpawn});
    assert.match(await installer.ensure(),/muse-bin-1\.4\.6/);assert.equal(captured.options.windowsHide,true);assert.equal(captured.options.env.MUSE_INSTALL_DIR,root);assert.equal(captured.options.env.MUSE_NO_MODIFY_PATH,'1');assert.equal(captured.options.env.MUSE_LOGIN,'0');
    assert.equal(Object.keys(captured.options.env).filter(k=>k.toUpperCase()==='PSMODULEPATH').length,1);assert.ok(captured.options.env.PSMODULEPATH.startsWith(path.join('C:\\Windows','System32','WindowsPowerShell','v1.0','Modules')));
    let ran=false;const corrupt=new RuntimeInstaller({directory:root,platform:'win32',fetcher:async()=>new Response('bad',{headers:{'x-content-sha256':'0'.repeat(64)}}),spawnProcess:()=>{ran=true;}});
    await assert.rejects(()=>corrupt.ensure({update:true}),/verified/);assert.equal(ran,false);
  }finally{await rm(root,{recursive:true,force:true});}
});
test('Transport recovery reconnects the account without resubmitting a user turn',async()=>{
  const h=harness({installed:true,authenticated:true});h.setup.reconnectDelays=[0];await h.setup.initialize();h.runtime.host=null;
  await h.setup.notification({type:'disconnected'});await h.setup.recovering;
  assert.equal(h.setup.state.phase,'ready');assert.equal(h.calls.filter(c=>c==='connect').length,2);assert.equal(h.calls.some(c=>c.method==='turn/start'),false);
});

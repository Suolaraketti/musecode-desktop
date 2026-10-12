// Opt-in live-runtime check. Starts/cancels a device flow without opening a
// browser, signing in, submitting a prompt, or calling a model.
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { MuseRuntime } from '../electron/runtime.mjs';
import { loginUrl } from '../electron/setup.mjs';
const binary=process.argv[2]||process.env.MUSECODE_NATIVE_TEST_BINARY;
if(!binary)throw new Error('Pass the native Muse executable to this opt-in test.');
const profile=await mkdtemp(path.join(tmpdir(),'muse-native-smoke-'));
const env={...process.env,XDG_CONFIG_HOME:profile};delete env.META_API_KEY;delete env.MODEL_API_KEY;
const events=[];const runtime=new MuseRuntime(event=>events.push(event));
try{
  const info=await runtime.connect(binary,profile,['serve','--no-session-log'],env);
  assert.equal(info.experimentalApi,true);
  const account=await runtime.account();assert.equal(typeof account.credentialRequired,'boolean');
  let deviceFlow='not required';
  if(account.state==='loggedOut'&&account.credentialRequired){
    const flow=await runtime.request('account/loginStart',{type:'deviceCode'});
    assert.ok(loginUrl(flow.verificationUrl));assert.ok(flow.userCode);
    const cancelled=await runtime.request('account/loginCancel',{});assert.equal(cancelled.cancelled,true);deviceFlow='started and cancelled';
  }
  console.log(JSON.stringify({nativeVersion:info.serverInfo.version,accountState:account.state,deviceFlow,modelCalls:0}));
}finally{await runtime.disconnect();await rm(profile,{recursive:true,force:true});}

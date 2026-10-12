import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile, writeFile, mkdir, realpath, stat, access } from 'node:fs/promises';
import { MuseRuntime } from './runtime.mjs';
import * as workspace from './workspace.mjs';
const directory=path.dirname(fileURLToPath(import.meta.url));
if(process.env.MUSECODE_TEST_USER_DATA)app.setPath('userData',process.env.MUSECODE_TEST_USER_DATA);
let win, settings={binary:'',projects:[],theme:'dark'}, projects=new Set(), quitting=false;
const runtime=new MuseRuntime(payload=>{if(win&&!win.isDestroyed()) win.webContents.send('muse:event',payload);});
const configPath=()=>path.join(app.getPath('userData'),'settings.json');
async function save(){await mkdir(app.getPath('userData'),{recursive:true});await writeFile(configPath(),JSON.stringify(settings,null,2));}
async function known(root){const canonical=await realpath(root); if(!projects.has(canonical)) throw new Error('Open this project using the folder picker first.'); return canonical;}
function validateText(value,limit=100000){if(typeof value!=='string'||!value.trim()||value.length>limit)throw new Error('Please enter valid text.');return value;}
async function findBinary(){
  const names=process.platform==='win32'?['muse.exe']:['muse'];
  for(const folder of (process.env.PATH||'').split(path.delimiter))for(const name of names){const candidate=path.join(folder,name);try{await access(candidate);return candidate;}catch{}}
  const local=process.env.LOCALAPPDATA; if(local){try{const {readdir}=await import('node:fs/promises');const folder=path.join(local,'Programs','muse');const names=(await readdir(folder)).filter(n=>/^muse-bin-.*\.exe$/.test(n)).sort().reverse();if(names.length)return path.join(folder,names[0]);}catch{}}
  return '';
}
function register(name,fn){ipcMain.handle(`muse:${name}`,async(event,...args)=>{
  if(event.sender!==win.webContents||event.senderFrame!==win.webContents.mainFrame)throw new Error('Untrusted caller.');
  try{return await fn(...args);}catch(error){throw new Error(error.message||String(error));}
});}
register('bootstrap',async()=>({...settings,connected:!!runtime.host,platform:process.platform}));
register('pickProject',async()=>{
  const selection=await dialog.showOpenDialog(win,{title:'Open a project',properties:['openDirectory']});if(selection.canceled)return null;
  const root=await realpath(selection.filePaths[0]);projects.add(root);settings.projects=[root,...settings.projects.filter(p=>p!==root)].slice(0,20);await save();return root;
});
register('pickBinary',async()=>{const r=await dialog.showOpenDialog(win,{title:'Select the native Muse Code binary',properties:['openFile'],filters:process.platform==='win32'?[{name:'Muse executable',extensions:['exe']}]:undefined});return r.canceled?null:r.filePaths[0];});
register('saveSettings',async(next)=>{if(typeof next.binary==='string')settings.binary=next.binary;if(['dark','light'].includes(next.theme))settings.theme=next.theme;await save();return settings;});
register('connect',async()=>{const binary=settings.binary||await findBinary();if(!binary)throw new Error('Muse Code is not installed or could not be found. Choose its native executable in Settings.');let info;try{info=await stat(binary);}catch{throw new Error('Muse Code could not be found at this path. Choose its native executable in Settings.');}if(!info.isFile())throw new Error('Choose a native Muse executable.');return runtime.connect(binary);});
register('disconnect',async()=>{await runtime.disconnect();return true;});
register('newSession',async(root,modelId)=>runtime.acquire('session/start',{workspaceRoot:await known(root),...(modelId?{modelId}: {})}));
register('resumeSession',async(id)=>{validateText(id,1000);const row=await runtime.acquire('session/resume',{sessionId:id,history:'inline'});if(row.workspaceRoot){const root=await realpath(row.workspaceRoot);projects.add(root);settings.projects=[root,...settings.projects.filter(p=>p!==root)].slice(0,20);await save();}return row;});
register('listSessions',async()=>runtime.request('session/list',{limit:100}));
register('send',async(id,text,effort,ifBusy)=>{validateText(text);if(!['queue','steer'].includes(ifBusy))throw new Error('Invalid turn mode.');if(!['none','minimal','low','medium','high','xhigh','max','ultra'].includes(effort))throw new Error('Invalid effort.');return runtime.command('turn/start',{sessionId:id,input:[{type:'text',text}],reasoningEffort:effort,ifBusy});});
register('cancel',id=>runtime.command('turn/cancel',{sessionId:id}));
register('models',id=>runtime.request('model/list',id?{sessionId:id}:{}));
register('setModel',(id,modelId)=>runtime.command('session/setModel',{sessionId:id,model:{modelId}}));
register('rename',(id,name)=>runtime.command('session/rename',{sessionId:id,name:validateText(name,200)}));
register('compact',id=>runtime.command('session/compact',{sessionId:id}));
register('fork',id=>runtime.acquire('session/fork',{sessionId:id,excludeItems:false}));
register('approve',(id,approvalId,choiceId)=>runtime.approve(id,approvalId,choiceId));
register('answer',(id,userInputId,answers)=>runtime.command('userInput/answer',{sessionId:id,userInputId,answers}));
register('clarify',(id,userInputId,text)=>runtime.command('userInput/clarify',{sessionId:id,userInputId,clarification:{content:validateText(text,500),format:'text'}}));
register('decline',(id,userInputId)=>runtime.command('userInput/cancel',{sessionId:id,userInputId}));
register('inventory',async(id)=>{
  const rows=await Promise.allSettled(['skill/list','hook/list','plugin/list','task/list'].map(method=>runtime.request(method,{sessionId:id})));
  return Object.fromEntries(rows.map((r,i)=>[['skills','hooks','plugins','tasks'][i],r.status==='fulfilled'?r.value:{error:r.reason.message}]));
});
register('shell',(id,text)=>{if(!runtime.requireHost().initializeResult.grantedCapabilities.includes('userShell'))throw new Error('This agent does not grant the terminal capability.');return runtime.command('session/userShell',{sessionId:id,commandText:validateText(text)});});
register('files',async(root,relative)=>workspace.files(await known(root),relative));
register('readFile',async(root,relative)=>workspace.fileText(await known(root),relative));
register('changes',async(root)=>workspace.changes(await known(root)));
register('diff',async(root,relative,status)=>workspace.diff(await known(root),relative,status));
register('exportSession',async(id)=>{
  const result=await dialog.showSaveDialog(win,{title:'Export conversation',defaultPath:'musecode-conversation.md',filters:[{name:'Markdown',extensions:['md']}]});
  if(result.canceled)return null;
  const snapshot=runtime.snapshot(id);const text=snapshot.items.map(i=>`## ${i.kind==='userMessage'?'You':i.kind==='agentMessage'?'MuseCode':i.kind}\n\n${i.text||i.visibleOutput||i.commandText||i.args||''}`).join('\n\n');
  await writeFile(result.filePath,text);return result.filePath;
});
register('openLink',async(url)=>{const parsed=new URL(url);if(parsed.protocol!=='https:')throw new Error('Only HTTPS links can be opened.');await shell.openExternal(parsed.href);});
register('window',action=>{if(action==='minimize')win.minimize();if(action==='maximize')win.isMaximized()?win.unmaximize():win.maximize();if(action==='close')win.close();});
app.whenReady().then(async()=>{
  try{settings={...settings,...JSON.parse(await readFile(configPath(),'utf8'))};}catch{}
  if(!Array.isArray(settings.projects))settings.projects=[];
  for(const p of settings.projects)try{projects.add(await realpath(p));}catch{}
  if(!settings.binary)settings.binary=await findBinary();
  win=new BrowserWindow({width:1440,height:940,minWidth:960,minHeight:640,show:process.env.MUSECODE_TEST_HIDDEN!=='1',title:'MuseCode',icon:path.join(directory,'../build/icon.png'),backgroundColor:'#111214',frame:false,webPreferences:{preload:path.join(directory,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true}});
  win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  win.webContents.on('will-navigate',event=>event.preventDefault());
  if(process.env.MUSECODE_DEV_URL==='http://127.0.0.1:5173')await win.loadURL(process.env.MUSECODE_DEV_URL);else await win.loadFile(path.join(directory,'../dist/index.html'));
});
app.on('before-quit',event=>{if(!quitting){event.preventDefault();quitting=true;runtime.disconnect().finally(()=>app.quit());}});
app.on('window-all-closed',()=>app.quit());

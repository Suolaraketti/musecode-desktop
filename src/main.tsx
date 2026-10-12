import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ArrowUp, ArrowDownToLine, ArrowLeft, Check, ChevronDown, ChevronRight, Circle, CircleHelp, Code2, Command, Copy, FileCode2, Files, Folder, FolderOpen, GitBranch, GitFork, GitPullRequest, Globe, Layers, ListChecks, Loader2, Maximize2, MessageSquare, Minus, PanelRightClose, PanelRightOpen, Plus, Search, Settings2, ShieldCheck, Sparkles, Square, Terminal, WandSparkles, X, Zap } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Approval, Bridge, Change, FileEntry, Item, Model, Question, Row, Snapshot, SetupState } from './types';
import { demoSnapshot } from './demo';
import { Onboarding } from './Onboarding';
import { Settings } from './Settings';
import { BrandMark as Mark } from './BrandMark';
import './style.css';

const bridge=window.muse;
const basename=(value='')=>value.split(/[\\/]/).filter(Boolean).pop()||'Workspace';
const title=(row:Row)=>row.name||row.title||row.firstUserPrompt?.slice(0,44)||'New conversation';
function Markdown({text}:{text:string}) { return <ReactMarkdown remarkPlugins={[remarkGfm]} components={{a:({href,children})=><a href={href} onClick={e=>{e.preventDefault();if(href)void bridge?.openLink(href);}}>{children}</a>}}>{text}</ReactMarkdown>; }

function App(){
  const [projects,setProjects]=useState<string[]>([]),[project,setProject]=useState('');
  const [rows,setRows]=useState<Row[]>([]),[snapshots,setSnapshots]=useState<Record<string,Snapshot>>({}),[active,setActive]=useState('');
  const [connected,setConnected]=useState(false),[connection,setConnection]=useState<any>(null),[connecting,setConnecting]=useState(false);
  const [models,setModels]=useState<Model[]>([]),[model,setModel]=useState(''),[effort,setEffort]=useState('high');
  const [panel,setPanel]=useState('changes'),[showPanel,setShowPanel]=useState(true),[settings,setSettings]=useState(false),[binary,setBinary]=useState('');
  const [text,setText]=useState(''),[search,setSearch]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false),[demo,setDemo]=useState(false);
  const [theme,setTheme]=useState('dark'),[palette,setPalette]=useState(false),[paletteText,setPaletteText]=useState('');
  const [fileEntries,setFileEntries]=useState<FileEntry[]>([]),[fileDirectory,setFileDirectory]=useState(''),[preview,setPreview]=useState<{name:string;text:string;diff:boolean}|null>(null);
  const [git,setGit]=useState<{files:Change[];branch:string;repository:boolean}>({files:[],branch:'',repository:false});
  const [inventory,setInventory]=useState<any>(null),[events,setEvents]=useState<any[]>([]),[shellText,setShellText]=useState('');
  const [creating,setCreating]=useState(false),[usage,setUsage]=useState<any>(null),[plan,setPlan]=useState<any>(null);
  const [rename,setRename]=useState(false),[renameText,setRenameText]=useState('');
  const [setupState,setSetupState]=useState<SetupState>({phase:'checking',message:'Getting your workspace ready…'});
  const preferences=useRef<any>({}),booted=useRef(false),hydrating=useRef(false),previousPhase=useRef('checking');
  const bottom=useRef<HTMLDivElement>(null),composer=useRef<HTMLTextAreaElement>(null);
  const snapshot=demo?demoSnapshot:snapshots[active]; const items=snapshot?.items||[];
  const current=snapshot?.row||rows.find(r=>r.sessionId===active);
  const running=connected&&(['running','inProgress','busy'].includes(current?.status||'')||items.some(i=>i.status==='inProgress'));
  const effectiveModel=current?.modelId||model;
  const readableModel=models.find(m=>m.modelId===effectiveModel)?.displayLabel||effectiveModel||'Agent default';
  const canShell=connected&&connection?.grantedCapabilities?.includes('userShell');
  const contextLabel=usage?.sessionId===active?(usage.windowTokens?`${Math.round(usage.usedTokens/usage.windowTokens*100)}%`:`${Number(usage.usedTokens).toLocaleString()} tokens`):'—';
  async function attempt<T,>(fn:()=>Promise<T>):Promise<T|undefined>{try{setError('');return await fn();}catch(e){setError((e as Error).message.replace(/^Error invoking remote method '[^']*': Error: /,''));}}
  function putSnapshot(s:Snapshot){setSnapshots(old=>({...old,[s.sessionId]:s}));if(s.row)setRows(old=>[s.row!,...old.filter(r=>r.sessionId!==s.sessionId)]);}
  async function refreshSessions(){if(bridge)await attempt(async()=>{const result=await bridge.listSessions();setRows(result.sessions);});}
  async function refreshGit(root=project){if(bridge&&root)await attempt(async()=>setGit(await bridge.changes(root)));}
  async function refreshFiles(relative='',root=project){if(bridge&&root)await attempt(async()=>{setFileEntries(await bridge.files(root,relative));setFileDirectory(relative);});}
  async function restoreWorkspace(){
    if(!bridge||hydrating.current)return;hydrating.current=true;
    try{
      const result=await bridge.listSessions();setRows(result.sessions);
      const saved=preferences.current.lastSession;
      if(saved&&result.sessions.some((r:Row)=>r.sessionId===saved)){
        try{const row=await bridge.resumeSession(saved);setActive(row.sessionId);if(row.workspaceRoot){setProject(row.workspaceRoot);setProjects(old=>[row.workspaceRoot,...old.filter(p=>p!==row.workspaceRoot)]);}}
        catch{setError('Your previous conversation could not be reopened. It is still in the conversation list.');}
      }
    }catch{setError('Your saved conversations could not be loaded. You can try again or start a new conversation.');}
    finally{hydrating.current=false;}
  }
  function applySetup(state:SetupState,force=false){
    const changed=previousPhase.current!==state.phase;previousPhase.current=state.phase;
    setSetupState(state);setConnected(state.phase==='ready');
    if(state.phase==='ready'){setSettings(false);setDemo(false);if(booted.current&&(changed||force))void restoreWorkspace();}
  }
  useEffect(()=>{
    document.documentElement.dataset.theme=theme;
  },[theme]);
  useEffect(()=>{
    if(!bridge){applySetup({phase:'welcome',message:'Sign in to start making things with Muse.'});return;}
    let mounted=true;
    const unsubscribe=bridge.onEvent(event=>{
      if(event.type==='session')putSnapshot(event);
      if(event.type==='connected'){setConnection(event.info);if(event.warning)setError('Muse needs an update for all features to work correctly.');}
      if(event.type==='setup')applySetup(event);
      if(event.type==='disconnected'){setConnected(false);setBusy(false);}
      if(event.type==='error')setError(event.text);
      if(event.type==='notification'){
        setEvents(old=>[...old.slice(-249),event]);
        if(event.method==='turn/completed')setBusy(false);
        if(event.method==='session/contextUsage')setUsage({sessionId:event.params.sessionId,...event.params});
        if(event.method==='session/todoListChanged')setPlan(event.params);
      }
      if(event.type==='diagnostic')setEvents(old=>[...old.slice(-249),event]);
    });
    void bridge.bootstrap().then(s=>{
      if(!mounted)return;
      preferences.current=s;booted.current=true;setProjects(s.projects);const root=s.lastProject||s.projects[0]||'';setProject(root);setText(s.drafts?.[root]||'');setBinary(s.binary);setTheme(s.theme||'dark');setConnection(s.connection||null);applySetup(s.setup,true);
    }).catch(()=>{if(mounted)applySetup({phase:'error',message:'Your workspace could not be opened. Try again.'});});
    return()=>{mounted=false;unsubscribe();};
  },[]);
  useEffect(()=>{if(!booted.current||!bridge||demo||!project)return;const timer=setTimeout(()=>{void bridge.remember({project,sessionId:active,draft:text}).catch(()=>{});},350);return()=>clearTimeout(timer);},[project,active,text,demo]);
  useEffect(()=>{if(project){void refreshGit();void refreshFiles();}setPreview(null);},[project]);
  useEffect(()=>{if(!connected||!bridge)return;void attempt(async()=>{const m=await bridge.models(active||undefined);setModels(m.models);});},[active,connected]);
  useEffect(()=>{if(!connected||!active||!bridge||panel!=='extensions')return;void attempt(async()=>setInventory(await bridge.inventory(active)));},[panel,active,connected]);
  useEffect(()=>{const el=bottom.current;const scroll=el?.parentElement;if(scroll&&scroll.scrollHeight-scroll.scrollTop-scroll.clientHeight<250)el?.scrollIntoView({behavior:'smooth'});},[items]);
  useEffect(()=>{if(!running&&project)void refreshGit();},[running]);
  useEffect(()=>{
    const handler=(e:KeyboardEvent)=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();setPalette(p=>!p);}if(e.key==='Escape'){setPalette(false);setSettings(false);setPreview(null);}};
    window.addEventListener('keydown',handler);return()=>window.removeEventListener('keydown',handler);
  },[]);
  async function openProject(){if(!bridge){setError('Folder access is available in the MuseCode desktop app.');return;}await attempt(async()=>{const root=await bridge.pickProject();if(root){setProjects(old=>[root,...old.filter(p=>p!==root)]);setProject(root);setActive('');if(connected)setDemo(false);}});}
  async function connect(){if(!bridge)return;setConnecting(true);await attempt(async()=>{await bridge.saveSettings({binary,theme});applySetup(await bridge.connect());});setConnecting(false);}
  async function startSetup(){if(!bridge){setError('Sign-in is available in the MuseCode desktop app.');return;}setDemo(false);applySetup({phase:'connecting',message:'Getting your workspace ready…'});await attempt(async()=>applySetup(await bridge.startSetup()));}
  async function newChat(){setDemo(false);setActive('');setText('');composer.current?.focus();}
  async function selectSession(row:Row){if(!bridge||!connected){void startSetup();return;}await attempt(async()=>{const r=await bridge.resumeSession(row.sessionId);setActive(r.sessionId);if(r.workspaceRoot){setProjects(old=>[r.workspaceRoot,...old.filter(p=>p!==r.workspaceRoot)]);setProject(r.workspaceRoot);}setDemo(false);});}
  async function send(ifBusy='steer'){
    if(!text.trim()||creating)return;if(demo){setError('Exit the interface preview and connect Muse Code to send a real message.');return;}
    if(!connected){void startSetup();return;}if(!project){await openProject();return;}if(!bridge)return;
    setCreating(true);const prompt=text;let id=active;
    await attempt(async()=>{
      if(!id){const r=await bridge.newSession(project,model);id=r.sessionId;setActive(id);putSnapshot({sessionId:id,row:r,items:[],approvals:[],questions:[]});}
      // Keep the composer intact on refusal; clear only after durable intake is acknowledged.
      await bridge.send(id,prompt,effort,ifBusy);setText('');setBusy(true);
    });setCreating(false);
  }
  async function changeModel(value:string){if(!bridge)return;const chosen=active&&!value?models.find(m=>m.isDefault)?.modelId:value;if(active&&connected){if(!chosen)return;const result=await attempt(()=>bridge.setModel(active,chosen));if(!result)return;}setModel(chosen||'');}
  async function action(name:string){if(!bridge||!active||demo)return;
    await attempt(async()=>{if(name==='fork'){const r=await bridge.fork(active);setActive(r.sessionId);await refreshSessions();}if(name==='compact')await bridge.compact(active);if(name==='export')await bridge.exportSession(active);});
  }
  function startPreview(){setDemo(true);setSettings(false);setPalette(false);setError('');}
  const actions=[{name:'New conversation',icon:Plus,run:newChat},{name:'Open project folder',icon:FolderOpen,run:openProject},{name:'Connection settings',icon:Settings2,run:()=>setSettings(true)},{name:'Explore interface preview',icon:WandSparkles,run:startPreview},{name:'Show changes',icon:GitPullRequest,run:()=>{setPanel('changes');setShowPanel(true);}},{name:'Show files',icon:Files,run:()=>{setPanel('files');setShowPanel(true);}}];
  const filtered=rows.filter(r=>(!project||r.workspaceRoot===project)&&title(r).toLowerCase().includes(search.toLowerCase()));
  return <div className="app">
    <header className="titlebar"><div className="brand"><Mark small/><strong>MuseCode</strong><span className="alpha">alpha</span></div><div className="titlebar-center"><span className="title-dot"/>{basename(project||'Your workspace')}</div><div className="window-controls"><button aria-label="Minimize" onClick={()=>void bridge?.window('minimize')}><Minus size={14}/></button><button aria-label="Maximize" onClick={()=>void bridge?.window('maximize')}><Maximize2 size={12}/></button><button aria-label="Close window" onClick={()=>void bridge?.window('close')}><X size={15}/></button></div></header>
    {!demo&&(setupState.phase!=='ready'||!project)?<Onboarding state={setupState} needsProject={setupState.phase==='ready'&&!project} onStart={()=>void startSetup()} onCancel={()=>void attempt(async()=>{await bridge!.cancelSetup();applySetup(await bridge!.setupState());})} onBrowser={()=>void attempt(()=>bridge!.openSignIn())} onProject={()=>void openProject()} onSettings={()=>setSettings(true)} onPreview={startPreview}/>:<div className="workspace">
      <aside className="sidebar"><button className="new-chat" onClick={newChat}><Plus size={17}/>New conversation<span>Ctrl K</span></button>
        <button className="nav-item" onClick={()=>setPalette(true)}><Search size={16}/>Search & commands</button>
        <div className="side-heading"><span>PROJECTS</span><button aria-label="Open project" onClick={openProject}><Plus size={15}/></button></div>
        {!projects.length?<button className="open-project" onClick={openProject}><FolderOpen size={17}/><span>Open your first project</span></button>:projects.map(p=><button key={p} title={p} className={`project-row ${p===project?'selected':''}`} onClick={()=>{setProject(p);setActive('');setDemo(false);}}><Folder size={16}/><span>{basename(p)}</span>{p===project&&<ChevronDown size={14}/>}</button>)}
        <div className="side-heading"><span>CONVERSATIONS</span><span>{filtered.length||''}</span></div>
        <input aria-label="Filter conversations" className="chat-filter" placeholder="Filter conversations…" value={search} onChange={e=>setSearch(e.target.value)}/>
        <div className="conversation-list">{demo&&<button className="conversation selected"><MessageSquare size={15}/><span>A little less friction<small>Interface preview</small></span></button>}{filtered.map(r=><button key={r.sessionId} className={`conversation ${active===r.sessionId&&!demo?'selected':''}`} onClick={()=>selectSession(r)}><MessageSquare size={15}/><span>{title(r)}<small>{r.status==='idle'?'Ready':r.status||'Saved session'}</small></span></button>)}{!filtered.length&&!demo&&<div className="side-empty">A fresh place to think.<br/>Your conversations will live here.</div>}</div>
        <div className="sidebar-footer"><button className="connection-row" onClick={()=>setSettings(true)}><span className={`status-dot ${connected?'online':''}`}/><span>{connected?'Muse Code connected':'Connect Muse Code'}<small>{connected?connection?.serverInfo?.version:'Your agent, your machine'}</small></span><ChevronRight size={14}/></button><div className="footer-actions"><button onClick={()=>setSettings(true)}><Settings2 size={15}/>Settings</button><button aria-label="Help" onClick={()=>void bridge?.openLink('https://dev.meta.ai/docs/muse-code')}><CircleHelp size={16}/></button></div></div>
      </aside>
      <main className="main"><header className="chat-header"><div className="breadcrumbs"><Folder size={14}/><span>{basename(project||'Workspace')}</span><ChevronRight size={12}/><strong>{demo?'Interface preview':current?title(current):'New conversation'}</strong></div><div className="header-actions">{active&&!demo&&<><button title="Rename conversation" onClick={()=>{setRenameText(current?title(current):'');setRename(true);}}><MessageSquare size={15}/></button><button title="Fork conversation" onClick={()=>action('fork')}><GitFork size={16}/></button><button title="Export conversation" onClick={()=>action('export')}><ArrowDownToLine size={16}/></button></>}<button aria-label="Toggle inspector" onClick={()=>setShowPanel(!showPanel)}>{showPanel?<PanelRightClose size={17}/>:<PanelRightOpen size={17}/>}</button></div></header>
        {demo&&<div className="preview-banner"><WandSparkles size={14}/>Interface preview · no model calls or file changes<button onClick={()=>{setDemo(false);setActive('');}}>Exit preview<X size={13}/></button></div>}
        {error&&<div className="error-banner" role="alert"><CircleHelp size={16}/><span>{error}</span><button aria-label="Dismiss error" onClick={()=>setError('')}><X size={15}/></button></div>}
        <div className={`chat-scroll ${!items.length?'empty-scroll':''}`}>
          {!items.length?<div className="welcome"><div className="welcome-eyebrow"><span/>A little space for your next big idea</div><Mark/><h1>What will you make?</h1><p>Bring the idea. Muse handles the code.<br/>A familiar home for everything your agent can do.</p><div className="suggestions">{[
            {icon:WandSparkles,title:'Build something',detail:'From an idea to a working first version',prompt:'Help me build '},
            {icon:Code2,title:'Understand the code',detail:'Find your way around a project',prompt:'Explore this codebase. Explain how it is structured and where I should start.'},
            {icon:Zap,title:'Make it better',detail:'Fix a bug or polish the rough edges',prompt:'Review this project and suggest one meaningful improvement. Explain it before making changes.'}
          ].map(s=><button key={s.title} onClick={()=>{setText(s.prompt);composer.current?.focus();}}><s.icon size={20}/><strong>{s.title}</strong><span>{s.detail}</span><ChevronRight size={14}/></button>)}</div><div className="welcome-hint"><FolderOpen size={14}/>{project?`Working in ${basename(project)}`:'Start by opening a project folder'}<button onClick={openProject}>{project?'Change project':'Open project'}<ChevronRight size={12}/></button></div></div>:
          <div className="messages">{items.filter(i=>!['toolCall','reasoning','subagent','workflowRun','hookRun','userShell'].includes(i.kind)).map(item=><article key={item.itemId} className={`message ${item.kind==='userMessage'?'user':'agent'}`}><div className="message-avatar">{item.kind==='userMessage'?'Y':<Mark small/>}</div><div className="message-body"><div className="message-label">{item.kind==='userMessage'?'You':item.kind==='agentMessage'?'MuseCode':item.kind}<span>{item.status==='inProgress'?'Working…':''}</span></div><div className="prose"><Markdown text={item.text||item.visibleOutput||item.finalSummary||item.label||`Agent event: ${item.kind}`}/></div>{item.kind==='agentMessage'&&<button className="copy-message" title="Copy response" onClick={()=>void attempt(()=>navigator.clipboard.writeText(item.text||''))}><Copy size={12}/>Copy</button>}</div></article>)}
          {items.some(i=>['toolCall','reasoning','subagent'].includes(i.kind))&&<button className="activity-summary" onClick={()=>{setPanel('activity');setShowPanel(true);}}><Layers size={14}/>{items.filter(i=>i.kind==='toolCall').length} tool calls · view agent activity<ChevronRight size={13}/></button>}
          {running&&<div className="working"><Loader2 size={14} className="spin"/>Muse is working<span>You can send a follow-up while it thinks.</span></div>}
          </div>}<div ref={bottom}/>
        </div>
        {(snapshot?.approvals||[]).map(a=><ApprovalCard key={a.approvalId} approval={a} onChoose={choice=>attempt(()=>bridge!.approve(active,a.approvalId,choice))}/>)}
        {(snapshot?.questions||[]).map(q=><QuestionCard key={q.userInputId} prompt={q} onAnswer={answers=>attempt(()=>bridge!.answer(active,q.userInputId,answers))} onDecline={()=>attempt(()=>bridge!.decline(active,q.userInputId))}/>)}
        <div className="composer-area"><div className={`composer ${running?'is-running':''}`}><textarea ref={composer} aria-label="Message MuseCode" placeholder={running?'Add a thought or steer the work…':'Ask Muse to build, fix, or explore…'} value={text} onChange={e=>setText(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.nativeEvent.isComposing){e.preventDefault();void send(e.altKey?'queue':'steer');}}}/><div className="composer-bottom"><div className="composer-options"><button title="Choose project folder" onClick={openProject}><FolderOpen size={17}/></button><span className="divider"/><span className="agent-mode"><ShieldCheck size={13}/>Agent</span><select aria-label="Model" value={effectiveModel||''} disabled={!models.length||demo||creating} onChange={e=>void changeModel(e.target.value)}><option value="">{models.length?'Agent default':readableModel}</option>{models.map(m=><option key={m.modelId} value={m.modelId}>{m.displayLabel}</option>)}</select><select aria-label="Reasoning effort" value={effort} onChange={e=>setEffort(e.target.value)}>{['none','minimal','low','medium','high','xhigh','max','ultra'].map(v=><option key={v} value={v}>{v==='high'?'Think deeper':v}</option>)}</select></div><div className="send-controls">{running&&<button aria-label="Stop agent" className="stop-button" onClick={()=>void attempt(()=>bridge!.cancel(active))}><Square size={13}/></button>}<button className="send-button" aria-label={running?'Send follow-up':'Send message'} disabled={!text.trim()||creating} onClick={()=>void send()}>{creating?<Loader2 size={17} className="spin"/>:<ArrowUp size={19}/>}</button></div></div></div><div className="composer-caption"><span>{demo?'Preview only':connected?'Muse Code’s native permissions and sandbox apply.':'Connect your local Muse Code agent to get started.'}</span><span>Enter to send · Shift Enter for newline</span></div></div>
      </main>
      {showPanel&&<aside className="inspector"><div className="inspector-tabs">{[{id:'changes',icon:GitPullRequest,label:'Changes'},{id:'files',icon:Files,label:'Files'},{id:'activity',icon:Layers,label:'Activity'}].map(t=><button key={t.id} className={panel===t.id?'active':''} onClick={()=>{setPanel(t.id);setPreview(null);}}><t.icon size={14}/>{t.label}{t.id==='changes'&&git.files.length>0&&<span className="count">{git.files.length}</span>}</button>)}</div>
        <div className="inspector-content">
          {preview?<><button className="back-link" onClick={()=>setPreview(null)}><ArrowLeft size={13}/>Back to {panel}</button><div className="file-preview-title"><FileCode2 size={15}/>{basename(preview.name)}</div><div className="code-preview">{preview.text.split('\n').map((line,index)=><div key={index} className={preview.diff?(line.startsWith('+')?'added':line.startsWith('-')?'removed':line.startsWith('@@')?'hunk':''):''}><span className="line-number">{index+1}</span><code>{line||' '}</code></div>)}</div></>:
          panel==='changes'?<><div className="panel-heading"><span>Working tree</span><button title="Refresh changes" onClick={()=>void refreshGit()}><GitBranch size={14}/></button></div>{git.branch&&<div className="branch"><GitBranch size={13}/>{git.branch}</div>}{git.files.length?git.files.map(f=><button className="file-row" key={f.path} onClick={()=>void attempt(async()=>setPreview({name:f.path,text:await bridge!.diff(project,f.path,f.status),diff:true}))}><FileCode2 size={15}/><span>{basename(f.path)}<small>{f.path}</small></span><b className={f.status==='??'?'new-file':''}>{f.status.trim()}</b></button>):<div className="panel-empty"><div className="empty-icon"><GitPullRequest size={25}/></div><strong>{project?(git.repository?'All clear':'No Git repository'):'The work, made visible'}</strong><p>{project?(git.repository?'Changes the agent makes will appear here. Select a file to review its diff.':'Open a Git project to review file changes here.'):'Open a project to see file changes and review exactly what Muse is doing.'}</p><span className="panel-empty-note">{demo?'Preview does not modify files.':'Your files stay on your machine.'}</span></div>}</>:
          panel==='files'?<><div className="panel-heading"><span>{fileDirectory||'Project files'}</span><button title="Refresh files" onClick={()=>void refreshFiles(fileDirectory)}><FolderOpen size={14}/></button></div>{fileDirectory&&<button className="back-link" onClick={()=>void refreshFiles(fileDirectory.split(/[\\/]/).slice(0,-1).join('/'))}><ArrowLeft size={13}/>Parent folder</button>}{fileEntries.map(f=><button className="file-row" key={f.path} onClick={()=>f.directory?void refreshFiles(f.path):void attempt(async()=>setPreview({name:f.path,text:await bridge!.readFile(project,f.path),diff:false}))}>{f.directory?<Folder size={15}/>:<FileCode2 size={15}/>}<span>{f.name}</span>{f.directory&&<ChevronRight size={12}/>}</button>)}{!project&&<div className="panel-empty"><FolderOpen size={26}/><strong>A home for your project</strong><p>Open a folder to browse and preview its files.</p><button className="soft-button" onClick={openProject}>Open project</button></div>}</>:
          panel==='activity'?<><div className="panel-heading"><span>Agent activity</span><span className="live-label"><span className={`status-dot ${running?'online':''}`}/>{running?'Live':'Up to date'}</span></div>{items.filter(i=>['reasoning','toolCall','subagent','workflowRun','hookRun','userShell'].includes(i.kind)).map(i=><details className="activity-item" key={i.itemId}><summary>{i.status==='inProgress'?<Loader2 size={14} className="spin"/>:i.status==='completed'?<Check size={14}/>:<Circle size={14}/>}<span>{i.tool||i.label||i.kind}<small>{i.status}</small></span><ChevronDown size={13}/></summary><pre>{i.text||i.commandText||i.args||i.finalSummary||i.statusLine||JSON.stringify(i,null,2)}</pre>{i.visibleOutput&&<pre>{i.visibleOutput}</pre>}</details>)}{!items.length&&<div className="panel-empty"><Layers size={26}/><strong>Follow the thinking</strong><p>Tool calls, reasoning, and background agents appear as Muse works.</p></div>}</>:
          panel==='extensions'?<><div className="panel-heading"><span>Connected extensions</span><button title="Refresh extensions" onClick={()=>void attempt(async()=>setInventory(await bridge!.inventory(active)))}><Layers size={14}/></button></div>{!inventory?<div className="panel-empty"><Layers size={26}/><strong>Make it your own</strong><p>Connect Muse and start a conversation to inspect installed skills, plugins, hooks, and tasks.</p></div>:Object.entries(inventory).map(([name,data])=><details className="inventory" key={name} open><summary>{name}</summary><pre>{JSON.stringify(data,null,2)}</pre></details>)}</>:
          <><div className="panel-heading"><span>Terminal</span><ShieldCheck size={14}/></div><p className="terminal-help">Commands run through Muse Code’s native shell capability in this session.</p><div className="terminal-output">{items.filter(i=>i.kind==='userShell').map(i=><div key={i.itemId}><code>› {i.commandText}</code><pre>{i.visibleOutput||i.text||i.status}</pre></div>)}</div><form onSubmit={e=>{e.preventDefault();void attempt(async()=>{await bridge!.shell(active,shellText);setShellText('');});}}><input className="terminal-input" aria-label="Terminal command" placeholder={canShell?'Enter a command…':'Connect Muse to use the terminal'} value={shellText} onChange={e=>setShellText(e.target.value)} disabled={!canShell||!active}/><button className="soft-button" disabled={!canShell||!active||!shellText.trim()}>Run command</button></form></>}
        </div>
        <div className="inspector-bottom"><div className="context-meter"><div><span>Session context</span><span>{contextLabel}</span></div><div className="meter-track"><span style={{width:usage?.sessionId===active&&usage.windowTokens?`${Math.min(100,usage.usedTokens/usage.windowTokens*100)}%`:'0%'}}/></div></div>{plan?.sessionId===active&&<details className="plan"><summary><ListChecks size={14}/>Agent plan</summary><pre>{JSON.stringify(plan,null,2)}</pre></details>}<div className="inspector-tools"><button className={panel==='extensions'?'selected':''} onClick={()=>{setPanel('extensions');setPreview(null);}}><Layers size={14}/>Extensions</button><button className={panel==='terminal'?'selected':''} onClick={()=>{setPanel('terminal');setPreview(null);}}><Terminal size={14}/>Terminal</button><button title="Compact context" disabled={!active||demo} onClick={()=>action('compact')}><Zap size={14}/></button></div></div>
      </aside>}
    </div>}
    <footer className="statusbar"><span><span className={`status-dot ${connected?'online':''}`}/>{demo?'Interface preview':connected?'Connected to your local agent':'Local workspace'}</span><span>{git.branch&&<><GitBranch size={12}/>{git.branch}<span className="status-sep">·</span></>}<Globe size={12}/>Open source · built for Muse Code</span></footer>
    {settings&&<Settings state={setupState} theme={theme} binary={binary} connecting={connecting} error={error} onClose={()=>setSettings(false)} onTheme={value=>{setTheme(value);void bridge?.saveSettings({theme:value});}} onBinary={setBinary} onBrowse={()=>void attempt(async()=>{const p=await bridge?.pickBinary();if(p)setBinary(p);})} onReconnect={()=>void connect()} onStart={()=>{setSettings(false);void startSetup();}} onDisconnect={()=>void attempt(async()=>{await bridge!.disconnect();applySetup(await bridge!.setupState());})} onSignOut={()=>void attempt(()=>bridge!.signOut())} onDocs={()=>void bridge?.openLink('https://dev.meta.ai/docs/muse-code')}/>}
    {palette&&<div className="modal-overlay" onMouseDown={e=>{if(e.target===e.currentTarget)setPalette(false);}}><section className="command-modal" role="dialog" aria-modal="true" aria-label="Command palette"><div className="command-input"><Search size={18}/><input autoFocus placeholder="What would you like to do?" value={paletteText} onChange={e=>setPaletteText(e.target.value)}/><kbd>ESC</kbd></div>{actions.filter(a=>a.name.toLowerCase().includes(paletteText.toLowerCase())).map(a=><button key={a.name} onClick={()=>{setPalette(false);setPaletteText('');void a.run();}}><a.icon size={17}/>{a.name}<ChevronRight size={13}/></button>)}<div className="command-footer"><Command size={12}/>A shortcut to your workspace</div></section></div>}
    {rename&&<div className="modal-overlay"><form className="command-modal rename-modal" role="dialog" aria-label="Rename conversation" onSubmit={e=>{e.preventDefault();void attempt(async()=>{await bridge!.rename(active,renameText);setRename(false);await refreshSessions();});}}><h3>Rename conversation</h3><input autoFocus aria-label="Conversation name" value={renameText} onChange={e=>setRenameText(e.target.value)}/><div><button type="button" className="soft-button" onClick={()=>setRename(false)}>Cancel</button><button className="primary-button">Save name</button></div></form></div>}
  </div>;
}
function ApprovalCard({approval,onChoose}:{approval:Approval;onChoose:(choice:string)=>Promise<unknown>}){
  const [submitting,setSubmitting]=useState(false);const p={...approval.requested,...approval.latestUpdate};
  return <section className="approval-card"><div className="approval-title"><ShieldCheck size={17}/><strong>Muse needs your approval</strong></div><p>{p.toolName}</p><pre>{String(p.subject.command||p.subject.path||p.subject.host||p.rawArgs)}</pre><div>{p.availableChoices.map(c=><button key={c.choiceId} className={c.decision==='allow'?'primary-button':'soft-button'} disabled={submitting} onClick={async()=>{setSubmitting(true);await onChoose(c.choiceId);setSubmitting(false);}}>{c.label}</button>)}</div></section>;
}
function QuestionCard({prompt,onAnswer,onDecline}:{prompt:Question;onAnswer:(answers:any[])=>Promise<unknown>;onDecline:()=>Promise<unknown>}){
  const [answers,setAnswers]=useState<Record<string,any>>({}),[sending,setSending]=useState(false);
  const valid=prompt.questions.every(q=>{const a=answers[q.id];return a?.freeText?.trim()||(q.selection.mode==='multiple'?(a?.selectedLabels?.length||0)>=(q.selection.minSelections||1)&&(!q.selection.maxSelections||a.selectedLabels.length<=q.selection.maxSelections):a?.selectedLabel);});
  return <section className="approval-card"><div className="approval-title"><CircleHelp size={17}/><strong>A quick question from Muse</strong></div>{prompt.questions.map(q=><div key={q.id}><p>{q.question}</p><div className="question-options">{q.options.map(o=><button className={answers[q.id]?.selectedLabel===o.label||answers[q.id]?.selectedLabels?.includes(o.label)?'soft-button selected':'soft-button'} key={o.label} onClick={()=>setAnswers(old=>{if(q.selection.mode==='multiple'){const selected=old[q.id]?.selectedLabels||[];return {...old,[q.id]:{selectedLabels:selected.includes(o.label)?selected.filter((s:string)=>s!==o.label):[...selected,o.label]}};}return {...old,[q.id]:{selectedLabel:o.label}};})}>{o.label}</button>)}</div><input aria-label={q.question} placeholder="Or write your answer…" maxLength={500} value={answers[q.id]?.freeText||''} onChange={e=>setAnswers(old=>({...old,[q.id]:{freeText:e.target.value}}))}/></div>)}<div className="question-actions"><button className="soft-button" disabled={sending} onClick={()=>void onDecline()}>Skip</button><button className="primary-button" disabled={!valid||sending} onClick={async()=>{setSending(true);await onAnswer(prompt.questions.map(q=>({questionId:q.id,...answers[q.id]})));setSending(false);}}>Send answer</button></div></section>;
}
createRoot(document.getElementById('root')!).render(<React.StrictMode><App/></React.StrictMode>);

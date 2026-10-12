export type Item = {itemId:string;kind:string;status:string;text?:string;tool?:string;args?:string;visibleOutput?:string;commandText?:string;summary?:string[];label?:string;finalSummary?:string;statusLine?:string;childSessionId?:string;revision:number;[key:string]:unknown};
export type Row = {sessionId:string;name?:string;title?:string;firstUserPrompt?:string;workspaceRoot?:string;modelId?:string;status?:string;activeTurnId?:string|null;updatedAt?:string};
export type Choice = {choiceId:string;label:string;decision:string;scope:string};
export type Approval = {approvalId:string;requested:{subject:Record<string,unknown>;toolName:string;rawArgs:string;availableChoices:Choice[];[key:string]:unknown};latestUpdate?:{subject:Record<string,unknown>;availableChoices:Choice[];[key:string]:unknown}};
export type Question = {userInputId:string;questions:{id:string;question:string;header:string;options:{label:string;description?:string}[];selection:{mode:string;minSelections?:number;maxSelections?:number}}[]};
export type Snapshot = {sessionId:string;row?:Row;items:Item[];approvals:Approval[];questions:Question[]};
export type FileEntry = {name:string;path:string;directory:boolean};
export type Change = {path:string;status:string};
export type Model = {modelId:string;displayLabel:string;providerId:string;description?:string;isDefault?:boolean};
export type SetupState = {phase:'checking'|'welcome'|'preparing'|'connecting'|'waiting'|'ready'|'error';message:string;userCode?:string;verificationUrl?:string;account?:{state:string;label?:string}};
// Renderer only sees this narrow preload API. It cannot import Node or spawn processes.
export type Bridge = Record<string,(...args:any[])=>Promise<any>> & {onEvent:(handler:(event:any)=>void)=>()=>void};
declare global { interface Window { muse?:Bridge } }

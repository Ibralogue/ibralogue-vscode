import * as vscode from "vscode";
import { LanguageClient } from "vscode-languageclient/node";

interface DialogueGraph {
  conversations: ConversationNode[];
  edges: Edge[];
}

interface ConversationNode {
  id: string;
  name: string;
  lines: LinePreview[];
  choices: ChoicePreview[];
  startLine: number;
  endLine: number;
  isDefault: boolean;
  isOrphan: boolean;
  hasJumpOut: boolean;
}

interface LinePreview {
  speaker: string;
  textPreview: string;
  hasImage: boolean;
  hasJump: boolean;
  jumpTarget?: string;
  line: number;
}

interface ChoicePreview {
  text: string;
  target: string;
  line: number;
}

interface Edge {
  from: string;
  to: string;
  type: "choice" | "jump";
  label?: string;
}

export class TreeViewProvider implements vscode.Disposable {
  private panel: vscode.WebviewPanel | undefined;
  private disposables: vscode.Disposable[] = [];
  private updateTimer: ReturnType<typeof setTimeout> | undefined;
  private trackedUri: string | undefined;

  constructor(
    private client: LanguageClient,
    private context: vscode.ExtensionContext,
  ) {}

  show(uri?: vscode.Uri) {
    const target = uri ?? vscode.window.activeTextEditor?.document.uri;
    if (!target) return;

    this.trackedUri = target.toString();

    if (this.panel) {
      this.panel.reveal(vscode.ViewColumn.Beside);
      this.requestUpdate();
      return;
    }

    this.panel = vscode.window.createWebviewPanel(
      "ibralogueTreeView",
      "Dialogue Tree",
      vscode.ViewColumn.Beside,
      { enableScripts: true, retainContextWhenHidden: true },
    );

    this.panel.webview.html = getWebviewHtml(this.panel.webview);

    this.panel.webview.onDidReceiveMessage(
      (msg) => this.onWebviewMessage(msg),
      undefined,
      this.disposables,
    );

    this.panel.onDidDispose(() => {
      this.panel = undefined;
      this.disposeListeners();
    }, undefined, this.disposables);

    this.disposables.push(
      vscode.workspace.onDidChangeTextDocument((e) => {
        if (e.document.uri.toString() === this.trackedUri) {
          this.scheduleUpdate();
        }
      }),
    );

    this.disposables.push(
      vscode.window.onDidChangeTextEditorSelection((e) => {
        if (e.textEditor.document.uri.toString() !== this.trackedUri) return;
        if (!this.panel) return;
        const line = e.selections[0].active.line;
        this.panel.webview.postMessage({ type: "highlightLine", line });
      }),
    );

    this.disposables.push(
      vscode.window.onDidChangeActiveTextEditor((editor) => {
        if (!editor) return;
        if (editor.document.languageId !== "ibralogue") return;
        this.trackedUri = editor.document.uri.toString();
        this.requestUpdate();
      }),
    );
  }

  private async onWebviewMessage(msg: { type: string; line?: number; column?: number; svg?: string }) {
    switch (msg.type) {
      case "ready":
        this.requestUpdate();
        break;
      case "navigateTo":
        await this.navigateTo(msg.line ?? 0, msg.column ?? 0);
        break;
      case "export": {
        if (msg.svg) {
          const doc = await vscode.workspace.openTextDocument({ content: msg.svg, language: "xml" });
          await vscode.window.showTextDocument(doc);
        }
        break;
      }
    }
  }

  private async navigateTo(line: number, column: number) {
    if (!this.trackedUri) return;
    const uri = vscode.Uri.parse(this.trackedUri);
    const doc = await vscode.workspace.openTextDocument(uri);
    const editor = await vscode.window.showTextDocument(doc, vscode.ViewColumn.One);
    const pos = new vscode.Position(line, column);
    editor.selection = new vscode.Selection(pos, pos);
    editor.revealRange(new vscode.Range(pos, pos), vscode.TextEditorRevealType.InCenter);
  }

  private scheduleUpdate() {
    if (this.updateTimer) clearTimeout(this.updateTimer);
    this.updateTimer = setTimeout(() => this.requestUpdate(), 300);
  }

  private async requestUpdate() {
    if (!this.panel || !this.trackedUri) return;
    try {
      const graph: DialogueGraph | null = await this.client.sendRequest("ibralogue/getGraph", { uri: this.trackedUri });
      if (graph && this.panel) {
        this.panel.webview.postMessage({ type: "updateGraph", data: graph });
      }
    } catch {
      // Server may not be ready yet
    }
  }

  private disposeListeners() {
    for (const d of this.disposables) d.dispose();
    this.disposables = [];
    if (this.updateTimer) clearTimeout(this.updateTimer);
  }

  dispose() {
    this.panel?.dispose();
    this.disposeListeners();
  }
}

function getNonce(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let text = "";
  for (let i = 0; i < 32; i++) text += chars.charAt(Math.floor(Math.random() * chars.length));
  return text;
}

function getWebviewHtml(webview: vscode.Webview): string {
  const nonce = getNonce();
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style nonce="${nonce}">
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:100%;height:100%;overflow:hidden;background:var(--vscode-editor-background);color:var(--vscode-editor-foreground);font-family:var(--vscode-font-family);font-size:12px}
#toolbar{display:flex;align-items:center;gap:4px;padding:4px 8px;background:var(--vscode-editorWidget-background);border-bottom:1px solid var(--vscode-editorWidget-border);flex-shrink:0;flex-wrap:wrap}
#toolbar button{padding:3px 8px;background:var(--vscode-button-background);color:var(--vscode-button-foreground);border:none;border-radius:3px;cursor:pointer;font-size:11px;white-space:nowrap}
#toolbar button:hover{opacity:.85}
#toolbar .sep{width:1px;height:18px;background:var(--vscode-editorWidget-border);margin:0 2px}
#search{padding:2px 6px;background:var(--vscode-input-background);color:var(--vscode-input-foreground);border:1px solid var(--vscode-input-border,transparent);border-radius:3px;font-size:11px;width:140px;outline:none}
#search:focus{border-color:var(--vscode-focusBorder)}
#wrapper{flex:1;overflow:hidden;position:relative;cursor:grab}
#wrapper.dragging{cursor:grabbing}
#viewport{position:absolute;transform-origin:0 0}
.node{position:absolute;width:280px;background:var(--vscode-editorWidget-background);border:1px solid var(--vscode-editorWidget-border);border-radius:4px;overflow:hidden;cursor:pointer;box-shadow:0 1px 4px rgba(0,0,0,.2);transition:box-shadow .15s}
.node:hover{box-shadow:0 2px 8px rgba(0,0,0,.3)}
.node.highlighted{box-shadow:0 0 0 2px var(--vscode-focusBorder)!important}
.node.search-match{box-shadow:0 0 0 2px #e8a838!important}
.node.dimmed{opacity:.5}
.node.entry{border-left:3px solid #4A9CD6}
.node.normal{border-left:3px solid #4EC9B0}
.node.jump-out{border-left:3px solid #CE9178}
.node.orphan{border-left:3px solid #888}
.node-hdr{display:flex;align-items:center;padding:6px 8px;background:rgba(128,128,128,.08);border-bottom:1px solid var(--vscode-editorWidget-border);font-weight:600;gap:4px}
.node-name{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.node-badge{font-size:10px;padding:1px 6px;background:var(--vscode-badge-background);color:var(--vscode-badge-foreground);border-radius:8px;white-space:nowrap;font-weight:400}
.node-toggle{background:none;border:none;color:var(--vscode-editor-foreground);cursor:pointer;padding:0 2px;font-size:10px;opacity:.6}
.node-toggle:hover{opacity:1}
.node-body{padding:4px 0}
.node-lines{padding:2px 8px}
.node-choices{padding:2px 8px;border-top:1px solid var(--vscode-editorWidget-border)}
.node-line,.node-choice{padding:2px 0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;line-height:1.6}
.node-line:hover,.node-choice:hover{background:rgba(128,128,128,.1);border-radius:2px}
.line-speaker{color:var(--vscode-textLink-foreground);font-weight:500}
.line-icon{opacity:.5;margin-left:2px}
.node-choice{color:var(--vscode-textLink-foreground)}
#edges{position:absolute;top:0;left:0;overflow:visible;pointer-events:none}
.edge{fill:none;stroke:var(--vscode-textLink-foreground);stroke-width:1.5}
.edge.jump{stroke-dasharray:6 3}
.edge-label{font-size:10px;fill:var(--vscode-editor-foreground);text-anchor:middle;pointer-events:none;opacity:.7}
.edge-hit{fill:none;stroke:transparent;stroke-width:12;cursor:pointer;pointer-events:stroke}
.edge-tooltip{position:absolute;padding:4px 8px;background:var(--vscode-editorWidget-background);border:1px solid var(--vscode-editorWidget-border);border-radius:3px;font-size:11px;pointer-events:none;white-space:nowrap;display:none;z-index:10}
#empty{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:var(--vscode-descriptionForeground);font-size:14px}
body{display:flex;flex-direction:column;height:100vh}
</style>
</head>
<body>
<div id="toolbar">
  <button id="fit" title="Fit to view">Fit</button>
  <button id="zoomIn" title="Zoom in">+</button>
  <button id="zoomOut" title="Zoom out">&minus;</button>
  <div class="sep"></div>
  <button id="toggleDir" title="Toggle layout direction">Vertical</button>
  <div class="sep"></div>
  <button id="collapseAll">Collapse All</button>
  <button id="expandAll">Expand All</button>
  <div class="sep"></div>
  <button id="exportSvg">Export SVG</button>
  <button id="refresh">Refresh</button>
  <div class="sep"></div>
  <input id="search" type="text" placeholder="Search conversations...">
</div>
<div id="wrapper">
  <div id="viewport">
    <svg id="edges"></svg>
  </div>
  <div id="empty">Open a .ibra file to see the dialogue tree</div>
  <div class="edge-tooltip" id="tooltip"></div>
</div>
<script nonce="${nonce}">
(function(){
const vscode=acquireVsCodeApi();
const wrapper=document.getElementById('wrapper');
const viewport=document.getElementById('viewport');
const edgesSvg=document.getElementById('edges');
const emptyEl=document.getElementById('empty');
const tooltip=document.getElementById('tooltip');
const searchInput=document.getElementById('search');

let graph=null;
let positions=new Map();
let zoom=1,panX=0,panY=0;
let dragging=false,dragX=0,dragY=0,panSX=0,panSY=0;
let collapsed=new Set();
let vertical=true;
let highlighted=null;
let searchQ='';

const NODE_W=280,NODE_H_GAP=40,LAYER_GAP=100;
const HDR_H=36,LINE_H=22,PAD=16,SEC_GAP=6;

window.addEventListener('message',e=>{
  const m=e.data;
  if(m.type==='updateGraph'){graph=m.data;render();}
  if(m.type==='highlightLine'){highlightByLine(m.line);}
});

vscode.postMessage({type:'ready'});

function nodeHeight(c){
  if(collapsed.has(c.id))return HDR_H;
  let h=HDR_H+PAD;
  if(c.lines.length)h+=c.lines.length*LINE_H+SEC_GAP;
  if(c.choices.length)h+=c.choices.length*LINE_H+SEC_GAP;
  return Math.max(h,50);
}

function computeLayout(){
  if(!graph||!graph.conversations.length)return;
  const adj=new Map();
  for(const e of graph.edges){
    if(!adj.has(e.from))adj.set(e.from,[]);
    adj.get(e.from).push(e.to);
  }
  const layers=new Map();
  const first=graph.conversations[0];
  if(!first)return;
  layers.set(first.id,0);
  const q=[first.id];
  while(q.length){
    const cur=q.shift();
    const cl=layers.get(cur);
    for(const t of(adj.get(cur)||[])){
      if(!layers.has(t)){layers.set(t,cl+1);q.push(t);}
    }
  }
  let maxL=0;
  for(const v of layers.values())if(v>maxL)maxL=v;
  for(const c of graph.conversations){
    if(!layers.has(c.id))layers.set(c.id,maxL+1);
  }
  const groups=new Map();
  for(const c of graph.conversations){
    const l=layers.get(c.id);
    if(!groups.has(l))groups.set(l,[]);
    groups.get(l).push(c);
  }
  for(const[,cs]of groups)cs.sort((a,b)=>a.startLine-b.startLine);
  positions=new Map();
  const sortedL=[...groups.keys()].sort((a,b)=>a-b);
  if(vertical){
    let y=0;
    for(const l of sortedL){
      const cs=groups.get(l);
      const heights=cs.map(c=>nodeHeight(c));
      const totalW=cs.length*NODE_W+(cs.length-1)*NODE_H_GAP;
      let x=-totalW/2;
      for(let i=0;i<cs.length;i++){
        positions.set(cs[i].id,{x,y,w:NODE_W,h:heights[i]});
        x+=NODE_W+NODE_H_GAP;
      }
      y+=Math.max(...heights)+LAYER_GAP;
    }
  }else{
    let x=0;
    for(const l of sortedL){
      const cs=groups.get(l);
      const heights=cs.map(c=>nodeHeight(c));
      const totalH=heights.reduce((a,b)=>a+b,0)+(cs.length-1)*NODE_H_GAP;
      let y=-totalH/2;
      for(let i=0;i<cs.length;i++){
        positions.set(cs[i].id,{x,y,w:NODE_W,h:heights[i]});
        y+=heights[i]+NODE_H_GAP;
      }
      x+=NODE_W+LAYER_GAP;
    }
  }
}

function render(){
  if(!graph){emptyEl.style.display='flex';return;}
  emptyEl.style.display='none';
  computeLayout();
  renderNodes();
  renderEdges();
  if(highlighted)setHighlight(highlighted);
}

function renderNodes(){
  viewport.querySelectorAll('.node').forEach(n=>n.remove());
  if(!graph)return;
  for(const c of graph.conversations){
    const p=positions.get(c.id);
    if(!p)continue;
    const el=document.createElement('div');
    el.className='node';
    if(c.isDefault||graph.conversations.indexOf(c)===0)el.classList.add('entry');
    else if(c.isOrphan)el.classList.add('orphan');
    else if(c.hasJumpOut)el.classList.add('jump-out');
    else el.classList.add('normal');
    if(c.isOrphan)el.classList.add('dimmed');
    if(searchQ&&c.name.toLowerCase().includes(searchQ))el.classList.add('search-match');
    el.dataset.id=c.id;
    el.style.left=p.x+'px';
    el.style.top=p.y+'px';
    el.style.width=p.w+'px';

    const hdr=document.createElement('div');
    hdr.className='node-hdr';
    const nm=document.createElement('span');
    nm.className='node-name';
    nm.textContent=c.name;
    hdr.appendChild(nm);
    const badge=document.createElement('span');
    badge.className='node-badge';
    badge.textContent=c.lines.length+'L / '+c.choices.length+'C';
    hdr.appendChild(badge);
    const tog=document.createElement('button');
    tog.className='node-toggle';
    tog.textContent=collapsed.has(c.id)?'\\u25B6':'\\u25BC';
    tog.addEventListener('click',ev=>{ev.stopPropagation();toggleCollapse(c.id);});
    hdr.appendChild(tog);
    hdr.addEventListener('click',()=>vscode.postMessage({type:'navigateTo',line:c.startLine,column:0}));
    el.appendChild(hdr);

    if(!collapsed.has(c.id)){
      const body=document.createElement('div');
      body.className='node-body';
      if(c.lines.length){
        const lns=document.createElement('div');
        lns.className='node-lines';
        for(const ln of c.lines){
          const d=document.createElement('div');
          d.className='node-line';
          const sp=document.createElement('span');
          sp.className='line-speaker';
          sp.textContent=ln.speaker+': ';
          d.appendChild(sp);
          d.appendChild(document.createTextNode(ln.textPreview||'...'));
          if(ln.hasImage)d.insertAdjacentHTML('beforeend',' <span class="line-icon">\\uD83D\\uDDBC</span>');
          if(ln.hasJump)d.insertAdjacentHTML('beforeend',' <span class="line-icon">\\u2794</span>');
          d.addEventListener('click',ev=>{ev.stopPropagation();vscode.postMessage({type:'navigateTo',line:ln.line,column:0});});
          lns.appendChild(d);
        }
        body.appendChild(lns);
      }
      if(c.choices.length){
        const chs=document.createElement('div');
        chs.className='node-choices';
        for(const ch of c.choices){
          const d=document.createElement('div');
          d.className='node-choice';
          d.textContent='> '+ch.text+(ch.target?' \\u2192 '+ch.target:'');
          d.addEventListener('click',ev=>{ev.stopPropagation();vscode.postMessage({type:'navigateTo',line:ch.line,column:0});});
          chs.appendChild(d);
        }
        body.appendChild(chs);
      }
      el.appendChild(body);
    }
    viewport.appendChild(el);
  }
}

function renderEdges(){
  while(edgesSvg.firstChild)edgesSvg.removeChild(edgesSvg.firstChild);
  if(!graph)return;
  let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
  for(const[,p]of positions){
    if(p.x<minX)minX=p.x;
    if(p.y<minY)minY=p.y;
    if(p.x+p.w>maxX)maxX=p.x+p.w;
    if(p.y+p.h>maxY)maxY=p.y+p.h;
  }
  const pad=60;
  edgesSvg.setAttribute('width',String(maxX-minX+pad*2));
  edgesSvg.setAttribute('height',String(maxY-minY+pad*2));
  edgesSvg.style.left=(minX-pad)+'px';
  edgesSvg.style.top=(minY-pad)+'px';
  const ox=-(minX-pad),oy=-(minY-pad);

  const defs=document.createElementNS('http://www.w3.org/2000/svg','defs');
  defs.innerHTML='<marker id="ah" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0L10 5L0 10z" fill="var(--vscode-textLink-foreground)"/></marker>';
  edgesSvg.appendChild(defs);

  for(const e of graph.edges){
    const sp=positions.get(e.from);
    const tp=positions.get(e.to);
    if(!sp||!tp)continue;
    let sx,sy,tx,ty;
    if(vertical){
      sx=sp.x+sp.w/2+ox; sy=sp.y+sp.h+oy;
      tx=tp.x+tp.w/2+ox; ty=tp.y+oy;
    }else{
      sx=sp.x+sp.w+ox; sy=sp.y+sp.h/2+oy;
      tx=tp.x+ox; ty=tp.y+tp.h/2+oy;
    }
    const cp=Math.max(40,Math.abs(vertical?ty-sy:tx-sx)*0.4);
    let d;
    if(vertical)d='M'+sx+' '+sy+' C'+sx+' '+(sy+cp)+','+tx+' '+(ty-cp)+','+tx+' '+ty;
    else d='M'+sx+' '+sy+' C'+(sx+cp)+' '+sy+','+(tx-cp)+' '+ty+','+tx+' '+ty;

    const hit=document.createElementNS('http://www.w3.org/2000/svg','path');
    hit.setAttribute('d',d);
    hit.setAttribute('class','edge-hit');
    hit.addEventListener('mouseenter',ev=>{
      tooltip.textContent=e.label||e.type;
      tooltip.style.display='block';
      tooltip.style.left=ev.clientX+10+'px';
      tooltip.style.top=ev.clientY+10+'px';
    });
    hit.addEventListener('mousemove',ev=>{
      tooltip.style.left=ev.clientX+10+'px';
      tooltip.style.top=ev.clientY+10+'px';
    });
    hit.addEventListener('mouseleave',()=>{tooltip.style.display='none';});
    edgesSvg.appendChild(hit);

    const path=document.createElementNS('http://www.w3.org/2000/svg','path');
    path.setAttribute('d',d);
    path.setAttribute('class','edge'+(e.type==='jump'?' jump':''));
    path.setAttribute('marker-end','url(#ah)');
    edgesSvg.appendChild(path);

    if(e.label){
      const mx=(sx+tx)/2,my=(sy+ty)/2;
      const txt=document.createElementNS('http://www.w3.org/2000/svg','text');
      txt.setAttribute('x',String(mx));
      txt.setAttribute('y',String(my-6));
      txt.setAttribute('class','edge-label');
      txt.textContent=e.label.length>20?e.label.substring(0,20)+'...':e.label;
      edgesSvg.appendChild(txt);
    }
  }
}

function setHighlight(name){
  highlighted=name;
  viewport.querySelectorAll('.node').forEach(n=>{
    n.classList.toggle('highlighted',n.dataset.id===name);
  });
}

function highlightByLine(line){
  if(!graph)return;
  let match=null;
  for(const c of graph.conversations){
    if(line>=c.startLine&&line<=c.endLine)match=c.id;
  }
  setHighlight(match);
}

function toggleCollapse(id){
  if(collapsed.has(id))collapsed.delete(id);else collapsed.add(id);
  render();
}

function applyTransform(){
  viewport.style.transform='translate('+panX+'px,'+panY+'px) scale('+zoom+')';
}

wrapper.addEventListener('wheel',e=>{
  e.preventDefault();
  const rect=wrapper.getBoundingClientRect();
  const mx=e.clientX-rect.left;
  const my=e.clientY-rect.top;
  const oldZ=zoom;
  zoom*=e.deltaY<0?1.15:1/1.15;
  zoom=Math.max(.1,Math.min(5,zoom));
  panX=mx-(mx-panX)*(zoom/oldZ);
  panY=my-(my-panY)*(zoom/oldZ);
  applyTransform();
},{passive:false});

wrapper.addEventListener('mousedown',e=>{
  if(e.target!==wrapper&&e.target!==edgesSvg&&!e.target.classList.contains('edge-hit'))return;
  dragging=true;dragX=e.clientX;dragY=e.clientY;panSX=panX;panSY=panY;
  wrapper.classList.add('dragging');
});
window.addEventListener('mousemove',e=>{
  if(!dragging)return;
  panX=panSX+(e.clientX-dragX);
  panY=panSY+(e.clientY-dragY);
  applyTransform();
});
window.addEventListener('mouseup',()=>{
  dragging=false;
  wrapper.classList.remove('dragging');
});

function fitToView(){
  if(!graph||!graph.conversations.length)return;
  let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
  for(const[,p]of positions){
    if(p.x<minX)minX=p.x;
    if(p.y<minY)minY=p.y;
    if(p.x+p.w>maxX)maxX=p.x+p.w;
    if(p.y+p.h>maxY)maxY=p.y+p.h;
  }
  const gw=maxX-minX,gh=maxY-minY;
  const rect=wrapper.getBoundingClientRect();
  const pad=40;
  const sx=(rect.width-pad*2)/gw;
  const sy=(rect.height-pad*2)/gh;
  zoom=Math.min(sx,sy,1.5);
  zoom=Math.max(.1,zoom);
  panX=rect.width/2-((minX+maxX)/2)*zoom;
  panY=rect.height/2-((minY+maxY)/2)*zoom;
  applyTransform();
}

document.getElementById('fit').addEventListener('click',fitToView);
document.getElementById('zoomIn').addEventListener('click',()=>{zoom=Math.min(5,zoom*1.25);applyTransform();});
document.getElementById('zoomOut').addEventListener('click',()=>{zoom=Math.max(.1,zoom/1.25);applyTransform();});
document.getElementById('toggleDir').addEventListener('click',()=>{
  vertical=!vertical;
  document.getElementById('toggleDir').textContent=vertical?'Vertical':'Horizontal';
  render();
  setTimeout(fitToView,20);
});
document.getElementById('collapseAll').addEventListener('click',()=>{
  if(!graph)return;
  for(const c of graph.conversations)collapsed.add(c.id);
  render();
});
document.getElementById('expandAll').addEventListener('click',()=>{
  collapsed.clear();render();
});
document.getElementById('refresh').addEventListener('click',()=>{
  vscode.postMessage({type:'ready'});
});
document.getElementById('exportSvg').addEventListener('click',()=>{
  const nodes=viewport.querySelectorAll('.node');
  let svg='<svg xmlns="http://www.w3.org/2000/svg">';
  svg+=edgesSvg.innerHTML;
  nodes.forEach(n=>{
    svg+='<foreignObject x="'+n.style.left.replace('px','')+'" y="'+n.style.top.replace('px','')+'" width="'+n.style.width.replace('px','')+'" height="'+n.offsetHeight+'">';
    svg+=n.outerHTML;
    svg+='</foreignObject>';
  });
  svg+='</svg>';
  vscode.postMessage({type:'export',svg:svg});
});
searchInput.addEventListener('input',()=>{
  searchQ=searchInput.value.toLowerCase();
  viewport.querySelectorAll('.node').forEach(n=>{
    n.classList.toggle('search-match',searchQ&&n.dataset.id.toLowerCase().includes(searchQ));
  });
});
})();
</script>
</body>
</html>`;
}

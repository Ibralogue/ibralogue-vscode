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
  private webviewReady = false;

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

    const mediaRoot = vscode.Uri.joinPath(this.context.extensionUri, "media");

    this.panel = vscode.window.createWebviewPanel(
      "ibralogueTreeView",
      "Dialogue Tree",
      vscode.ViewColumn.Beside,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [mediaRoot],
      },
    );

    this.panel.webview.html = getWebviewHtml(
      this.panel.webview,
      this.context.extensionUri,
    );

    this.panel.webview.onDidReceiveMessage(
      (msg) => this.onWebviewMessage(msg),
      undefined,
      this.disposables,
    );

    this.panel.onDidDispose(() => {
      this.panel = undefined;
      this.webviewReady = false;
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
        if (!this.panel || !this.webviewReady) return;
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
        this.webviewReady = true;
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
    if (!this.panel || !this.trackedUri || !this.webviewReady) return;
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

function getWebviewHtml(webview: vscode.Webview, extensionUri: vscode.Uri): string {
  const nonce = getNonce();
  const cssUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, "media", "treeView.css"));
  const jsUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, "media", "treeView.js"));

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<link rel="stylesheet" href="${cssUri}">
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
<script nonce="${nonce}" src="${jsUri}"></script>
</body>
</html>`;
}

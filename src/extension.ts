import { LanguageClient } from "vscode-languageclient/node";
import * as vscode from "vscode";
import { createLanguageClient } from "./client/client";
import { TreeViewProvider } from "./views/treeViewProvider";

let client: LanguageClient;
let treeView: TreeViewProvider;

export function activate(context: vscode.ExtensionContext) {
  client = createLanguageClient(context);
  client.start();

  treeView = new TreeViewProvider(client, context);

  context.subscriptions.push(
    vscode.commands.registerCommand("ibralogue.openTreeView", (uri?: vscode.Uri) => {
      treeView.show(uri);
    }),
  );

  context.subscriptions.push(treeView);
}

export function deactivate(): Thenable<void> | undefined {
  return client?.stop();
}

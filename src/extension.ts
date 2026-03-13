import { LanguageClient } from "vscode-languageclient/node";
import * as vscode from "vscode";
import { createLanguageClient } from "./client/client";

let client: LanguageClient;

export function activate(context: vscode.ExtensionContext) {
  client = createLanguageClient(context);
  client.start();
}

export function deactivate(): Thenable<void> | undefined {
  return client?.stop();
}

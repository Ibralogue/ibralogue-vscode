import * as vscode from "vscode";

export function activate(context: vscode.ExtensionContext) {
  console.log("Ibralogue extension activated");
}

export function deactivate(): Thenable<void> | undefined {
  return undefined;
}

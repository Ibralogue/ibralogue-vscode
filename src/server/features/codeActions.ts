import {
  CodeAction,
  CodeActionKind,
  CodeActionParams,
  Diagnostic,
  TextEdit,
  WorkspaceEdit,
} from "vscode-languageserver/node";
import { DialogueTree } from "../parser/ast";

export function getCodeActions(
  params: CodeActionParams,
  ast: DialogueTree,
): CodeAction[] {
  const actions: CodeAction[] = [];
  const uri = params.textDocument.uri;

  for (const diag of params.context.diagnostics) {
    if (diag.source !== "ibralogue") continue;

    switch (diag.code) {
      case "IBR001":
        actions.push(closeSpeakerTag(uri, diag));
        break;
      case "IBR003":
        actions.push(closeFunctionInvocation(uri, diag));
        break;
      case "IBR004":
        actions.push(insertArrowSeparator(uri, diag));
        break;
      case "IBR107":
      case "IBR108":
        actions.push(createConversation(uri, diag, ast));
        break;
      case "IBR110":
        actions.push(renameDuplicate(uri, diag));
        break;
      case "IBR115":
        actions.push(insertEndIf(uri, diag));
        break;
    }
  }

  return actions;
}

function closeSpeakerTag(uri: string, diag: Diagnostic): CodeAction {
  return quickFix("Close speaker tag", uri, diag, [
    TextEdit.insert(diag.range.end, "]"),
  ]);
}

function closeFunctionInvocation(uri: string, diag: Diagnostic): CodeAction {
  return quickFix("Close function invocation", uri, diag, [
    TextEdit.insert(diag.range.end, "}}"),
  ]);
}

function insertArrowSeparator(uri: string, diag: Diagnostic): CodeAction {
  return quickFix("Insert '->' separator", uri, diag, [
    TextEdit.insert(diag.range.end, " -> Target"),
  ]);
}

function createConversation(uri: string, diag: Diagnostic, ast: DialogueTree): CodeAction {
  const name = extractNameFromMessage(diag.message);
  const lastConv = ast.conversations[ast.conversations.length - 1];
  const insertLine = lastConv ? lastConv.fullRange.end.line + 1 : 0;
  const newBlock = `\n{{ConversationName(${name})}}\n[Speaker]\n`;
  return quickFix(`Create conversation '${name}'`, uri, diag, [
    TextEdit.insert({ line: insertLine, character: 0 }, newBlock),
  ]);
}

function renameDuplicate(uri: string, diag: Diagnostic): CodeAction {
  const name = extractNameFromMessage(diag.message);
  return quickFix(`Rename to '${name}2'`, uri, diag, [
    TextEdit.replace(diag.range, name + "2"),
  ]);
}

function insertEndIf(uri: string, diag: Diagnostic): CodeAction {
  const insertLine = diag.range.end.line + 1;
  return quickFix("Insert {{EndIf}}", uri, diag, [
    TextEdit.insert({ line: insertLine, character: 0 }, "{{EndIf}}\n"),
  ]);
}

function quickFix(title: string, uri: string, diag: Diagnostic, edits: TextEdit[]): CodeAction {
  return {
    title,
    kind: CodeActionKind.QuickFix,
    diagnostics: [diag],
    edit: { changes: { [uri]: edits } },
  };
}

function extractNameFromMessage(msg: string): string {
  const match = msg.match(/'([^']+)'/);
  return match ? match[1] : "NewConversation";
}

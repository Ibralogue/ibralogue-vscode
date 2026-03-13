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
    }
  }

  return actions;
}

function closeSpeakerTag(uri: string, diag: Diagnostic): CodeAction {
  const edit: WorkspaceEdit = {
    changes: {
      [uri]: [TextEdit.insert(diag.range.end, "]")],
    },
  };

  return {
    title: "Close speaker tag",
    kind: CodeActionKind.QuickFix,
    diagnostics: [diag],
    edit,
  };
}

function closeFunctionInvocation(uri: string, diag: Diagnostic): CodeAction {
  const edit: WorkspaceEdit = {
    changes: {
      [uri]: [TextEdit.insert(diag.range.end, "}}")],
    },
  };

  return {
    title: "Close function invocation",
    kind: CodeActionKind.QuickFix,
    diagnostics: [diag],
    edit,
  };
}

function insertArrowSeparator(uri: string, diag: Diagnostic): CodeAction {
  const line = diag.range.end.line;
  const endChar = diag.range.end.character;

  const edit: WorkspaceEdit = {
    changes: {
      [uri]: [
        TextEdit.insert({ line, character: endChar }, " -> Target"),
      ],
    },
  };

  return {
    title: "Insert '->' separator",
    kind: CodeActionKind.QuickFix,
    diagnostics: [diag],
    edit,
  };
}

function createConversation(
  uri: string,
  diag: Diagnostic,
  ast: DialogueTree,
): CodeAction {
  const name = extractNameFromMessage(diag.message);
  const lastConv = ast.conversations[ast.conversations.length - 1];
  const insertLine = lastConv ? lastConv.fullRange.end.line + 1 : 0;

  const newBlock = `\n{{ConversationName(${name})}}\n[Speaker]\n`;
  const edit: WorkspaceEdit = {
    changes: {
      [uri]: [TextEdit.insert({ line: insertLine, character: 0 }, newBlock)],
    },
  };

  return {
    title: `Create conversation '${name}'`,
    kind: CodeActionKind.QuickFix,
    diagnostics: [diag],
    edit,
  };
}

function renameDuplicate(uri: string, diag: Diagnostic): CodeAction {
  const name = extractNameFromMessage(diag.message);
  const newName = name + "2";

  const edit: WorkspaceEdit = {
    changes: {
      [uri]: [TextEdit.replace(diag.range, newName)],
    },
  };

  return {
    title: `Rename to '${newName}'`,
    kind: CodeActionKind.QuickFix,
    diagnostics: [diag],
    edit,
  };
}

function extractNameFromMessage(msg: string): string {
  const match = msg.match(/'([^']+)'/);
  return match ? match[1] : "NewConversation";
}

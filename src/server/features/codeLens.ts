import { CodeLens, Command } from "vscode-languageserver/node";
import { DialogueTree } from "../parser/ast";
import { DocumentIndex } from "./documentIndex";

export function getCodeLenses(
  uri: string,
  ast: DialogueTree,
  index: DocumentIndex,
): CodeLens[] {
  const lenses: CodeLens[] = [];

  for (const conv of ast.conversations) {
    if (!conv.commandRange) continue;

    const refCount = countReferences(conv.name, index);
    lenses.push({
      range: conv.commandRange,
      command: {
        title: `${refCount} reference${refCount !== 1 ? "s" : ""}`,
        command: "editor.action.findReferences",
        arguments: [uri, conv.nameRange ?? conv.commandRange],
      },
    });

    const lineCount = conv.dialogueLines.length;
    const choiceCount = conv.choices.length;
    lenses.push({
      range: conv.commandRange,
      command: {
        title: `${lineCount} line${lineCount !== 1 ? "s" : ""}, ${choiceCount} choice${choiceCount !== 1 ? "s" : ""}`,
        command: "",
      },
    });
  }

  return lenses;
}

function countReferences(name: string, index: DocumentIndex): number {
  let count = 0;
  for (const ct of index.choiceTargets) {
    if (ct.target === name) count++;
  }
  for (const jt of index.jumpTargets) {
    if (jt.target === name) count++;
  }
  return count;
}

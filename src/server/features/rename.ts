import {
  Position,
  Range as LspRange,
  TextEdit,
  WorkspaceEdit,
} from "vscode-languageserver/node";
import { DialogueTree, Range } from "../parser/ast";
import { DocumentIndex, findSymbolAt } from "./documentIndex";

export function prepareRename(
  position: Position,
  ast: DialogueTree,
  index: DocumentIndex,
): { range: Range; placeholder: string } | null {
  const sym = findSymbolAt(position, ast, index);
  if (!sym) return null;

  // Reject non-renameable symbols
  if (sym.kind === "commandKeyword" || sym.kind === "function") return null;

  return { range: sym.range, placeholder: sym.name };
}

export function doRename(
  position: Position,
  newName: string,
  uri: string,
  ast: DialogueTree,
  index: DocumentIndex,
): WorkspaceEdit | null {
  const sym = findSymbolAt(position, ast, index);
  if (!sym) return null;
  if (sym.kind === "commandKeyword" || sym.kind === "function") return null;

  const ranges = collectRenameRanges(sym.kind, sym.name, ast, index);
  if (ranges.length === 0) return null;

  return {
    changes: {
      [uri]: ranges.map((r) => TextEdit.replace(r as LspRange, newName)),
    },
  };
}

function collectRenameRanges(
  kind: string,
  name: string,
  ast: DialogueTree,
  index: DocumentIndex,
): Range[] {
  switch (kind) {
    case "conversationDef":
    case "choiceTarget":
    case "jumpTarget":
      return conversationRenameRanges(name, ast, index);

    case "speaker":
      return index.speakers.get(name) ?? [];

    case "variable":
      return index.variables.get(name) ?? [];

    case "metadataKey":
      return index.metadataKeys.get(name) ?? [];

    default:
      return [];
  }
}

function conversationRenameRanges(
  name: string,
  _ast: DialogueTree,
  index: DocumentIndex,
): Range[] {
  const ranges: Range[] = [];

  const def = index.conversationDefs.get(name);
  if (def) ranges.push(def.nameRange);

  for (const ct of index.choiceTargets) {
    if (ct.target === name) ranges.push(ct.range);
  }
  for (const jt of index.jumpTargets) {
    if (jt.target === name) ranges.push(jt.range);
  }

  return ranges;
}

import { Location, Position } from "vscode-languageserver/node";
import { DialogueTree } from "../parser/ast";
import { DocumentIndex, findSymbolAt } from "./documentIndex";

export function getReferences(
  position: Position,
  uri: string,
  ast: DialogueTree,
  index: DocumentIndex,
): Location[] {
  const sym = findSymbolAt(position, ast, index);
  if (!sym) return [];

  switch (sym.kind) {
    case "conversationDef":
    case "choiceTarget":
    case "jumpTarget":
      return conversationReferences(sym.name, uri, index);

    case "speaker": {
      const ranges = index.speakers.get(sym.name) ?? [];
      return ranges.map((r) => ({ uri, range: r }));
    }

    case "variable": {
      const ranges = index.variables.get(sym.name) ?? [];
      return ranges.map((r) => ({ uri, range: r }));
    }

    case "function": {
      const ranges = index.functions.get(sym.name) ?? [];
      return ranges.map((r) => ({ uri, range: r }));
    }

    case "metadataKey": {
      const ranges = index.metadataKeys.get(sym.name) ?? [];
      return ranges.map((r) => ({ uri, range: r }));
    }

    default:
      return [];
  }
}

function conversationReferences(
  name: string,
  uri: string,
  index: DocumentIndex,
): Location[] {
  const locs: Location[] = [];

  const def = index.conversationDefs.get(name);
  if (def) locs.push({ uri, range: def.nameRange });

  for (const ct of index.choiceTargets) {
    if (ct.target === name) locs.push({ uri, range: ct.range });
  }
  for (const jt of index.jumpTargets) {
    if (jt.target === name) locs.push({ uri, range: jt.range });
  }

  return locs;
}

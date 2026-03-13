import { Location, Position } from "vscode-languageserver/node";
import { DialogueTree } from "../parser/ast";
import { DocumentIndex, findSymbolAt } from "./documentIndex";

export function getDefinition(
  position: Position,
  uri: string,
  ast: DialogueTree,
  index: DocumentIndex,
): Location | Location[] | null {
  const sym = findSymbolAt(position, ast, index);
  if (!sym) return null;

  switch (sym.kind) {
    case "choiceTarget":
    case "jumpTarget": {
      const def = index.conversationDefs.get(sym.name);
      if (def) return { uri, range: def.nameRange };
      return null;
    }

    case "conversationDef": {
      // Self-reference for peek
      return { uri, range: sym.range };
    }

    case "variable": {
      // No single definition point; return all usages
      const ranges = index.variables.get(sym.name);
      if (!ranges) return null;
      return ranges.map((r) => ({ uri, range: r }));
    }

    case "speaker": {
      const ranges = index.speakers.get(sym.name);
      if (!ranges) return null;
      return ranges.map((r) => ({ uri, range: r }));
    }

    case "function": {
      const ranges = index.functions.get(sym.name);
      if (!ranges) return null;
      return ranges.map((r) => ({ uri, range: r }));
    }

    default:
      return null;
  }
}

import { DialogueTree, Range, Position } from "../parser/ast";

export interface DocumentIndex {
  speakers: Map<string, Range[]>;
  conversationDefs: Map<string, { nameRange: Range; commandRange?: Range }>;
  variables: Map<string, Range[]>;
  functions: Map<string, Range[]>;
  metadataKeys: Map<string, Range[]>;
  choiceTargets: { target: string; range: Range }[];
  jumpTargets: { target: string; range: Range }[];
  commandKeywords: { name: string; range: Range }[];
}

export type SymbolKind =
  | "speaker"
  | "conversationDef"
  | "choiceTarget"
  | "jumpTarget"
  | "variable"
  | "function"
  | "metadataKey"
  | "commandKeyword";

export interface SymbolInfo {
  kind: SymbolKind;
  name: string;
  range: Range;
}

export function buildIndex(ast: DialogueTree): DocumentIndex {
  const idx: DocumentIndex = {
    speakers: new Map(),
    conversationDefs: new Map(),
    variables: new Map(),
    functions: new Map(),
    metadataKeys: new Map(),
    choiceTargets: [],
    jumpTargets: [],
    commandKeywords: [],
  };

  for (const conv of ast.conversations) {
    if (conv.nameRange && conv.commandRange) {
      idx.conversationDefs.set(conv.name, {
        nameRange: conv.nameRange,
        commandRange: conv.commandRange,
      });

      // Track the "ConversationName" keyword range
      idx.commandKeywords.push({
        name: "ConversationName",
        range: {
          start: { line: conv.commandRange.start.line, character: conv.commandRange.start.character + 2 },
          end: { line: conv.commandRange.start.line, character: conv.commandRange.start.character + 2 + "ConversationName".length },
        },
      });
    }

    for (const dl of conv.dialogueLines) {
      const nameRange = innerSpeakerRange(dl.speakerRange);
      pushMap(idx.speakers, dl.speaker, nameRange);

      if (dl.jump) {
        idx.jumpTargets.push({ target: dl.jump.target, range: dl.jump.targetRange });
        idx.commandKeywords.push({
          name: "Jump",
          range: {
            start: { line: dl.jump.range.start.line, character: dl.jump.range.start.character + 2 },
            end: { line: dl.jump.range.start.line, character: dl.jump.range.start.character + 2 + "Jump".length },
          },
        });
      }

      if (dl.image) {
        idx.commandKeywords.push({
          name: "Image",
          range: {
            start: { line: dl.image.range.start.line, character: dl.image.range.start.character + 2 },
            end: { line: dl.image.range.start.line, character: dl.image.range.start.character + 2 + "Image".length },
          },
        });
      }

      for (const sent of dl.sentences) {
        for (const frag of sent.fragments) {
          if (frag.kind === "function") pushMap(idx.functions, frag.name, frag.nameRange);
          if (frag.kind === "variable") pushMap(idx.variables, frag.name, frag.range);
        }
        if (sent.metadata) {
          for (const m of sent.metadata) pushMap(idx.metadataKeys, m.key, m.keyRange);
        }
      }
    }

    for (const choice of conv.choices) {
      if (choice.target) idx.choiceTargets.push({ target: choice.target, range: choice.targetRange });
      for (const m of choice.metadata) pushMap(idx.metadataKeys, m.key, m.keyRange);
    }
  }

  return idx;
}

export function findSymbolAt(
  pos: Position,
  ast: DialogueTree,
  index: DocumentIndex,
): SymbolInfo | null {
  for (const kw of index.commandKeywords) {
    if (inRange(pos, kw.range)) return { kind: "commandKeyword", name: kw.name, range: kw.range };
  }

  for (const conv of ast.conversations) {
    if (conv.nameRange && inRange(pos, conv.nameRange)) {
      return { kind: "conversationDef", name: conv.name, range: conv.nameRange };
    }
  }

  for (const ct of index.choiceTargets) {
    if (inRange(pos, ct.range)) return { kind: "choiceTarget", name: ct.target, range: ct.range };
  }

  for (const jt of index.jumpTargets) {
    if (inRange(pos, jt.range)) return { kind: "jumpTarget", name: jt.target, range: jt.range };
  }

  for (const [name, ranges] of index.speakers) {
    for (const r of ranges) {
      if (inRange(pos, r)) return { kind: "speaker", name, range: r };
    }
  }

  for (const [name, ranges] of index.variables) {
    for (const r of ranges) {
      if (inRange(pos, r)) return { kind: "variable", name, range: r };
    }
  }

  for (const [name, ranges] of index.functions) {
    for (const r of ranges) {
      if (inRange(pos, r)) return { kind: "function", name, range: r };
    }
  }

  for (const [key, ranges] of index.metadataKeys) {
    for (const r of ranges) {
      if (inRange(pos, r)) return { kind: "metadataKey", name: key, range: r };
    }
  }

  return null;
}

export function inRange(pos: Position, range: Range): boolean {
  if (pos.line < range.start.line || pos.line > range.end.line) return false;
  if (pos.line === range.start.line && pos.character < range.start.character) return false;
  if (pos.line === range.end.line && pos.character >= range.end.character) return false;
  return true;
}

function innerSpeakerRange(r: Range): Range {
  return {
    start: { line: r.start.line, character: r.start.character + 1 },
    end: { line: r.end.line, character: r.end.character - 1 },
  };
}

function pushMap(map: Map<string, Range[]>, key: string, range: Range) {
  const arr = map.get(key);
  if (arr) arr.push(range);
  else map.set(key, [range]);
}

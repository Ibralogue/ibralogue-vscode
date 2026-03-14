import { DialogueTree, Range, Position } from "../parser/ast";
import { ALL_KEYWORD_SET, CONTINUE_TARGET, SILENT_SPEAKER } from "../parser/keywords";

// ── Index Shape ─────────────────────────────────────────────────────

export interface DocumentIndex {
  speakers: Map<string, Range[]>;
  conversationDefs: Map<string, { nameRange: Range; commandRange?: Range }>;
  variables: Map<string, Range[]>;
  functions: Map<string, Range[]>;
  metadataKeys: Map<string, Range[]>;
  choiceTargets: { target: string; range: Range }[];
  jumpTargets: { target: string; range: Range }[];
  commandKeywords: { name: string; range: Range }[];
  /** Ranges of conditional keyword lines (If, ElseIf, Else, EndIf). */
  conditionalKeywords: { name: string; range: Range }[];
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

// ── Builder ─────────────────────────────────────────────────────────

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
    conditionalKeywords: [],
  };

  for (const conv of ast.conversations) {
    indexConversationHeader(conv, idx);
    indexDialogueLines(conv, idx);
    indexChoices(conv, idx);
    indexConditionals(conv, idx);
    indexVariableCommands(conv, idx);
  }

  return idx;
}

function indexConversationHeader(
  conv: DialogueTree["conversations"][number],
  idx: DocumentIndex,
) {
  if (conv.nameRange && conv.commandRange) {
    idx.conversationDefs.set(conv.name, {
      nameRange: conv.nameRange,
      commandRange: conv.commandRange,
    });
    idx.commandKeywords.push({
      name: "ConversationName",
      range: keywordRange(conv.commandRange, "ConversationName"),
    });
  }
}

function indexDialogueLines(
  conv: DialogueTree["conversations"][number],
  idx: DocumentIndex,
) {
  for (const dl of conv.dialogueLines) {
    const nameRange = innerSpeakerRange(dl.speakerRange);
    pushMap(idx.speakers, dl.speaker, nameRange);

    if (dl.jump) {
      idx.jumpTargets.push({ target: dl.jump.target, range: dl.jump.targetRange });
      idx.commandKeywords.push({
        name: "Jump",
        range: keywordRange(dl.jump.range, "Jump"),
      });
    }

    if (dl.image) {
      idx.commandKeywords.push({
        name: "Image",
        range: keywordRange(dl.image.range, "Image"),
      });
    }

    for (const sent of dl.sentences) {
      for (const frag of sent.fragments) {
        if (frag.kind === "function") {
          // Inline built-in invocations are tracked as keywords too
          if (ALL_KEYWORD_SET.has(frag.name)) {
            idx.commandKeywords.push({ name: frag.name, range: frag.nameRange });
          } else {
            pushMap(idx.functions, frag.name, frag.nameRange);
          }
        }
        if (frag.kind === "variable") pushMap(idx.variables, frag.name, frag.range);
      }
      if (sent.metadata) {
        for (const m of sent.metadata) pushMap(idx.metadataKeys, m.key, m.keyRange);
      }
    }
  }
}

function indexChoices(
  conv: DialogueTree["conversations"][number],
  idx: DocumentIndex,
) {
  for (const choice of conv.choices) {
    if (choice.target && choice.target !== CONTINUE_TARGET) {
      idx.choiceTargets.push({ target: choice.target, range: choice.targetRange });
    }
    for (const m of choice.metadata) pushMap(idx.metadataKeys, m.key, m.keyRange);
  }
}

function indexConditionals(
  conv: DialogueTree["conversations"][number],
  idx: DocumentIndex,
) {
  for (const cond of conv.conditionals) {
    for (const branch of cond.branches) {
      idx.conditionalKeywords.push({
        name: branch.keyword,
        range: branch.keywordRange,
      });
      idx.commandKeywords.push({
        name: branch.keyword,
        range: branch.keywordRange,
      });
    }
  }
}

function indexVariableCommands(
  conv: DialogueTree["conversations"][number],
  idx: DocumentIndex,
) {
  for (const set of conv.setCommands) {
    pushMap(idx.variables, set.variableName, set.variableRange);
    idx.commandKeywords.push({
      name: "Set",
      range: keywordRange(set.range, "Set"),
    });
  }
  for (const g of conv.globalDecls) {
    pushMap(idx.variables, g.variableName, g.variableRange);
    idx.commandKeywords.push({
      name: "Global",
      range: keywordRange(g.range, "Global"),
    });
  }
}

// ── Symbol Resolution ───────────────────────────────────────────────

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

// ── Utilities ───────────────────────────────────────────────────────

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

/** Computes the range of the keyword name inside a {{Keyword...}} command. */
function keywordRange(commandRange: Range, name: string): Range {
  return {
    start: { line: commandRange.start.line, character: commandRange.start.character + 2 },
    end: { line: commandRange.start.line, character: commandRange.start.character + 2 + name.length },
  };
}

function pushMap(map: Map<string, Range[]>, key: string, range: Range) {
  const arr = map.get(key);
  if (arr) arr.push(range);
  else map.set(key, [range]);
}

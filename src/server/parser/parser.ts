import {
  Token,
  TokenType,
  DialogueTree,
  Conversation,
  DialogueLine,
  Sentence,
  ChoiceNode,
  MetadataEntry,
  Range,
  SentenceFragment,
  FunctionInvocation,
  VariableReference,
  ConditionalBlock,
  ConditionalBranch,
  SetCommand,
  GlobalDecl,
} from "./ast";
import { CONTINUE_TARGET, SILENT_SPEAKER, DIALOGUE_LINE_COMMANDS } from "./keywords";
import { Diagnostic, DiagnosticSeverity } from "vscode-languageserver/node";

// ── Public API ──────────────────────────────────────────────────────

export interface ParseResult {
  ast: DialogueTree;
  diagnostics: Diagnostic[];
}

export function parse(tokens: Token[]): ParseResult {
  const p = new Parser(tokens);
  p.run();
  return {
    ast: { conversations: p.conversations },
    diagnostics: p.diagnostics,
  };
}

// ── Command helpers ─────────────────────────────────────────────────

export function extractCmdName(value: string): string {
  const i = value.indexOf("(");
  return i === -1 ? value.trim() : value.substring(0, i).trim();
}

export function extractCmdArgs(value: string): string[] {
  const open = value.indexOf("(");
  const close = value.lastIndexOf(")");
  if (open === -1 || close === -1 || close <= open) return [];
  return value
    .substring(open + 1, close)
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export function cmdArgRange(t: Token, argIndex: number): Range {
  const value = t.value;
  const open = value.indexOf("(");
  const close = value.lastIndexOf(")");
  if (open === -1 || close === -1) return t.range;

  const parts = value.substring(open + 1, close).split(",");
  if (argIndex >= parts.length) return t.range;

  let offset = open + 1;
  for (let i = 0; i < argIndex; i++) offset += parts[i].length + 1;

  const raw = parts[argIndex];
  const lead = raw.length - raw.trimStart().length;
  const trimmed = raw.trim();
  const base = t.range.start.character + 2; // past {{

  return {
    start: { line: t.range.start.line, character: base + offset + lead },
    end: { line: t.range.start.line, character: base + offset + lead + trimmed.length },
  };
}

/** Range covering just the keyword name inside a {{Keyword(...)}} command. */
function cmdKeywordRange(t: Token, name: string): Range {
  const base = t.range.start.character + 2;
  return {
    start: { line: t.range.start.line, character: base },
    end: { line: t.range.start.line, character: base + name.length },
  };
}

// ── Fragment builders ───────────────────────────────────────────────

function parseFuncValue(value: string): { name: string; args: string[] } {
  const i = value.indexOf("(");
  if (i === -1) return { name: value.trim(), args: [] };
  const name = value.substring(0, i).trim();
  const close = value.lastIndexOf(")");
  if (close <= i) return { name, args: [] };
  return {
    name,
    args: value
      .substring(i + 1, close)
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0),
  };
}

function toFragment(t: Token): SentenceFragment {
  if (t.type === TokenType.Function) {
    const { name, args } = parseFuncValue(t.value);
    const nameEndOffset = t.value.indexOf("(");
    const nameLen = nameEndOffset !== -1 ? nameEndOffset : t.value.trim().length;
    const nameStart = t.range.start.character + 2;
    return {
      kind: "function",
      name,
      args,
      range: t.range,
      nameRange: {
        start: { line: t.range.start.line, character: nameStart },
        end: { line: t.range.start.line, character: nameStart + nameLen },
      },
    } satisfies FunctionInvocation;
  }

  if (t.type === TokenType.Variable) {
    return {
      kind: "variable",
      name: t.value,
      range: t.range,
      nameRange: {
        start: { line: t.range.start.line, character: t.range.start.character + 1 },
        end: t.range.end,
      },
    } satisfies VariableReference;
  }

  return { kind: "text", value: t.value, range: t.range };
}

// ── Metadata parsing ────────────────────────────────────────────────

export function parseMetadataEntries(
  value: string,
  lineNum: number,
  startChar: number,
): MetadataEntry[] {
  const entries: MetadataEntry[] = [];
  const parts = value.split(/\s+/);
  let searchFrom = 0;

  for (const part of parts) {
    if (part.length === 0) continue;
    const offset = value.indexOf(part, searchFrom);
    const pos = startChar + offset;
    const colonIdx = part.indexOf(":");

    if (colonIdx !== -1) {
      entries.push({
        key: part.substring(0, colonIdx),
        value: part.substring(colonIdx + 1),
        range: {
          start: { line: lineNum, character: pos },
          end: { line: lineNum, character: pos + part.length },
        },
        keyRange: {
          start: { line: lineNum, character: pos },
          end: { line: lineNum, character: pos + colonIdx },
        },
        valueRange: {
          start: { line: lineNum, character: pos + colonIdx + 1 },
          end: { line: lineNum, character: pos + part.length },
        },
        isTag: false,
      });
    } else {
      entries.push({
        key: part,
        value: part,
        range: {
          start: { line: lineNum, character: pos },
          end: { line: lineNum, character: pos + part.length },
        },
        keyRange: {
          start: { line: lineNum, character: pos },
          end: { line: lineNum, character: pos + part.length },
        },
        isTag: true,
      });
    }

    searchFrom = offset + part.length;
  }

  return entries;
}

// ── Choice parsing ──────────────────────────────────────────────────

function parseChoiceValue(t: Token): ChoiceNode | null {
  const value = t.value;
  const valueStart = t.range.start.character + (t.lexeme.length - value.length);
  const line = t.range.start.line;

  const arrowIdx = value.indexOf("->");
  if (arrowIdx === -1) {
    return {
      text: value.trim(),
      target: "",
      range: t.range,
      textRange: { start: { line, character: valueStart }, end: { line, character: valueStart + value.trim().length } },
      targetRange: { start: t.range.end, end: t.range.end },
      arrowRange: { start: t.range.end, end: t.range.end },
      metadata: [],
      isContinue: false,
    };
  }

  const text = value.substring(0, arrowIdx).trimEnd();
  const arrowStart = valueStart + arrowIdx;

  let rest = value.substring(arrowIdx + 2);
  let restStart = valueStart + arrowIdx + 2;
  const trimmedRest = rest.trimStart();
  restStart += rest.length - trimmedRest.length;
  rest = trimmedRest;

  const metaIdx = rest.indexOf("##");
  let target: string;
  let targetEnd: number;
  let metadata: MetadataEntry[] = [];

  if (metaIdx !== -1) {
    target = rest.substring(0, metaIdx).trimEnd();
    targetEnd = restStart + target.length;
    const metaRaw = rest.substring(metaIdx + 2);
    const metaStr = metaRaw.trim();
    const metaCharStart = restStart + metaIdx + 2 + (metaRaw.length - metaRaw.trimStart().length);
    metadata = parseMetadataEntries(metaStr, line, metaCharStart);
  } else {
    target = rest.trimEnd();
    targetEnd = restStart + target.length;
  }

  return {
    text,
    target,
    range: t.range,
    textRange: {
      start: { line, character: valueStart },
      end: { line, character: valueStart + text.length },
    },
    targetRange: {
      start: { line, character: restStart },
      end: { line, character: targetEnd },
    },
    arrowRange: {
      start: { line, character: arrowStart },
      end: { line, character: arrowStart + 2 },
    },
    metadata,
    isContinue: target === CONTINUE_TARGET,
  };
}

function metadataValueStart(t: Token): number {
  const afterHash = t.lexeme.substring(2);
  const trimmed = afterHash.trimStart();
  return t.range.start.character + 2 + (afterHash.length - trimmed.length);
}

// ── Diagnostics helper ──────────────────────────────────────────────

function diag(
  range: Range,
  severity: DiagnosticSeverity,
  code: string,
  message: string,
): Diagnostic {
  return { range, severity, code, source: "ibralogue", message };
}

// ── Parser ──────────────────────────────────────────────────────────

interface PartialConv {
  name: string;
  nameRange?: Range;
  commandRange?: Range;
  startLine: number;
  dialogueLines: DialogueLine[];
  choices: ChoiceNode[];
  conditionals: ConditionalBlock[];
  setCommands: SetCommand[];
  globalDecls: GlobalDecl[];
  isDefault: boolean;
}

interface PartialDL {
  speaker: string;
  speakerRange: Range;
  startLine: number;
  sentences: Sentence[];
  image?: { path: string; range: Range; pathRange: Range };
  jump?: { target: string; range: Range; targetRange: Range };
  isSilent: boolean;
}

interface OpenConditional {
  startRange: Range;
  branches: ConditionalBranch[];
}

class Parser {
  conversations: Conversation[] = [];
  diagnostics: Diagnostic[] = [];

  private tokens: Token[];
  private pos = 0;
  private conv: PartialConv | null = null;
  private dl: PartialDL | null = null;
  private fragments: SentenceFragment[] = [];
  private sentMeta: MetadataEntry[] | undefined;
  private condStack: OpenConditional[] = [];

  constructor(tokens: Token[]) {
    this.tokens = tokens;
  }

  run() {
    for (this.pos = 0; this.pos < this.tokens.length; this.pos++) {
      const t = this.tokens[this.pos];
      switch (t.type) {
        case TokenType.Command:
          this.onCommand(t);
          break;
        case TokenType.Speaker:
          this.onSpeaker(t);
          break;
        case TokenType.Text:
        case TokenType.Function:
        case TokenType.Variable:
          this.onContent(t);
          break;
        case TokenType.Metadata:
          this.onMetadata(t);
          break;
        case TokenType.Choice:
          this.onChoice(t);
          break;
        case TokenType.EndOfLine:
          this.flushSentence();
          break;
        case TokenType.EndOfFile:
          this.finishAll(t);
          break;
      }
    }
  }

  // ── Command dispatch ────────────────────────────────────────────

  private onCommand(t: Token) {
    const name = extractCmdName(t.value);
    const args = extractCmdArgs(t.value);

    switch (name) {
      case "ConversationName":
        return this.handleConversationName(t, args);
      case "If":
        return this.handleIf(t, name, args);
      case "ElseIf":
        return this.handleElseIf(t, name, args);
      case "Else":
        return this.handleElse(t, name);
      case "EndIf":
        return this.handleEndIf(t, name);
      case "Set":
        return this.handleSet(t, args);
      case "Global":
        return this.handleGlobal(t, args);
      case "Image":
        return this.handleImage(t, args);
      case "Jump":
        return this.handleJump(t, args);
      case "Include":
        return this.handleInclude(t, args);
      default:
        return this.handleUnknownOrBuiltin(t, name);
    }
  }

  private handleConversationName(t: Token, args: string[]) {
    this.finishConv(t.range.start.line);
    this.conv = {
      name: args[0] || "Default",
      nameRange: args[0] ? cmdArgRange(t, 0) : undefined,
      commandRange: t.range,
      startLine: t.range.start.line,
      dialogueLines: [],
      choices: [],
      conditionals: [],
      setCommands: [],
      globalDecls: [],
      isDefault: false,
    };
  }

  private handleIf(t: Token, name: string, args: string[]) {
    this.flushSentence();
    this.finishDL(t.range.start.line);
    this.ensureConv(t.range.start.line);
    this.condStack.push({
      startRange: t.range,
      branches: [{
        keyword: "If",
        condition: args[0] || "",
        keywordRange: cmdKeywordRange(t, name),
      }],
    });
  }

  private handleElseIf(t: Token, name: string, args: string[]) {
    this.flushSentence();
    this.finishDL(t.range.start.line);
    if (this.condStack.length === 0) {
      this.diagnostics.push(
        diag(t.range, DiagnosticSeverity.Warning, "IBR113", "{{ElseIf}} without matching {{If}}"),
      );
    } else {
      this.condStack[this.condStack.length - 1].branches.push({
        keyword: "ElseIf",
        condition: args[0] || "",
        keywordRange: cmdKeywordRange(t, name),
      });
    }
  }

  private handleElse(t: Token, name: string) {
    this.flushSentence();
    this.finishDL(t.range.start.line);
    if (this.condStack.length === 0) {
      this.diagnostics.push(
        diag(t.range, DiagnosticSeverity.Warning, "IBR113", "{{Else}} without matching {{If}}"),
      );
    } else {
      this.condStack[this.condStack.length - 1].branches.push({
        keyword: "Else",
        keywordRange: cmdKeywordRange(t, name),
      });
    }
  }

  private handleEndIf(t: Token, name: string) {
    this.flushSentence();
    this.finishDL(t.range.start.line);
    if (this.condStack.length === 0) {
      this.diagnostics.push(
        diag(t.range, DiagnosticSeverity.Warning, "IBR114", "{{EndIf}} without matching {{If}}"),
      );
    } else {
      const block = this.condStack.pop()!;
      this.ensureConv(t.range.start.line);
      this.conv!.conditionals.push({
        branches: block.branches,
        range: {
          start: block.startRange.start,
          end: t.range.end,
        },
      });
    }
  }

  private handleSet(t: Token, args: string[]) {
    this.flushSentence();
    this.finishDL(t.range.start.line);
    this.ensureConv(t.range.start.line);

    if (args.length < 2) {
      this.diagnostics.push(
        diag(t.range, DiagnosticSeverity.Error, "IBR008", "{{Set}} requires two arguments: {{Set($Variable, expression)}}"),
      );
      return;
    }

    let varName = args[0];
    const argRange = cmdArgRange(t, 0);
    let varRange = argRange;

    if (varName.startsWith("$")) {
      varName = varName.substring(1);
      varRange = {
        start: { line: argRange.start.line, character: argRange.start.character + 1 },
        end: argRange.end,
      };
    }

    this.conv!.setCommands.push({
      variableName: varName,
      expression: args.slice(1).join(", "),
      range: t.range,
      variableRange: varRange,
    });
  }

  private handleGlobal(t: Token, args: string[]) {
    this.flushSentence();
    this.finishDL(t.range.start.line);
    this.ensureConv(t.range.start.line);

    if (args.length < 1) {
      this.diagnostics.push(
        diag(t.range, DiagnosticSeverity.Error, "IBR009", "{{Global}} requires at least one argument: {{Global($Variable[, expression])}}"),
      );
      return;
    }

    let varName = args[0];
    const argRange = cmdArgRange(t, 0);
    let varRange = argRange;

    if (varName.startsWith("$")) {
      varName = varName.substring(1);
      varRange = {
        start: { line: argRange.start.line, character: argRange.start.character + 1 },
        end: argRange.end,
      };
    }

    this.conv!.globalDecls.push({
      variableName: varName,
      expression: args.length >= 2 ? args.slice(1).join(", ") : undefined,
      range: t.range,
      variableRange: varRange,
    });
  }

  private handleImage(t: Token, args: string[]) {
    if (this.dl) {
      this.dl.image = { path: args[0] || "", range: t.range, pathRange: cmdArgRange(t, 0) };
    } else {
      this.diagnostics.push(
        diag(t.range, DiagnosticSeverity.Warning, "IBR104", "Unexpected command outside of a dialogue line: Image"),
      );
    }
  }

  private handleJump(t: Token, args: string[]) {
    if (this.dl) {
      if (this.dl.jump) {
        this.diagnostics.push(
          diag(t.range, DiagnosticSeverity.Warning, "IBR103", "Duplicate Jump command; only the last value will be used"),
        );
      }
      this.dl.jump = { target: args[0] || "", range: t.range, targetRange: cmdArgRange(t, 0) };
    } else {
      this.diagnostics.push(
        diag(t.range, DiagnosticSeverity.Warning, "IBR104", "Unexpected command outside of a dialogue line: Jump"),
      );
    }
  }

  private handleInclude(t: Token, args: string[]) {
    if (args.length === 0) {
      this.diagnostics.push(
        diag(t.range, DiagnosticSeverity.Error, "IBR007", "Include directive has no arguments"),
      );
    }
  }

  private handleUnknownOrBuiltin(t: Token, name: string) {
    // Audio, Wait, Speed are valid invocations inside dialogue lines
    if (DIALOGUE_LINE_COMMANDS.has(name)) {
      if (!this.dl) {
        this.diagnostics.push(
          diag(t.range, DiagnosticSeverity.Warning, "IBR104", `Unexpected command outside of a dialogue line: ${name}`),
        );
      }
      return;
    }

    // Truly unknown command
    if (!this.dl) {
      this.diagnostics.push(
        diag(t.range, DiagnosticSeverity.Warning, "IBR104", `Unexpected command outside of a dialogue line: ${name}`),
      );
    }
  }

  // ── Other token handlers ────────────────────────────────────────

  private onSpeaker(t: Token) {
    this.flushSentence();
    this.finishDL(t.range.start.line);
    this.ensureConv(t.range.start.line);
    this.dl = {
      speaker: t.value,
      speakerRange: t.range,
      startLine: t.range.start.line,
      sentences: [],
      isSilent: t.value === SILENT_SPEAKER,
    };
  }

  private onContent(t: Token) {
    if (!this.dl) {
      this.ensureConv(t.range.start.line);
      if (this.conv!.dialogueLines.length === 0 && this.conv!.choices.length === 0) {
        this.diagnostics.push(
          diag(t.range, DiagnosticSeverity.Error, "IBR005", `Expected [Speaker] but found ${t.type}`),
        );
      } else {
        this.diagnostics.push(
          diag(t.range, DiagnosticSeverity.Warning, "IBR105", `Unexpected content outside of a dialogue line: '${t.value.substring(0, 30)}'`),
        );
      }
      return;
    }
    this.fragments.push(toFragment(t));
  }

  private onMetadata(t: Token) {
    if (this.fragments.length > 0) {
      this.sentMeta = parseMetadataEntries(t.value, t.range.start.line, metadataValueStart(t));
    } else if (this.dl && this.dl.sentences.length > 0) {
      const last = this.dl.sentences[this.dl.sentences.length - 1];
      const entries = parseMetadataEntries(t.value, t.range.start.line, metadataValueStart(t));
      last.metadata = last.metadata ? [...last.metadata, ...entries] : entries;
    }
  }

  private onChoice(t: Token) {
    this.flushSentence();
    this.finishDL(t.range.start.line);
    this.ensureConv(t.range.start.line);

    if (this.conv!.dialogueLines.length === 0) {
      this.diagnostics.push(
        diag(t.range, DiagnosticSeverity.Warning, "IBR111", "Choice appears before any dialogue line"),
      );
    }

    const parsed = parseChoiceValue(t);
    if (parsed) this.conv!.choices.push(parsed);
  }

  // ── Flushing / finishing ────────────────────────────────────────

  private flushSentence() {
    if (this.fragments.length === 0) return;
    if (!this.dl) return;

    const first = this.fragments[0];
    const last = this.fragments[this.fragments.length - 1];

    this.dl.sentences.push({
      range: { start: first.range.start, end: last.range.end },
      fragments: this.fragments,
      metadata: this.sentMeta,
    });

    this.fragments = [];
    this.sentMeta = undefined;
  }

  private finishDL(atLine: number) {
    this.flushSentence();
    if (!this.dl || !this.conv) return;

    this.conv.dialogueLines.push({
      speaker: this.dl.speaker,
      speakerRange: this.dl.speakerRange,
      range: {
        start: { line: this.dl.startLine, character: 0 },
        end: { line: Math.max(atLine - 1, this.dl.startLine), character: 0 },
      },
      sentences: this.dl.sentences,
      image: this.dl.image,
      jump: this.dl.jump,
      isSilent: this.dl.isSilent,
    });

    this.dl = null;
  }

  private finishConv(atLine: number) {
    this.flushSentence();
    this.finishDL(atLine);

    // Warn about unclosed conditionals
    while (this.condStack.length > 0) {
      const block = this.condStack.pop()!;
      this.diagnostics.push(
        diag(block.startRange, DiagnosticSeverity.Warning, "IBR115", "Unclosed {{If}} block, expected {{EndIf}}"),
      );
    }

    if (!this.conv) return;

    this.conversations.push({
      name: this.conv.name,
      nameRange: this.conv.nameRange,
      fullRange: {
        start: { line: this.conv.startLine, character: 0 },
        end: { line: Math.max(atLine - 1, this.conv.startLine), character: 0 },
      },
      commandRange: this.conv.commandRange,
      dialogueLines: this.conv.dialogueLines,
      choices: this.conv.choices,
      conditionals: this.conv.conditionals,
      setCommands: this.conv.setCommands,
      globalDecls: this.conv.globalDecls,
      isDefault: this.conv.isDefault,
    });

    this.conv = null;
  }

  private finishAll(t: Token) {
    this.finishConv(t.range.end.line + 1);
  }

  private ensureConv(atLine: number) {
    if (this.conv) return;
    this.conv = {
      name: "Default",
      startLine: atLine,
      dialogueLines: [],
      choices: [],
      conditionals: [],
      setCommands: [],
      globalDecls: [],
      isDefault: true,
    };
  }
}

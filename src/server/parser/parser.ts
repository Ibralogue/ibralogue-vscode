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
} from "./ast";
import { Diagnostic, DiagnosticSeverity } from "vscode-languageserver/node";

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

// ── Helpers ─────────────────────────────────────────────────────────

function extractCmdName(value: string): string {
  const i = value.indexOf("(");
  return i === -1 ? value.trim() : value.substring(0, i).trim();
}

function extractCmdArgs(value: string): string[] {
  const open = value.indexOf("(");
  const close = value.lastIndexOf(")");
  if (open === -1 || close === -1 || close <= open) return [];
  return value
    .substring(open + 1, close)
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function cmdArgRange(t: Token, argIndex: number): Range {
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
  };
}

function metadataValueStart(t: Token): number {
  const afterHash = t.lexeme.substring(2);
  const trimmed = afterHash.trimStart();
  return t.range.start.character + 2 + (afterHash.length - trimmed.length);
}

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
  isDefault: boolean;
}

interface PartialDL {
  speaker: string;
  speakerRange: Range;
  startLine: number;
  sentences: Sentence[];
  image?: { path: string; range: Range; pathRange: Range };
  jump?: { target: string; range: Range; targetRange: Range };
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

  private onCommand(t: Token) {
    const name = extractCmdName(t.value);
    const args = extractCmdArgs(t.value);

    if (name === "ConversationName") {
      this.finishConv(t.range.start.line);
      this.conv = {
        name: args[0] || "Default",
        nameRange: args[0] ? cmdArgRange(t, 0) : undefined,
        commandRange: t.range,
        startLine: t.range.start.line,
        dialogueLines: [],
        choices: [],
        isDefault: false,
      };
      return;
    }

    if (name === "Image") {
      if (this.dl) {
        this.dl.image = { path: args[0] || "", range: t.range, pathRange: cmdArgRange(t, 0) };
      } else {
        this.diagnostics.push(
          diag(t.range, DiagnosticSeverity.Warning, "IBR104", `Unexpected command outside of a dialogue line: ${name}`),
        );
      }
      return;
    }

    if (name === "Jump") {
      if (this.dl) {
        if (this.dl.jump) {
          this.diagnostics.push(
            diag(t.range, DiagnosticSeverity.Warning, "IBR103", "Duplicate Jump command; only the last value will be used"),
          );
        }
        this.dl.jump = { target: args[0] || "", range: t.range, targetRange: cmdArgRange(t, 0) };
      } else {
        this.diagnostics.push(
          diag(t.range, DiagnosticSeverity.Warning, "IBR104", `Unexpected command outside of a dialogue line: ${name}`),
        );
      }
      return;
    }

    if (name === "Include") {
      if (args.length === 0) {
        this.diagnostics.push(
          diag(t.range, DiagnosticSeverity.Error, "IBR007", "Include directive has no arguments"),
        );
      }
      return;
    }

    if (!this.dl) {
      this.diagnostics.push(
        diag(t.range, DiagnosticSeverity.Warning, "IBR104", `Unexpected command outside of a dialogue line: ${name}`),
      );
    }
  }

  private onSpeaker(t: Token) {
    this.flushSentence();
    this.finishDL(t.range.start.line);
    this.ensureConv(t.range.start.line);
    this.dl = {
      speaker: t.value,
      speakerRange: t.range,
      startLine: t.range.start.line,
      sentences: [],
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
    });

    this.dl = null;
  }

  private finishConv(atLine: number) {
    this.flushSentence();
    this.finishDL(atLine);
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
      isDefault: true,
    };
  }
}

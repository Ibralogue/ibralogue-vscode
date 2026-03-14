import { Token, TokenType, DialogueTree, Range } from "./ast";
import { CONTINUE_TARGET } from "./keywords";
import { Diagnostic, DiagnosticSeverity } from "vscode-languageserver/node";

export function computeDiagnostics(
  tokens: Token[],
  ast: DialogueTree,
  text: string,
): Diagnostic[] {
  const out: Diagnostic[] = [];

  checkUnterminatedSpeakers(tokens, out);
  checkUnterminatedFunctions(tokens, out);
  checkMalformedChoices(text, out);
  checkEmptyVariableNames(tokens, out);
  checkEmptyDialogue(ast, out);
  checkDuplicateConversationNames(ast, out);
  checkUndefinedChoiceTargets(ast, out);
  checkUndefinedJumpTargets(ast, out);

  return out;
}

function checkUnterminatedSpeakers(tokens: Token[], out: Diagnostic[]) {
  for (const t of tokens) {
    if (t.type === TokenType.Speaker && !t.lexeme.includes("]")) {
      out.push(
        diag(t.range, DiagnosticSeverity.Error, "IBR001", "Unterminated speaker name, expected ']'"),
      );
    }
  }
}

function checkUnterminatedFunctions(tokens: Token[], out: Diagnostic[]) {
  for (const t of tokens) {
    if (t.type === TokenType.Function && !t.lexeme.endsWith("}}")) {
      out.push(
        diag(t.range, DiagnosticSeverity.Error, "IBR003", "Unterminated function invocation, expected '}}'"),
      );
    }
  }
}

function checkMalformedChoices(text: string, out: Diagnostic[]) {
  const lines = text.split(/\r\n|\r|\n/);
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trimStart();
    const indent = lines[i].length - trimmed.length;
    if (trimmed.startsWith("- ") && !lines[i].includes("->") && !trimmed.startsWith("\\-")) {
      out.push(
        diag(
          { start: { line: i, character: indent }, end: { line: i, character: lines[i].length } },
          DiagnosticSeverity.Error,
          "IBR004",
          "Choice is missing '->' separator",
        ),
      );
    }
  }
}

function checkEmptyVariableNames(tokens: Token[], out: Diagnostic[]) {
  for (const t of tokens) {
    if (t.type !== TokenType.Text) continue;
    for (let i = 0; i < t.value.length; i++) {
      if (t.value[i] === "$" && (i === 0 || t.value[i - 1] !== "\\")) {
        const charPos = t.range.start.character + i;
        out.push(
          diag(
            {
              start: { line: t.range.start.line, character: charPos },
              end: { line: t.range.start.line, character: charPos + 1 },
            },
            DiagnosticSeverity.Warning,
            "IBR101",
            "Empty variable name after '$'",
          ),
        );
      }
    }
  }
}

function checkEmptyDialogue(ast: DialogueTree, out: Diagnostic[]) {
  if (ast.conversations.length === 0) {
    out.push(
      diag(
        { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } },
        DiagnosticSeverity.Error,
        "IBR006",
        "Dialogue has no conversations",
      ),
    );
  }
}

function checkDuplicateConversationNames(ast: DialogueTree, out: Diagnostic[]) {
  const seen = new Set<string>();
  for (const conv of ast.conversations) {
    if (seen.has(conv.name)) {
      const range = conv.nameRange ?? conv.commandRange ?? conv.fullRange;
      out.push(
        diag(range, DiagnosticSeverity.Warning, "IBR110", `Duplicate conversation name '${conv.name}'`),
      );
    } else {
      seen.add(conv.name);
    }
  }
}

function checkUndefinedChoiceTargets(ast: DialogueTree, out: Diagnostic[]) {
  const names = new Set(ast.conversations.map((c) => c.name));
  for (const conv of ast.conversations) {
    for (const choice of conv.choices) {
      if (choice.target && choice.target !== CONTINUE_TARGET && !names.has(choice.target)) {
        out.push(
          diag(
            choice.targetRange,
            DiagnosticSeverity.Warning,
            "IBR107",
            `Conversation '${choice.target}' referenced by choice but not defined`,
          ),
        );
      }
    }
  }
}

function checkUndefinedJumpTargets(ast: DialogueTree, out: Diagnostic[]) {
  const names = new Set(ast.conversations.map((c) => c.name));
  for (const conv of ast.conversations) {
    for (const dl of conv.dialogueLines) {
      if (dl.jump && !names.has(dl.jump.target)) {
        out.push(
          diag(
            dl.jump.targetRange,
            DiagnosticSeverity.Warning,
            "IBR108",
            `Conversation '${dl.jump.target}' referenced by Jump but not defined`,
          ),
        );
      }
    }
  }
}

function diag(
  range: Range,
  severity: DiagnosticSeverity,
  code: string,
  message: string,
): Diagnostic {
  return { range, severity, code, source: "ibralogue", message };
}

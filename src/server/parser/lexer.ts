import { Token, TokenType } from "./ast";

export function tokenize(text: string): Token[] {
  const lines = text.split(/\r\n|\r|\n/);
  const tokens: Token[] = [];

  for (let lineNum = 0; lineNum < lines.length; lineNum++) {
    tokenizeLine(lines[lineNum], lineNum, tokens);
    tokens.push(tok(TokenType.EndOfLine, "", "", lineNum, lines[lineNum].length, lineNum, lines[lineNum].length));
  }

  const last = lines.length > 0 ? lines.length - 1 : 0;
  const lastCol = lines.length > 0 ? lines[last].length : 0;
  tokens.push(tok(TokenType.EndOfFile, "", "", last, lastCol, last, lastCol));

  return tokens;
}

// Disambiguation rules are order-dependent.
function tokenizeLine(line: string, lineNum: number, out: Token[]): void {
  const trimmed = line.trimStart();
  const indent = line.length - trimmed.length;

  if (trimmed.length === 0) return;

  // Escaped line start: \# \[ \- \{{
  if (trimmed[0] === "\\") {
    const after = trimmed.substring(1);
    if (
      after.startsWith("{{") ||
      after.startsWith("#") ||
      after.startsWith("[") ||
      after.startsWith("-")
    ) {
      tokenizeTextLine(line, lineNum, out);
      return;
    }
  }

  if (trimmed.startsWith("##")) {
    const value = trimmed.substring(2).trim();
    out.push(tok(TokenType.Metadata, value, trimmed, lineNum, indent, lineNum, line.length));
    return;
  }

  if (trimmed[0] === "#") {
    const value = trimmed.substring(1).trim();
    out.push(tok(TokenType.Comment, value, trimmed, lineNum, indent, lineNum, line.length));
    return;
  }

  if (trimmed[0] === "[") {
    tokenizeSpeaker(line, lineNum, indent, trimmed, out);
    return;
  }

  if (trimmed[0] === "-" && line.includes("->")) {
    tokenizeChoice(line, lineNum, indent, trimmed, out);
    return;
  }

  if (trimmed.startsWith("{{") && isCommandLine(trimmed)) {
    tokenizeCommand(line, lineNum, indent, trimmed, out);
    return;
  }

  tokenizeTextLine(line, lineNum, out);
}

// {{Name(arg)}} with only trailing whitespace is a command.
// {{Name}} (no parens) is NOT a command.
function isCommandLine(trimmed: string): boolean {
  let i = 2;

  while (i < trimmed.length && trimmed[i] !== "(" && trimmed[i] !== "}") i++;
  if (i >= trimmed.length || trimmed[i] !== "(") return false;

  i++;
  while (i < trimmed.length && trimmed[i] !== ")") i++;
  if (i >= trimmed.length) return false;

  i++;
  if (i + 1 >= trimmed.length || trimmed[i] !== "}" || trimmed[i + 1] !== "}") return false;
  i += 2;

  while (i < trimmed.length && trimmed[i] === " ") i++;
  return i === trimmed.length;
}

function tokenizeSpeaker(
  line: string,
  lineNum: number,
  indent: number,
  trimmed: string,
  out: Token[],
): void {
  const close = trimmed.indexOf("]", 1);
  if (close === -1) {
    out.push(tok(TokenType.Speaker, trimmed.substring(1), trimmed, lineNum, indent, lineNum, line.length));
  } else {
    const name = trimmed.substring(1, close);
    out.push(tok(TokenType.Speaker, name, trimmed.substring(0, close + 1), lineNum, indent, lineNum, indent + close + 1));
  }
}

function tokenizeChoice(
  line: string,
  lineNum: number,
  indent: number,
  trimmed: string,
  out: Token[],
): void {
  let valueStart = 1;
  if (trimmed.length > 1 && trimmed[1] === " ") valueStart = 2;
  const value = trimmed.substring(valueStart);
  out.push(tok(TokenType.Choice, value, trimmed, lineNum, indent, lineNum, line.length));
}

function tokenizeCommand(
  line: string,
  lineNum: number,
  indent: number,
  trimmed: string,
  out: Token[],
): void {
  const start = trimmed.indexOf("{{");
  const end = trimmed.lastIndexOf("}}");
  const value = trimmed.substring(start + 2, end);
  out.push(
    tok(
      TokenType.Command,
      value,
      trimmed.substring(start, end + 2),
      lineNum,
      indent + start,
      lineNum,
      indent + end + 2,
    ),
  );
}

// Inline tokenization precedence:
// 1. \ + escapable  →  skip (literal text)
// 2. ##             →  trailing metadata
// 3. {{…}}          →  inline function
// 4. $[a-zA-Z0-9]  →  variable
// 5. anything else  →  plain text
function tokenizeTextLine(line: string, lineNum: number, out: Token[]): void {
  let i = 0;
  let textStart = 0;

  while (i < line.length) {
    if (line[i] === "\\") {
      const rest = line.substring(i + 1);
      if (rest.startsWith("{{") || rest.startsWith("##")) {
        i += 3;
        continue;
      }
      if (rest.startsWith("$") || rest.startsWith("\\")) {
        i += 2;
        continue;
      }
      i++;
      continue;
    }

    if (line[i] === "#" && i + 1 < line.length && line[i + 1] === "#") {
      flushText(line, lineNum, textStart, i, out);
      const value = line.substring(i + 2).trim();
      out.push(tok(TokenType.Metadata, value, line.substring(i), lineNum, i, lineNum, line.length));
      return;
    }

    if (line[i] === "{" && i + 1 < line.length && line[i + 1] === "{") {
      flushText(line, lineNum, textStart, i, out);
      let j = i + 2;
      while (j + 1 < line.length && !(line[j] === "}" && line[j + 1] === "}")) j++;

      if (j + 1 < line.length) {
        const content = line.substring(i + 2, j);
        out.push(tok(TokenType.Function, content, line.substring(i, j + 2), lineNum, i, lineNum, j + 2));
        i = j + 2;
      } else {
        const content = line.substring(i + 2);
        out.push(tok(TokenType.Function, content, line.substring(i), lineNum, i, lineNum, line.length));
        return;
      }
      textStart = i;
      continue;
    }

    if (line[i] === "$" && i + 1 < line.length && /[a-zA-Z0-9]/.test(line[i + 1])) {
      flushText(line, lineNum, textStart, i, out);
      let j = i + 1;
      while (j < line.length && /[a-zA-Z0-9]/.test(line[j])) j++;
      const name = line.substring(i + 1, j);
      out.push(tok(TokenType.Variable, name, line.substring(i, j), lineNum, i, lineNum, j));
      i = j;
      textStart = i;
      continue;
    }

    i++;
  }

  flushText(line, lineNum, textStart, i, out);
}

function flushText(line: string, lineNum: number, start: number, end: number, out: Token[]): void {
  if (end <= start) return;
  const text = line.substring(start, end);
  if (text.length === 0) return;
  out.push(tok(TokenType.Text, text, text, lineNum, start, lineNum, end));
}

function tok(
  type: TokenType,
  value: string,
  lexeme: string,
  startLine: number,
  startChar: number,
  endLine: number,
  endChar: number,
): Token {
  return {
    type,
    value,
    lexeme,
    range: {
      start: { line: startLine, character: startChar },
      end: { line: endLine, character: endChar },
    },
  };
}

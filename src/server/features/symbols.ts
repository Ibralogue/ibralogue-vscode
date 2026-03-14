import { DocumentSymbol, SymbolKind, Range } from "vscode-languageserver/node";
import { DialogueTree, Conversation, DialogueLine, Sentence, ChoiceNode, Range as AstRange } from "../parser/ast";

export function getDocumentSymbols(ast: DialogueTree): DocumentSymbol[] {
  return ast.conversations
    .map(buildConversationSymbol)
    .filter((s): s is DocumentSymbol => s !== null);
}

function buildConversationSymbol(conv: Conversation): DocumentSymbol | null {
  const range = conv.fullRange;
  const selectionRange = clamp(conv.nameRange ?? range, range);
  const children: DocumentSymbol[] = [];

  for (const dl of conv.dialogueLines) {
    const sym = buildDialogueLineSymbol(dl, range);
    if (sym) children.push(sym);
  }

  for (const choice of conv.choices) {
    children.push(buildChoiceSymbol(choice, range));
  }

  for (const cond of conv.conditionals) {
    const condRange = enclose(cond.range, range);
    const keywords = cond.branches.map((b) => b.keyword).join("/");
    children.push({
      name: `{{${keywords}}}`,
      kind: SymbolKind.Boolean,
      range: condRange,
      selectionRange: clamp(cond.branches[0].keywordRange, condRange),
    });
  }

  for (const set of conv.setCommands) {
    const sr = enclose(set.range, range);
    children.push({
      name: `{{Set($${set.variableName})}}`,
      kind: SymbolKind.Variable,
      range: sr,
      selectionRange: clamp(set.variableRange, sr),
    });
  }

  for (const g of conv.globalDecls) {
    const gr = enclose(g.range, range);
    children.push({
      name: `{{Global($${g.variableName})}}`,
      kind: SymbolKind.Variable,
      range: gr,
      selectionRange: clamp(g.variableRange, gr),
    });
  }

  return {
    name: `Conversation "${conv.name}"`,
    kind: SymbolKind.Namespace,
    range,
    selectionRange,
    children,
  };
}

function buildDialogueLineSymbol(dl: DialogueLine, parentRange: AstRange): DocumentSymbol | null {
  const range = enclose(dl.range, parentRange);
  const selectionRange = clamp(dl.speakerRange, range);
  const children: DocumentSymbol[] = [];

  for (const sent of dl.sentences) {
    for (const sym of buildSentenceSymbols(sent, range)) {
      children.push(sym);
    }
  }

  if (dl.image) {
    const ir = enclose(dl.image.range, range);
    children.push({
      name: `{{Image(${dl.image.path})}}`,
      kind: SymbolKind.File,
      range: ir,
      selectionRange: clamp(dl.image.pathRange, ir),
    });
  }

  if (dl.jump) {
    const jr = enclose(dl.jump.range, range);
    children.push({
      name: `{{Jump(${dl.jump.target})}}`,
      kind: SymbolKind.Function,
      range: jr,
      selectionRange: clamp(dl.jump.targetRange, jr),
    });
  }

  return {
    name: `[${dl.speaker}]`,
    kind: SymbolKind.String,
    range,
    selectionRange,
    children,
  };
}

function buildSentenceSymbols(sent: Sentence, parentRange: AstRange): DocumentSymbol[] {
  const symbols: DocumentSymbol[] = [];
  const sentRange = enclose(sent.range, parentRange);

  const textParts: string[] = [];
  for (const frag of sent.fragments) {
    if (frag.kind === "text") textParts.push(frag.value);
    else if (frag.kind === "function") textParts.push(`{{${frag.name}}}`);
    else if (frag.kind === "variable") textParts.push(`$${frag.name}`);
    else textParts.push(frag.value);
  }

  const preview = textParts.join("").substring(0, 60);
  if (preview.trim().length > 0) {
    symbols.push({
      name: preview,
      kind: SymbolKind.String,
      range: sentRange,
      selectionRange: sentRange,
    });
  }

  for (const frag of sent.fragments) {
    if (frag.kind === "function") {
      const fr = enclose(frag.range, sentRange);
      symbols.push({
        name: `{{${frag.name}}}`,
        kind: SymbolKind.Function,
        range: fr,
        selectionRange: clamp(frag.nameRange, fr),
      });
    }
    if (frag.kind === "variable") {
      const vr = enclose(frag.range, sentRange);
      symbols.push({
        name: `$${frag.name}`,
        kind: SymbolKind.Variable,
        range: vr,
        selectionRange: clamp(frag.nameRange, vr),
      });
    }
  }

  if (sent.metadata) {
    for (const m of sent.metadata) {
      const mr = enclose(m.range, sentRange);
      symbols.push({
        name: m.isTag ? m.key : `${m.key}:${m.value}`,
        kind: SymbolKind.Property,
        range: mr,
        selectionRange: clamp(m.keyRange, mr),
      });
    }
  }

  return symbols;
}

function buildChoiceSymbol(choice: ChoiceNode, parentRange: AstRange): DocumentSymbol {
  const range = enclose(choice.range, parentRange);
  const label = choice.target
    ? `"${choice.text}" -> ${choice.target}`
    : `"${choice.text}"`;

  return {
    name: `Choice: ${label}`,
    kind: SymbolKind.Event,
    range,
    selectionRange: clamp(choice.textRange, range),
  };
}

function posBefore(a: AstRange["start"], b: AstRange["start"]): boolean {
  return a.line < b.line || (a.line === b.line && a.character <= b.character);
}

function clamp(inner: AstRange, outer: AstRange): Range {
  const start = posBefore(outer.start, inner.start) ? inner.start : outer.start;
  const end = posBefore(inner.end, outer.end) ? inner.end : outer.end;
  const safeEnd = posBefore(start, end) ? end : start;
  return { start, end: safeEnd };
}

function enclose(child: AstRange, parent: AstRange): Range {
  const start = posBefore(parent.start, child.start) ? child.start : parent.start;
  const end = posBefore(child.end, parent.end) ? child.end : parent.end;
  const safeEnd = posBefore(start, end) ? end : start;
  return { start, end: safeEnd };
}

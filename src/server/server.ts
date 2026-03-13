import {
  createConnection,
  TextDocuments,
  ProposedFeatures,
  InitializeParams,
  InitializeResult,
  TextDocumentSyncKind,
} from "vscode-languageserver/node";
import { TextDocument } from "vscode-languageserver-textdocument";
import { Token, DialogueTree } from "./parser/ast";
import { tokenize } from "./parser/lexer";
import { parse } from "./parser/parser";
import { computeDiagnostics } from "./parser/diagnostics";
import { DocumentIndex, buildIndex } from "./features/documentIndex";
import { getCompletions } from "./features/completion";
import { getHover } from "./features/hover";
import { getDefinition } from "./features/definition";
import { getReferences } from "./features/references";
import { prepareRename, doRename } from "./features/rename";

const connection = createConnection(ProposedFeatures.all);
const documents = new TextDocuments(TextDocument);

interface DocumentState {
  tokens: Token[];
  ast: DialogueTree;
  index: DocumentIndex;
}

const documentStates = new Map<string, DocumentState>();

connection.onInitialize((_params: InitializeParams): InitializeResult => {
  return {
    capabilities: {
      textDocumentSync: TextDocumentSyncKind.Incremental,
      completionProvider: {
        triggerCharacters: ["[", "{", "$", "#", "-", "(", ",", ":"],
      },
      hoverProvider: true,
      definitionProvider: true,
      referencesProvider: true,
      renameProvider: { prepareProvider: true },
    },
  };
});

documents.onDidChangeContent((change) => {
  const text = change.document.getText();
  const tokens = tokenize(text);
  const { ast, diagnostics: parseDiags } = parse(tokens);
  const analyzeDiags = computeDiagnostics(tokens, ast, text);
  const index = buildIndex(ast);

  documentStates.set(change.document.uri, { tokens, ast, index });

  connection.sendDiagnostics({
    uri: change.document.uri,
    diagnostics: [...parseDiags, ...analyzeDiags],
  });
});

documents.onDidClose((event) => {
  documentStates.delete(event.document.uri);
  connection.sendDiagnostics({ uri: event.document.uri, diagnostics: [] });
});

connection.onCompletion((params) => {
  const doc = documents.get(params.textDocument.uri);
  const state = documentStates.get(params.textDocument.uri);
  if (!doc || !state) return [];

  const lineText = doc.getText({
    start: { line: params.position.line, character: 0 },
    end: { line: params.position.line + 1, character: 0 },
  });

  return getCompletions(lineText, params.position, state.ast, state.index);
});

connection.onHover((params) => {
  const state = documentStates.get(params.textDocument.uri);
  if (!state) return null;
  return getHover(params.position, state.ast, state.index);
});

connection.onDefinition((params) => {
  const state = documentStates.get(params.textDocument.uri);
  if (!state) return null;
  return getDefinition(params.position, params.textDocument.uri, state.ast, state.index);
});

connection.onReferences((params) => {
  const state = documentStates.get(params.textDocument.uri);
  if (!state) return [];
  return getReferences(params.position, params.textDocument.uri, state.ast, state.index);
});

connection.onPrepareRename((params) => {
  const state = documentStates.get(params.textDocument.uri);
  if (!state) return null;
  return prepareRename(params.position, state.ast, state.index);
});

connection.onRenameRequest((params) => {
  const state = documentStates.get(params.textDocument.uri);
  if (!state) return null;
  return doRename(params.position, params.newName, params.textDocument.uri, state.ast, state.index);
});

documents.listen(connection);
connection.listen();

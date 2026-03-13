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

const connection = createConnection(ProposedFeatures.all);
const documents = new TextDocuments(TextDocument);

interface DocumentState {
  tokens: Token[];
  ast: DialogueTree;
}

const documentStates = new Map<string, DocumentState>();

connection.onInitialize((_params: InitializeParams): InitializeResult => {
  return {
    capabilities: {
      textDocumentSync: TextDocumentSyncKind.Incremental,
    },
  };
});

documents.onDidChangeContent((change) => {
  const text = change.document.getText();
  const tokens = tokenize(text);
  const { ast, diagnostics: parseDiags } = parse(tokens);
  const analyzeDiags = computeDiagnostics(tokens, ast, text);

  documentStates.set(change.document.uri, { tokens, ast });

  connection.sendDiagnostics({
    uri: change.document.uri,
    diagnostics: [...parseDiags, ...analyzeDiags],
  });
});

documents.onDidClose((event) => {
  documentStates.delete(event.document.uri);
  connection.sendDiagnostics({ uri: event.document.uri, diagnostics: [] });
});

documents.listen(connection);
connection.listen();

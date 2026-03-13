import { tokenize } from "../src/server/parser/lexer";
import { parse } from "../src/server/parser/parser";
import { computeDiagnostics } from "../src/server/parser/diagnostics";
import { buildIndex, DocumentIndex } from "../src/server/features/documentIndex";
import { Token, DialogueTree } from "../src/server/parser/ast";
import { Diagnostic } from "vscode-languageserver/node";

export function quickTokenize(text: string): Token[] {
  return tokenize(text);
}

export function quickParse(text: string) {
  const tokens = tokenize(text);
  const result = parse(tokens);
  return { tokens, ...result };
}

export function quickAll(text: string): {
  tokens: Token[];
  ast: DialogueTree;
  diagnostics: Diagnostic[];
  index: DocumentIndex;
} {
  const tokens = tokenize(text);
  const { ast, diagnostics: parseDiags } = parse(tokens);
  const analyzeDiags = computeDiagnostics(tokens, ast, text);
  const index = buildIndex(ast);
  return { tokens, ast, diagnostics: [...parseDiags, ...analyzeDiags], index };
}

export function diagCodes(text: string): string[] {
  const { diagnostics } = quickAll(text);
  return diagnostics.map((d) => String(d.code)).sort();
}

export function tokTypes(text: string): string[] {
  return quickTokenize(text)
    .filter((t) => t.type !== "EndOfLine" && t.type !== "EndOfFile")
    .map((t) => t.type);
}

export function tokValues(text: string): string[] {
  return quickTokenize(text)
    .filter((t) => t.type !== "EndOfLine" && t.type !== "EndOfFile")
    .map((t) => t.value);
}

export const FIXTURE = `# This is a comment
{{ConversationName(TestConversation)}}
[NPC]
{{Image(Sprites/NPC)}}
Hello, $PLAYERNAME.
This is a second sentence. ## mood:happy greeting
Today is {{GetDay}}.
You received {{GiveItem($REWARD, $AMOUNT)}} items.
\\$100 is the price.
Use \\{{curly braces}} for templates.
See section \\## for details.
Path is C:\\\\Users\\\\NPC\\\\Documents.
<color=red>Warning!</color> <b>Bold text</b>.
{{Jump(SecondConversation)}}

{{ConversationName(SecondConversation)}}
[$PLAYERNAME]
Hello.
[NPC]
Goodbye.
- Accept -> AcceptQuest ## quest:main important
- Decline -> DeclineQuest ## quest:side
- Ask more -> TestConversation

{{ConversationName(AcceptQuest)}}
[NPC]
Great!

{{ConversationName(DeclineQuest)}}
[NPC]
Maybe next time.

# Orphan conversation (unreferenced)
{{ConversationName(HiddenDialogue)}}
[NPC]
Secret text.`;

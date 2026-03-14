// ── Primitives ──────────────────────────────────────────────────────

export interface Position {
  line: number;
  character: number;
}

export interface Range {
  start: Position;
  end: Position;
}

// ── Tokens ──────────────────────────────────────────────────────────

export enum TokenType {
  Speaker = "Speaker",
  Text = "Text",
  Function = "Function",
  Command = "Command",
  Choice = "Choice",
  Comment = "Comment",
  Metadata = "Metadata",
  Variable = "Variable",
  EndOfLine = "EndOfLine",
  EndOfFile = "EndOfFile",
}

export interface Token {
  type: TokenType;
  value: string;
  lexeme: string;
  range: Range;
}

// ── AST: Tree Structure ─────────────────────────────────────────────

export interface DialogueTree {
  conversations: Conversation[];
}

export interface Conversation {
  name: string;
  nameRange?: Range;
  fullRange: Range;
  commandRange?: Range;
  dialogueLines: DialogueLine[];
  choices: ChoiceNode[];
  conditionals: ConditionalBlock[];
  setCommands: SetCommand[];
  globalDecls: GlobalDecl[];
  isDefault: boolean;
}

// ── AST: Dialogue Lines ─────────────────────────────────────────────

export interface DialogueLine {
  speaker: string;
  speakerRange: Range;
  range: Range;
  sentences: Sentence[];
  image?: ImageCommand;
  jump?: JumpCommand;
  isSilent: boolean;
}

export interface Sentence {
  range: Range;
  fragments: SentenceFragment[];
  metadata?: MetadataEntry[];
}

export type SentenceFragment =
  | TextFragment
  | FunctionInvocation
  | VariableReference
  | EscapeSequenceFragment;

export interface TextFragment {
  kind: "text";
  value: string;
  range: Range;
}

export interface FunctionInvocation {
  kind: "function";
  name: string;
  args: string[];
  range: Range;
  nameRange: Range;
}

export interface VariableReference {
  kind: "variable";
  name: string;
  range: Range;
  nameRange: Range;
}

export interface EscapeSequenceFragment {
  kind: "escape";
  value: string;
  range: Range;
}

// ── AST: Metadata ───────────────────────────────────────────────────

export interface MetadataEntry {
  key: string;
  value: string;
  range: Range;
  keyRange: Range;
  valueRange?: Range;
  isTag: boolean;
}

// ── AST: Choices ────────────────────────────────────────────────────

export interface ChoiceNode {
  text: string;
  target: string;
  range: Range;
  textRange: Range;
  targetRange: Range;
  arrowRange: Range;
  metadata: MetadataEntry[];
  isContinue: boolean;
}

// ── AST: Built-in Commands ──────────────────────────────────────────

export interface ImageCommand {
  path: string;
  range: Range;
  pathRange: Range;
}

export interface JumpCommand {
  target: string;
  range: Range;
  targetRange: Range;
}

export interface IncludeCommand {
  assetName: string;
  conversationName?: string;
  range: Range;
  assetRange: Range;
  conversationRange?: Range;
}

// ── AST: Conditionals (v1.0.0) ─────────────────────────────────────

export interface ConditionalBlock {
  branches: ConditionalBranch[];
  range: Range;
}

export interface ConditionalBranch {
  keyword: "If" | "ElseIf" | "Else";
  condition?: string;
  keywordRange: Range;
}

// ── AST: Variable Commands (v1.0.0) ────────────────────────────────

export interface SetCommand {
  variableName: string;
  expression: string;
  range: Range;
  variableRange: Range;
}

export interface GlobalDecl {
  variableName: string;
  expression?: string;
  range: Range;
  variableRange: Range;
}

// ── Document-Level Metadata (used by features) ─────────────────────

export interface DocumentModel {
  uri: string;
  version: number;
  text: string;
  tokens: Token[];
  ast: DialogueTree;
  conversations: Map<string, ConversationInfo>;
  variables: Map<string, VariableUsage[]>;
  functions: Map<string, FunctionUsage[]>;
  includes: IncludeInfo[];
}

export interface ConversationInfo {
  name: string;
  nameRange: Range;
  fullRange: Range;
  lineCount: number;
  choiceCount: number;
  choices: ChoiceInfo[];
  jumps: JumpInfo[];
}

export interface ChoiceInfo {
  text: string;
  target: string;
  targetRange: Range;
  range: Range;
  metadata: Map<string, string>;
}

export interface JumpInfo {
  target: string;
  targetRange: Range;
  range: Range;
}

export interface VariableUsage {
  name: string;
  range: Range;
  context:
    | "text"
    | "speaker"
    | "choice"
    | "choiceTarget"
    | "metadata"
    | "functionArg"
    | "jumpTarget"
    | "imagePath"
    | "set"
    | "global";
}

export interface FunctionUsage {
  name: string;
  args: string[];
  range: Range;
  nameRange: Range;
}

export interface IncludeInfo {
  assetName: string;
  conversationName?: string;
  range: Range;
}

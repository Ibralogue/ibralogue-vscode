/**
 * Central registry of all built-in keyword and invocation names.
 *
 * Every module that needs to distinguish built-in identifiers from
 * user-defined ones should import from here instead of hard-coding strings.
 */

/** Keywords that control dialogue structure (always standalone on their own line). */
export const STRUCTURAL_KEYWORDS = [
  "ConversationName",
  "If",
  "ElseIf",
  "Else",
  "EndIf",
  "Set",
  "Global",
  "Include",
] as const;

/** Invocations that ship with Ibralogue (can appear standalone or inline). */
export const BUILTIN_INVOCATIONS = [
  "Image",
  "Jump",
  "Audio",
  "Wait",
  "Speed",
] as const;

/** Every recognised built-in name (structural + invocation). */
export const ALL_KEYWORDS = [
  ...STRUCTURAL_KEYWORDS,
  ...BUILTIN_INVOCATIONS,
] as const;

/** Structural keywords that do NOT require parenthesised arguments. */
export const NO_PAREN_KEYWORDS = ["Else", "EndIf"] as const;

/** Keywords that are valid only inside a dialogue line (after a [Speaker]). */
export const DIALOGUE_LINE_COMMANDS = new Set<string>([
  "Image",
  "Jump",
  "Audio",
  "Wait",
  "Speed",
]);

/** Keywords that are structural and end the current dialogue line. */
export const STRUCTURAL_COMMAND_SET = new Set<string>(STRUCTURAL_KEYWORDS);

export const ALL_KEYWORD_SET = new Set<string>(ALL_KEYWORDS);

/** The special "continue" target that keeps the conversation flowing. */
export const CONTINUE_TARGET = ">>";

/** The special "silent" speaker that suppresses the dialogue view. */
export const SILENT_SPEAKER = ">>";

/** Regex character class for variable name characters. */
export const VAR_NAME_CHAR = /[a-zA-Z0-9_]/;

/** Regex for a complete variable reference ($ + name). */
export const VAR_REFERENCE_RE = /\$([a-zA-Z0-9_]+)/g;

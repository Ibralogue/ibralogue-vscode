import { DialogueTree } from "../parser/ast";
import { CONTINUE_TARGET } from "../parser/keywords";

export interface DialogueGraph {
  conversations: ConversationNode[];
  edges: Edge[];
}

export interface ConversationNode {
  id: string;
  name: string;
  lines: LinePreview[];
  choices: ChoicePreview[];
  startLine: number;
  endLine: number;
  isDefault: boolean;
  isOrphan: boolean;
  hasJumpOut: boolean;
}

export interface LinePreview {
  speaker: string;
  textPreview: string;
  hasImage: boolean;
  hasJump: boolean;
  jumpTarget?: string;
  line: number;
}

export interface ChoicePreview {
  text: string;
  target: string;
  line: number;
  isContinue: boolean;
}

export interface Edge {
  from: string;
  to: string;
  type: "choice" | "jump";
  label?: string;
}

export function buildDialogueGraph(ast: DialogueTree): DialogueGraph {
  const edges: Edge[] = [];
  const referenced = new Set<string>();
  const hasJumpOut = new Set<string>();

  for (const conv of ast.conversations) {
    for (const choice of conv.choices) {
      if (choice.target && choice.target !== CONTINUE_TARGET) {
        edges.push({ from: conv.name, to: choice.target, type: "choice", label: choice.text });
        referenced.add(choice.target);
      }
    }
    for (const dl of conv.dialogueLines) {
      if (dl.jump) {
        edges.push({ from: conv.name, to: dl.jump.target, type: "jump", label: `Jump(${dl.jump.target})` });
        referenced.add(dl.jump.target);
        hasJumpOut.add(conv.name);
      }
    }
  }

  const conversations: ConversationNode[] = ast.conversations.map((conv, i) => {
    const lines: LinePreview[] = conv.dialogueLines.map((dl) => {
      const textParts: string[] = [];
      for (const sent of dl.sentences) {
        for (const frag of sent.fragments) {
          if (frag.kind === "text") textParts.push(frag.value);
          else if (frag.kind === "function") textParts.push(`{{${frag.name}}}`);
          else if (frag.kind === "variable") textParts.push(`$${frag.name}`);
        }
      }
      return {
        speaker: dl.speaker,
        textPreview: textParts.join("").substring(0, 60),
        hasImage: !!dl.image,
        hasJump: !!dl.jump,
        jumpTarget: dl.jump?.target,
        line: dl.speakerRange.start.line,
      };
    });

    const choices: ChoicePreview[] = conv.choices.map((c) => ({
      text: c.text,
      target: c.target,
      line: c.range.start.line,
      isContinue: c.isContinue,
    }));

    return {
      id: conv.name,
      name: conv.name,
      lines,
      choices,
      startLine: conv.fullRange.start.line,
      endLine: conv.fullRange.end.line,
      isDefault: conv.isDefault,
      isOrphan: i > 0 && !referenced.has(conv.name),
      hasJumpOut: hasJumpOut.has(conv.name),
    };
  });

  return { conversations, edges };
}

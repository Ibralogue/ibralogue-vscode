import {
  ColorInformation,
  Color,
  ColorPresentation,
  Range,
} from "vscode-languageserver/node";
import { DialogueTree } from "../parser/ast";

const NAMED_COLORS: Record<string, [number, number, number, number]> = {
  black: [0, 0, 0, 1],
  blue: [0, 0, 1, 1],
  green: [0, 0.5, 0, 1],
  orange: [1, 0.647, 0, 1],
  purple: [0.5, 0, 0.5, 1],
  red: [1, 0, 0, 1],
  white: [1, 1, 1, 1],
  yellow: [1, 1, 0, 1],
};

const COLOR_TAG_RE = /<color=(#[0-9a-fA-F]{6}|#[0-9a-fA-F]{8}|[a-zA-Z]+)>/g;

export function getDocumentColors(ast: DialogueTree): ColorInformation[] {
  const colors: ColorInformation[] = [];

  for (const conv of ast.conversations) {
    for (const dl of conv.dialogueLines) {
      for (const sent of dl.sentences) {
        for (const frag of sent.fragments) {
          if (frag.kind !== "text") continue;

          COLOR_TAG_RE.lastIndex = 0;
          let match: RegExpExecArray | null;
          while ((match = COLOR_TAG_RE.exec(frag.value)) !== null) {
            const colorValue = match[1];
            const parsed = parseColor(colorValue);
            if (!parsed) continue;

            const valueStart = match.index + "<color=".length;
            const range: Range = {
              start: {
                line: frag.range.start.line,
                character: frag.range.start.character + valueStart,
              },
              end: {
                line: frag.range.start.line,
                character: frag.range.start.character + valueStart + colorValue.length,
              },
            };

            colors.push({ range, color: parsed });
          }
        }
      }
    }
  }

  return colors;
}

export function getColorPresentations(
  color: Color,
  range: Range,
): ColorPresentation[] {
  const r = Math.round(color.red * 255);
  const g = Math.round(color.green * 255);
  const b = Math.round(color.blue * 255);
  const hex = `#${toHex(r)}${toHex(g)}${toHex(b)}`;

  const presentations: ColorPresentation[] = [
    { label: hex, textEdit: { range, newText: hex } },
  ];

  if (color.alpha < 1) {
    const a = Math.round(color.alpha * 255);
    const hex8 = `#${toHex(r)}${toHex(g)}${toHex(b)}${toHex(a)}`;
    presentations.unshift({ label: hex8, textEdit: { range, newText: hex8 } });
  }

  for (const [name, [nr, ng, nb]] of Object.entries(NAMED_COLORS)) {
    if (
      Math.abs(color.red - nr) < 0.01 &&
      Math.abs(color.green - ng) < 0.01 &&
      Math.abs(color.blue - nb) < 0.01
    ) {
      presentations.unshift({ label: name, textEdit: { range, newText: name } });
      break;
    }
  }

  return presentations;
}

function parseColor(value: string): Color | null {
  if (value.startsWith("#")) {
    const hex = value.substring(1);
    if (hex.length === 6) {
      return {
        red: parseInt(hex.substring(0, 2), 16) / 255,
        green: parseInt(hex.substring(2, 4), 16) / 255,
        blue: parseInt(hex.substring(4, 6), 16) / 255,
        alpha: 1,
      };
    }
    if (hex.length === 8) {
      return {
        red: parseInt(hex.substring(0, 2), 16) / 255,
        green: parseInt(hex.substring(2, 4), 16) / 255,
        blue: parseInt(hex.substring(4, 6), 16) / 255,
        alpha: parseInt(hex.substring(6, 8), 16) / 255,
      };
    }
    return null;
  }

  const named = NAMED_COLORS[value.toLowerCase()];
  if (named) {
    return { red: named[0], green: named[1], blue: named[2], alpha: named[3] };
  }

  return null;
}

function toHex(n: number): string {
  return n.toString(16).padStart(2, "0");
}

import { describe, it, expect } from "vitest";
import { quickTokenize, tokTypes, tokValues } from "./helpers";
import { TokenType } from "../src/server/parser/ast";

describe("Lexer", () => {
  describe("empty/whitespace", () => {
    it("empty file produces only EndOfLine+EndOfFile", () => {
      const tokens = quickTokenize("");
      expect(tokens).toHaveLength(2);
      expect(tokens[0].type).toBe(TokenType.EndOfLine);
      expect(tokens[1].type).toBe(TokenType.EndOfFile);
    });

    it("whitespace-only produces no content tokens", () => {
      expect(tokTypes("   ")).toEqual([]);
      expect(tokTypes("  \t  ")).toEqual([]);
    });

    it("blank lines produce only EndOfLine tokens", () => {
      const tokens = quickTokenize("\n\n\n");
      const content = tokens.filter(
        (t) => t.type !== TokenType.EndOfLine && t.type !== TokenType.EndOfFile,
      );
      expect(content).toHaveLength(0);
    });
  });

  describe("comments", () => {
    it("# line becomes Comment", () => {
      expect(tokTypes("# hello")).toEqual(["Comment"]);
      expect(tokValues("# hello")).toEqual(["hello"]);
    });

    it("# with no text", () => {
      expect(tokTypes("#")).toEqual(["Comment"]);
      expect(tokValues("#")).toEqual([""]);
    });

    it("comment preserves leading text after #", () => {
      expect(tokValues("# This is a comment")).toEqual(["This is a comment"]);
    });
  });

  describe("metadata lines", () => {
    it("## at start of line becomes Metadata", () => {
      expect(tokTypes("## mood:happy")).toEqual(["Metadata"]);
      expect(tokValues("## mood:happy")).toEqual(["mood:happy"]);
    });

    it("## with no content", () => {
      expect(tokTypes("##")).toEqual(["Metadata"]);
      expect(tokValues("##")).toEqual([""]);
    });
  });

  describe("speakers", () => {
    it("[NPC] becomes Speaker with value NPC", () => {
      expect(tokTypes("[NPC]")).toEqual(["Speaker"]);
      expect(tokValues("[NPC]")).toEqual(["NPC"]);
    });

    it("speaker with spaces [Old Man]", () => {
      expect(tokValues("[Old Man]")).toEqual(["Old Man"]);
    });

    it("unterminated speaker [NPC", () => {
      expect(tokTypes("[NPC")).toEqual(["Speaker"]);
      const tokens = quickTokenize("[NPC");
      expect(tokens[0].lexeme).not.toContain("]");
    });

    it("speaker with variable [$PLAYERNAME]", () => {
      expect(tokTypes("[$PLAYERNAME]")).toEqual(["Speaker"]);
      expect(tokValues("[$PLAYERNAME]")).toEqual(["$PLAYERNAME"]);
    });
  });

  describe("choices", () => {
    it("- text -> Target becomes Choice", () => {
      expect(tokTypes("- Accept -> QuestAccepted")).toEqual(["Choice"]);
      expect(tokValues("- Accept -> QuestAccepted")).toEqual(["Accept -> QuestAccepted"]);
    });

    it("choice without leading space after dash", () => {
      expect(tokTypes("-text -> Target")).toEqual(["Choice"]);
    });

    it("choice with metadata", () => {
      const types = tokTypes("- Accept -> Target ## quest:main");
      expect(types).toEqual(["Choice"]);
    });
  });

  describe("commands", () => {
    it("{{ConversationName(Greeting)}} becomes Command", () => {
      expect(tokTypes("{{ConversationName(Greeting)}}")).toEqual(["Command"]);
      expect(tokValues("{{ConversationName(Greeting)}}")).toEqual(["ConversationName(Greeting)"]);
    });

    it("{{Jump(Target)}} becomes Command", () => {
      expect(tokTypes("{{Jump(Target)}}")).toEqual(["Command"]);
    });

    it("{{Image(Sprites/NPC)}} becomes Command", () => {
      expect(tokTypes("{{Image(Sprites/NPC)}}")).toEqual(["Command"]);
    });

    it("{{Include(OtherFile)}} becomes Command", () => {
      expect(tokTypes("{{Include(OtherFile)}}")).toEqual(["Command"]);
    });

    it("command vs function disambiguation: {{Name}} is NOT a command", () => {
      const types = tokTypes("{{GetDay}}");
      expect(types).not.toContain("Command");
      expect(types).toContain("Function");
    });

    it("{{Name(arg)}} on its own line IS a command", () => {
      expect(tokTypes("{{Jump(Target)}}")).toEqual(["Command"]);
    });

    it("{{Name(arg)}} with surrounding text is function, not command", () => {
      const types = tokTypes("Call {{Func(x)}} here");
      expect(types).toContain("Text");
      expect(types).toContain("Function");
      expect(types).not.toContain("Command");
    });
  });

  describe("inline functions", () => {
    it("{{GetDay}} in text line becomes Function", () => {
      const types = tokTypes("Today is {{GetDay}}.");
      expect(types).toContain("Function");
    });

    it("function with args {{Fn(a,b)}} in text context", () => {
      const tokens = quickTokenize("Call {{Fn(a,b)}} now");
      const func = tokens.find((t) => t.type === TokenType.Function);
      expect(func).toBeDefined();
      expect(func!.value).toBe("Fn(a,b)");
    });

    it("unterminated function {{Missing", () => {
      const types = tokTypes("Text {{Missing");
      expect(types).toContain("Function");
    });
  });

  describe("variables", () => {
    it("$PLAYERNAME becomes Variable", () => {
      const types = tokTypes("Hello $PLAYERNAME end");
      expect(types).toContain("Variable");
    });

    it("variable value is name without $", () => {
      const tokens = quickTokenize("$FOO");
      const v = tokens.find((t) => t.type === TokenType.Variable);
      expect(v!.value).toBe("FOO");
    });

    it("bare $ does not become Variable (stays in text)", () => {
      const tokens = quickTokenize("$");
      const vars = tokens.filter((t) => t.type === TokenType.Variable);
      expect(vars).toHaveLength(0);
    });

    it("$123 is a valid variable", () => {
      const tokens = quickTokenize("$123");
      expect(tokens.find((t) => t.type === TokenType.Variable)!.value).toBe("123");
    });
  });

  describe("escape sequences", () => {
    it("\\# at start of line produces text, not comment", () => {
      const types = tokTypes("\\# not a comment");
      expect(types).not.toContain("Comment");
      expect(types).toContain("Text");
    });

    it("\\[ at start of line produces text, not speaker", () => {
      const types = tokTypes("\\[NPC]");
      expect(types).not.toContain("Speaker");
      expect(types).toContain("Text");
    });

    it("\\- at start of line produces text, not choice", () => {
      const types = tokTypes("\\- not a choice -> Target");
      expect(types).not.toContain("Choice");
      expect(types).toContain("Text");
    });

    it("\\{{ at start of line produces text, not command", () => {
      const types = tokTypes("\\{{ConversationName(X)}}");
      expect(types).not.toContain("Command");
      expect(types).toContain("Text");
    });

    it("\\$ in text avoids variable tokenization", () => {
      const types = tokTypes("\\$100 price");
      const vars = types.filter((t) => t === "Variable");
      expect(vars).toHaveLength(0);
    });

    it("\\{{ inline avoids function tokenization", () => {
      const types = tokTypes("Use \\{{braces}}");
      expect(types).not.toContain("Function");
    });

    it("\\## inline avoids metadata tokenization", () => {
      const types = tokTypes("See \\## here");
      expect(types).not.toContain("Metadata");
    });
  });

  describe("trailing metadata", () => {
    it("## at end of text line becomes Metadata token", () => {
      const types = tokTypes("Hello world. ## mood:happy");
      expect(types).toContain("Text");
      expect(types).toContain("Metadata");
    });
  });

  describe("mixed line endings", () => {
    it("handles CRLF line endings", () => {
      const tokens = quickTokenize("[NPC]\r\nHello.\r\n");
      const speaker = tokens.find((t) => t.type === TokenType.Speaker);
      expect(speaker).toBeDefined();
      expect(speaker!.value).toBe("NPC");
    });

    it("handles CR-only line endings", () => {
      const tokens = quickTokenize("[NPC]\rHello.\r");
      expect(tokens.find((t) => t.type === TokenType.Speaker)).toBeDefined();
    });
  });

  describe("text lines", () => {
    it("plain text becomes Text token", () => {
      expect(tokTypes("Hello, world.")).toEqual(["Text"]);
    });

    it("text with multiple inline elements", () => {
      const types = tokTypes("Hi $NAME, call {{Fn}} now.");
      expect(types.filter((t) => t === "Text").length).toBeGreaterThanOrEqual(2);
      expect(types).toContain("Variable");
      expect(types).toContain("Function");
    });
  });

  describe("ranges", () => {
    it("speaker token range is correct", () => {
      const tokens = quickTokenize("[NPC]");
      const speaker = tokens[0];
      expect(speaker.range.start).toEqual({ line: 0, character: 0 });
      expect(speaker.range.end).toEqual({ line: 0, character: 5 });
    });

    it("command token range is correct", () => {
      const tokens = quickTokenize("{{ConversationName(X)}}");
      const cmd = tokens[0];
      expect(cmd.range.start).toEqual({ line: 0, character: 0 });
      expect(cmd.range.end).toEqual({ line: 0, character: 23 });
    });

    it("second-line tokens have correct line number", () => {
      const tokens = quickTokenize("# comment\n[NPC]");
      const speaker = tokens.find((t) => t.type === TokenType.Speaker);
      expect(speaker!.range.start.line).toBe(1);
    });
  });
});

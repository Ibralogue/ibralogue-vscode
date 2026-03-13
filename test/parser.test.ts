import { describe, it, expect } from "vitest";
import { quickParse, FIXTURE } from "./helpers";

describe("Parser", () => {
  describe("conversations", () => {
    it("parses named conversation", () => {
      const { ast } = quickParse("{{ConversationName(Greeting)}}\n[NPC]\nHello.");
      expect(ast.conversations).toHaveLength(1);
      expect(ast.conversations[0].name).toBe("Greeting");
      expect(ast.conversations[0].isDefault).toBe(false);
    });

    it("creates default conversation when no ConversationName", () => {
      const { ast } = quickParse("[NPC]\nHello.");
      expect(ast.conversations).toHaveLength(1);
      expect(ast.conversations[0].name).toBe("Default");
      expect(ast.conversations[0].isDefault).toBe(true);
    });

    it("parses multiple conversations", () => {
      const { ast } = quickParse(
        "{{ConversationName(A)}}\n[NPC]\nHi.\n{{ConversationName(B)}}\n[NPC]\nBye.",
      );
      expect(ast.conversations).toHaveLength(2);
      expect(ast.conversations[0].name).toBe("A");
      expect(ast.conversations[1].name).toBe("B");
    });

    it("conversation has correct nameRange", () => {
      const { ast } = quickParse("{{ConversationName(Greeting)}}");
      expect(ast.conversations[0].nameRange).toBeDefined();
      expect(ast.conversations[0].nameRange!.start.character).toBeGreaterThan(0);
    });

    it("conversation has commandRange", () => {
      const { ast } = quickParse("{{ConversationName(Greeting)}}");
      expect(ast.conversations[0].commandRange).toBeDefined();
    });

    it("conversation fullRange spans entire block", () => {
      const { ast } = quickParse("{{ConversationName(A)}}\n[NPC]\nHi.\n[NPC]\nBye.");
      const r = ast.conversations[0].fullRange;
      expect(r.start.line).toBe(0);
      expect(r.end.line).toBeGreaterThanOrEqual(3);
    });
  });

  describe("dialogue lines", () => {
    it("parses speaker + sentence", () => {
      const { ast } = quickParse("[NPC]\nHello, world.");
      const dl = ast.conversations[0].dialogueLines[0];
      expect(dl.speaker).toBe("NPC");
      expect(dl.sentences).toHaveLength(1);
    });

    it("multiple sentences under one speaker", () => {
      const { ast } = quickParse("[NPC]\nLine one.\nLine two.");
      const dl = ast.conversations[0].dialogueLines[0];
      expect(dl.sentences).toHaveLength(2);
    });

    it("multiple speakers create separate dialogue lines", () => {
      const { ast } = quickParse("[NPC]\nHi.\n[Player]\nBye.");
      expect(ast.conversations[0].dialogueLines).toHaveLength(2);
    });

    it("speakerRange is set correctly", () => {
      const { ast } = quickParse("[NPC]\nHi.");
      const dl = ast.conversations[0].dialogueLines[0];
      expect(dl.speakerRange.start.character).toBe(0);
    });
  });

  describe("sentence fragments", () => {
    it("plain text fragment", () => {
      const { ast } = quickParse("[NPC]\nHello.");
      const frag = ast.conversations[0].dialogueLines[0].sentences[0].fragments[0];
      expect(frag.kind).toBe("text");
    });

    it("function fragment in sentence", () => {
      const { ast } = quickParse("[NPC]\nToday is {{GetDay}}.");
      const frags = ast.conversations[0].dialogueLines[0].sentences[0].fragments;
      const func = frags.find((f) => f.kind === "function");
      expect(func).toBeDefined();
      if (func && func.kind === "function") {
        expect(func.name).toBe("GetDay");
        expect(func.args).toEqual([]);
      }
    });

    it("function with args", () => {
      const { ast } = quickParse("[NPC]\n{{GiveItem(Gold, 50)}}");
      const frags = ast.conversations[0].dialogueLines[0].sentences[0].fragments;
      const func = frags.find((f) => f.kind === "function");
      expect(func).toBeDefined();
      if (func && func.kind === "function") {
        expect(func.name).toBe("GiveItem");
        expect(func.args).toEqual(["Gold", "50"]);
      }
    });

    it("variable fragment in sentence", () => {
      const { ast } = quickParse("[NPC]\nHello, $NAME.");
      const frags = ast.conversations[0].dialogueLines[0].sentences[0].fragments;
      const v = frags.find((f) => f.kind === "variable");
      expect(v).toBeDefined();
      if (v && v.kind === "variable") expect(v.name).toBe("NAME");
    });
  });

  describe("metadata", () => {
    it("trailing metadata on sentence", () => {
      const { ast } = quickParse("[NPC]\nHello. ## mood:happy");
      const meta = ast.conversations[0].dialogueLines[0].sentences[0].metadata;
      expect(meta).toBeDefined();
      expect(meta!).toHaveLength(1);
      expect(meta![0].key).toBe("mood");
      expect(meta![0].value).toBe("happy");
    });

    it("tag metadata (no colon)", () => {
      const { ast } = quickParse("[NPC]\nHello. ## important");
      const meta = ast.conversations[0].dialogueLines[0].sentences[0].metadata;
      expect(meta![0].isTag).toBe(true);
      expect(meta![0].key).toBe("important");
    });

    it("multiple metadata entries", () => {
      const { ast } = quickParse("[NPC]\nHello. ## mood:happy greeting");
      const meta = ast.conversations[0].dialogueLines[0].sentences[0].metadata;
      expect(meta).toHaveLength(2);
    });
  });

  describe("choices", () => {
    it("parses choice with target", () => {
      const { ast } = quickParse("[NPC]\nHi.\n- Accept -> QuestAccepted");
      expect(ast.conversations[0].choices).toHaveLength(1);
      const c = ast.conversations[0].choices[0];
      expect(c.text).toBe("Accept");
      expect(c.target).toBe("QuestAccepted");
    });

    it("choice with metadata", () => {
      const { ast } = quickParse("[NPC]\nHi.\n- Accept -> Target ## quest:main");
      const c = ast.conversations[0].choices[0];
      expect(c.metadata).toHaveLength(1);
      expect(c.metadata[0].key).toBe("quest");
    });

    it("multiple choices", () => {
      const { ast } = quickParse("[NPC]\nHi.\n- A -> X\n- B -> Y");
      expect(ast.conversations[0].choices).toHaveLength(2);
    });

    it("choice arrowRange is set", () => {
      const { ast } = quickParse("[NPC]\nHi.\n- Go -> Target");
      const c = ast.conversations[0].choices[0];
      expect(c.arrowRange.start.character).not.toBe(c.arrowRange.end.character);
    });
  });

  describe("commands", () => {
    it("Jump command sets jump on dialogue line", () => {
      const { ast } = quickParse("[NPC]\nHello.\n{{Jump(Farewell)}}");
      expect(ast.conversations[0].dialogueLines[0].jump).toBeDefined();
      expect(ast.conversations[0].dialogueLines[0].jump!.target).toBe("Farewell");
    });

    it("Image command sets image on dialogue line", () => {
      const { ast } = quickParse("[NPC]\n{{Image(Sprites/NPC)}}\nHello.");
      expect(ast.conversations[0].dialogueLines[0].image).toBeDefined();
      expect(ast.conversations[0].dialogueLines[0].image!.path).toBe("Sprites/NPC");
    });

    it("Include with no args produces IBR007", () => {
      const { diagnostics } = quickParse("{{Include()}}");
      expect(diagnostics.some((d) => d.code === "IBR007")).toBe(true);
    });
  });

  describe("parser diagnostics", () => {
    it("IBR005: content before any speaker", () => {
      const { diagnostics } = quickParse("{{ConversationName(A)}}\nText without speaker");
      expect(diagnostics.some((d) => d.code === "IBR005")).toBe(true);
    });

    it("IBR103: duplicate jump warning", () => {
      const { diagnostics } = quickParse("[NPC]\nHi.\n{{Jump(A)}}\n{{Jump(B)}}");
      expect(diagnostics.some((d) => d.code === "IBR103")).toBe(true);
    });

    it("IBR104: command outside dialogue line", () => {
      const { diagnostics } = quickParse("{{ConversationName(A)}}\n{{Image(Sprites/X)}}");
      expect(diagnostics.some((d) => d.code === "IBR104")).toBe(true);
    });

    it("IBR111: choice before any dialogue line", () => {
      const { diagnostics } = quickParse("{{ConversationName(A)}}\n- Go -> X");
      expect(diagnostics.some((d) => d.code === "IBR111")).toBe(true);
    });
  });

  describe("comprehensive fixture", () => {
    it("parses the full fixture without crashing", () => {
      const { ast } = quickParse(FIXTURE);
      expect(ast.conversations.length).toBeGreaterThanOrEqual(5);
    });

    it("fixture has correct conversation names", () => {
      const { ast } = quickParse(FIXTURE);
      const names = ast.conversations.map((c) => c.name);
      expect(names).toContain("TestConversation");
      expect(names).toContain("SecondConversation");
      expect(names).toContain("AcceptQuest");
      expect(names).toContain("DeclineQuest");
      expect(names).toContain("HiddenDialogue");
    });

    it("fixture choices are parsed", () => {
      const { ast } = quickParse(FIXTURE);
      const second = ast.conversations.find((c) => c.name === "SecondConversation");
      expect(second!.choices).toHaveLength(3);
    });
  });
});

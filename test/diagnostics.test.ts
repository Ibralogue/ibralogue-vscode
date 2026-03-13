import { describe, it, expect } from "vitest";
import { diagCodes, quickAll, FIXTURE } from "./helpers";

describe("Diagnostics", () => {
  describe("IBR001: unterminated speaker", () => {
    it("detects [NPC without closing bracket", () => {
      expect(diagCodes("[NPC\nHello.")).toContain("IBR001");
    });

    it("no false positive on valid [NPC]", () => {
      expect(diagCodes("[NPC]\nHello.")).not.toContain("IBR001");
    });
  });

  describe("IBR003: unterminated function", () => {
    it("detects {{Missing without closing braces", () => {
      expect(diagCodes("[NPC]\n{{Missing")).toContain("IBR003");
    });

    it("no false positive on valid {{Fn}}", () => {
      expect(diagCodes("[NPC]\n{{Fn}}")).not.toContain("IBR003");
    });
  });

  describe("IBR004: choice missing ->", () => {
    it("detects - text without arrow", () => {
      expect(diagCodes("[NPC]\nHi.\n- Just text")).toContain("IBR004");
    });

    it("no false positive on valid choice with arrow", () => {
      expect(diagCodes("[NPC]\nHi.\n- Go -> Target")).not.toContain("IBR004");
    });
  });

  describe("IBR006: no conversations", () => {
    it("detects empty file", () => {
      expect(diagCodes("")).toContain("IBR006");
    });

    it("detects file with only comments", () => {
      expect(diagCodes("# Just a comment")).toContain("IBR006");
    });

    it("no false positive when conversation exists", () => {
      expect(diagCodes("[NPC]\nHello.")).not.toContain("IBR006");
    });
  });

  describe("IBR101: bare $ in text", () => {
    it("detects lone $ in text", () => {
      expect(diagCodes("[NPC]\n$ bare")).toContain("IBR101");
    });

    it("no false positive on valid $NAME", () => {
      expect(diagCodes("[NPC]\n$NAME")).not.toContain("IBR101");
    });
  });

  describe("IBR107: undefined choice target", () => {
    it("detects choice pointing to non-existent conversation", () => {
      expect(diagCodes("[NPC]\nHi.\n- Go -> Nowhere")).toContain("IBR107");
    });

    it("no false positive when target exists", () => {
      const text =
        "{{ConversationName(A)}}\n[NPC]\nHi.\n- Go -> B\n{{ConversationName(B)}}\n[NPC]\nBye.";
      expect(diagCodes(text)).not.toContain("IBR107");
    });
  });

  describe("IBR108: undefined jump target", () => {
    it("detects jump to non-existent conversation", () => {
      expect(diagCodes("[NPC]\nHi.\n{{Jump(Nowhere)}}")).toContain("IBR108");
    });

    it("no false positive when target exists", () => {
      const text =
        "{{ConversationName(A)}}\n[NPC]\nHi.\n{{Jump(B)}}\n{{ConversationName(B)}}\n[NPC]\nBye.";
      expect(diagCodes(text)).not.toContain("IBR108");
    });
  });

  describe("IBR110: duplicate conversation name", () => {
    it("detects two conversations with same name", () => {
      const text =
        "{{ConversationName(Dup)}}\n[NPC]\nHi.\n{{ConversationName(Dup)}}\n[NPC]\nBye.";
      expect(diagCodes(text)).toContain("IBR110");
    });

    it("no false positive with unique names", () => {
      const text = "{{ConversationName(A)}}\n[NPC]\nHi.\n{{ConversationName(B)}}\n[NPC]\nBye.";
      expect(diagCodes(text)).not.toContain("IBR110");
    });
  });

  describe("IBR112: unreferenced conversation", () => {
    it("detects conversation never targeted by choice or jump", () => {
      const text = "{{ConversationName(A)}}\n[NPC]\nHi.\n{{ConversationName(B)}}\n[NPC]\nBye.";
      expect(diagCodes(text)).toContain("IBR112");
    });

    it("first conversation is exempt (entry point)", () => {
      const text = "{{ConversationName(Entry)}}\n[NPC]\nHi.";
      expect(diagCodes(text)).not.toContain("IBR112");
    });

    it("no false positive when referenced by choice", () => {
      const text =
        "{{ConversationName(A)}}\n[NPC]\nHi.\n- Go -> B\n{{ConversationName(B)}}\n[NPC]\nBye.";
      expect(diagCodes(text)).not.toContain("IBR112");
    });

    it("no false positive when referenced by jump", () => {
      const text =
        "{{ConversationName(A)}}\n[NPC]\nHi.\n{{Jump(B)}}\n{{ConversationName(B)}}\n[NPC]\nBye.";
      expect(diagCodes(text)).not.toContain("IBR112");
    });
  });

  describe("comprehensive fixture", () => {
    it("fixture produces IBR112 for HiddenDialogue", () => {
      const { diagnostics } = quickAll(FIXTURE);
      const ibr112 = diagnostics.filter((d) => d.code === "IBR112");
      expect(ibr112.length).toBeGreaterThanOrEqual(1);
    });

    it("fixture does not produce IBR006", () => {
      expect(diagCodes(FIXTURE)).not.toContain("IBR006");
    });
  });

  describe("false positive avoidance", () => {
    it("escaped \\- is not a malformed choice", () => {
      expect(diagCodes("[NPC]\n\\- not a choice")).not.toContain("IBR004");
    });

    it("valid variable does not trigger IBR101", () => {
      expect(diagCodes("[NPC]\n$VALID")).not.toContain("IBR101");
    });

    it("properly closed function does not trigger IBR003", () => {
      expect(diagCodes("[NPC]\n{{Good()}}")).not.toContain("IBR003");
    });
  });
});

import {
  normalizeBody,
  preFilterActions,
} from "../src/execution/index.js";

describe("execution adapter", () => {
  describe("normalizeBody", () => {
    it("converts CRLF to LF", () => {
      expect(normalizeBody("a\r\nb")).toBe("a\nb\n");
    });
    it("trims trailing whitespace and ensures single trailing newline", () => {
      expect(normalizeBody("  text  \n\n")).toBe("  text\n");
    });
    it("adds trailing newline when missing", () => {
      expect(normalizeBody("x")).toBe("x\n");
    });
    it("returns empty for non-string", () => {
      expect(normalizeBody(null as unknown as string)).toBe("");
    });
  });

  describe("preFilterActions", () => {
    it("removes noop", () => {
      expect(preFilterActions([{ type: "noop" }])).toEqual([]);
    });
    it("keeps single create", () => {
      const actions = preFilterActions([
        { type: "create", body: "a" },
      ]);
      expect(actions).toHaveLength(1);
      expect(actions[0]).toMatchObject({ type: "create", body: "a" });
    });
    it("allows max one delete when no create", () => {
      const actions = preFilterActions([
        { type: "delete", id: 1 },
        { type: "delete", id: 2 },
      ]);
      expect(actions).toHaveLength(1);
      expect(actions[0]).toMatchObject({ type: "delete", id: 1 });
    });
    it("ignores deletes when create exists", () => {
      const actions = preFilterActions([
        { type: "create", body: "x" },
        { type: "delete", id: 1 },
      ]);
      expect(actions).toHaveLength(1);
      expect(actions[0]).toMatchObject({ type: "create" });
    });
    it("dedupes update/replace by id", () => {
      const actions = preFilterActions([
        { type: "update", id: 1, body: "a" },
        { type: "update", id: 1, body: "b" },
      ]);
      expect(actions).toHaveLength(1);
      expect(actions[0]).toMatchObject({ type: "update", id: 1 });
    });
    it("preserves order", () => {
      const actions = preFilterActions([
        { type: "delete", id: 1 },
        { type: "update", id: 2, body: "b" },
      ]);
      expect(actions[0]).toMatchObject({ type: "delete", id: 1 });
      expect(actions[1]).toMatchObject({ type: "update", id: 2 });
    });
  });
});

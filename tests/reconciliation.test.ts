import {
  reconcileComment,
  parseArcSightMetadata,
  buildArcSightMetadataLine,
} from "../src/reconciliation/index.js";

const HEAD = "abc123def456";
const BODY = "ArcSight Result: ARCHITECTURE BLOCKED\n\nViolation detected.";
const FINGERPRINT = "a1b2c3d4e5f6789012345678901234567890abcd";
const MESSAGE_ID = "m001";

function next(overrides: Partial<{
  body: string;
  fingerprint: string;
  messageId: string;
  status: "VERIFIED" | "UNSAFE" | "INDETERMINATE";
  commitSha: string;
}> = {}) {
  return {
    body: overrides.body ?? BODY + "\n" + buildArcSightMetadataLine(HEAD, MESSAGE_ID, FINGERPRINT),
    fingerprint: overrides.fingerprint ?? FINGERPRINT,
    messageId: overrides.messageId ?? MESSAGE_ID,
    status: (overrides.status ?? "UNSAFE") as "VERIFIED" | "UNSAFE" | "INDETERMINATE",
    commitSha: overrides.commitSha ?? HEAD,
  };
}

function existing(id: number, commitSha: string, messageId: string, fingerprint: string, createdAt: string) {
  return {
    id,
    body: "Some text\n" + buildArcSightMetadataLine(commitSha, messageId, fingerprint),
    createdAt,
  };
}

describe("reconciliation", () => {
  it("VERIFIED deletes all ArcSight comments", () => {
    const actions = reconcileComment(
      [existing(1, HEAD, MESSAGE_ID, FINGERPRINT, "2024-01-01T00:00:00Z")],
      next({ status: "VERIFIED" }),
      HEAD,
    );
    expect(actions).toHaveLength(1);
    expect(actions[0]).toEqual({ type: "delete", id: 1 });
  });

  it("VERIFIED with no comments returns noop", () => {
    const actions = reconcileComment([], next({ status: "VERIFIED" }), HEAD);
    expect(actions).toHaveLength(1);
    expect(actions[0]).toEqual({ type: "noop" });
  });

  it("no existing comment returns create", () => {
    const actions = reconcileComment([], next(), HEAD);
    expect(actions).toHaveLength(1);
    expect(actions[0]).toMatchObject({ type: "create", body: expect.any(String) });
  });

  it("stale run (next.commitSha !== currentPrHeadSha) returns noop", () => {
    const actions = reconcileComment(
      [existing(1, HEAD, MESSAGE_ID, FINGERPRINT, "2024-01-01T00:00:00Z")],
      next({ commitSha: "oldsha000" }),
      HEAD,
    );
    expect(actions).toHaveLength(1);
    expect(actions[0]).toEqual({ type: "noop" });
  });

  it("existing comment for older commit triggers replace", () => {
    const actions = reconcileComment(
      [existing(1, "oldsha000", MESSAGE_ID, FINGERPRINT, "2024-01-01T00:00:00Z")],
      next(),
      HEAD,
    );
    expect(actions).toHaveLength(1);
    expect(actions[0]).toMatchObject({ type: "replace", id: 1 });
  });

  it("same fingerprint returns noop", () => {
    const actions = reconcileComment(
      [existing(1, HEAD, MESSAGE_ID, FINGERPRINT, "2024-01-01T00:00:00Z")],
      next(),
      HEAD,
    );
    expect(actions).toHaveLength(1);
    expect(actions[0]).toEqual({ type: "noop" });
  });

  it("same messageId different fingerprint returns update", () => {
    const actions = reconcileComment(
      [existing(1, HEAD, MESSAGE_ID, FINGERPRINT, "2024-01-01T00:00:00Z")],
      next({ fingerprint: "f9f9f9f9f9f9f9f9f9f9f9f9f9f9f9f9f9f9f9f9" }),
      HEAD,
    );
    expect(actions).toHaveLength(1);
    expect(actions[0]).toMatchObject({ type: "update", id: 1 });
  });

  it("different messageId returns replace", () => {
    const actions = reconcileComment(
      [existing(1, HEAD, MESSAGE_ID, FINGERPRINT, "2024-01-01T00:00:00Z")],
      next({ messageId: "m002", fingerprint: "differentfingerprint123456789012345678901234" }),
      HEAD,
    );
    expect(actions).toHaveLength(1);
    expect(actions[0]).toMatchObject({ type: "replace", id: 1 });
  });

  it("malformed metadata returns replace", () => {
    const actions = reconcileComment(
      [{ id: 1, body: "Text\n<!-- arcsight:bad:no-colons -->", createdAt: "2024-01-01T00:00:00Z" }],
      next(),
      HEAD,
    );
    expect(actions).toHaveLength(1);
    expect(actions[0]).toMatchObject({ type: "replace", id: 1 });
  });

  it("multiple ArcSight comments: delete others then one action on canonical", () => {
    const actions = reconcileComment(
      [
        existing(1, HEAD, MESSAGE_ID, "otherfp1", "2024-01-01T00:00:00Z"),
        existing(2, HEAD, MESSAGE_ID, "otherfp2", "2024-01-02T00:00:00Z"),
      ],
      next({ fingerprint: "newfp" }),
      HEAD,
    );
    expect(actions.some((a) => a.type === "delete")).toBe(true);
    expect(actions.filter((a) => a.type === "delete")).toHaveLength(1);
    const last = actions[actions.length - 1];
    expect(last?.type === "update" || last?.type === "replace").toBe(true);
  });
});

describe("parseArcSightMetadata", () => {
  it("parses valid metadata line", () => {
    const body = "Text\n<!-- arcsight:abc123:m01:abcdef0123456789 -->";
    expect(parseArcSightMetadata(body)).toEqual({
      commitSha: "abc123",
      messageId: "m01",
      fingerprint: "abcdef0123456789",
    });
  });

  it("returns null for missing metadata", () => {
    expect(parseArcSightMetadata("No marker")).toBeNull();
  });
});

describe("buildArcSightMetadataLine", () => {
  it("produces exact format", () => {
    const line = buildArcSightMetadataLine("sha", "mid", "fp");
    expect(line).toBe("<!-- arcsight:sha:mid:fp -->");
  });
});

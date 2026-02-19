import { computeRepoHash } from "../src/repair/repoHash.js";

describe("computeRepoHash", () => {
  it("returns deterministic sha256 hex string", () => {
    const hash = computeRepoHash(process.cwd());
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    const hash2 = computeRepoHash(process.cwd());
    expect(hash2).toBe(hash);
  });
});

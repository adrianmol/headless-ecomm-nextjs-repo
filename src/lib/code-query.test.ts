import { describe, expect, it } from "vitest";
import { codeCandidates } from "./code-query";

describe("codeCandidates", () => {
  it("asks once for a code typed cleanly", () => {
    expect(codeCandidates("  CN-PGI29C ")).toEqual(["CN-PGI29C"]);
  });

  it("reads a space as noise, then as a missing dash", () => {
    expect(codeCandidates("cn  pgi29c")).toEqual(["cnpgi29c", "cn-pgi29c"]);
  });

  it("asks for nothing when there is nothing, or too much, to ask", () => {
    expect(codeCandidates("   ")).toEqual([]);
    expect(codeCandidates("x".repeat(65))).toEqual([]);
  });
});

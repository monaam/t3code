import { describe, expect, it } from "vite-plus/test";

import { parseQuickAsk } from "./quickAsk.logic";

describe("parseQuickAsk", () => {
  const targets = [
    { displayName: "Pronto" },
    { displayName: "LE 2" },
    { displayName: "LesExperts AI" },
  ];

  it("reads the workspace by its name or the start of one name", () => {
    expect(parseQuickAsk("pronto: check the invoice", targets)).toEqual({
      target: targets[0],
      brief: "check the invoice",
    });
    expect(parseQuickAsk("LesEx: draft the post", targets)?.target).toBe(targets[2]);
    expect(parseQuickAsk("le 2: call Billal", targets)?.target).toBe(targets[1]);
  });

  it("is not a quick ask without one workspace and a brief", () => {
    expect(parseQuickAsk("l: ambiguous", targets)).toBeNull();
    expect(parseQuickAsk("Acme: unknown", targets)).toBeNull();
    expect(parseQuickAsk("Pronto:", targets)).toBeNull();
    expect(parseQuickAsk("invoice check", targets)).toBeNull();
  });
});

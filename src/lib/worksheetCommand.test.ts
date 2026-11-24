import { describe, it, expect } from "vitest";
import { parseWorksheetCommand, findWorksheetItem, suggestWorksheet } from "./worksheetCommand";

describe("parseWorksheetCommand", () => {
  it("reads digits", () => expect(parseWorksheetCommand("okay send question 2")).toEqual({ number: 2, part: "" }));
  it("reads spoken numbers", () => expect(parseWorksheetCommand("push problem four")).toEqual({ number: 4, part: "" }));
  it("reads glued sub-parts", () => expect(parseWorksheetCommand("send question 2a")).toEqual({ number: 2, part: "a" }));
  it("reads spaced sub-parts", () => expect(parseWorksheetCommand("send question two b")).toEqual({ number: 2, part: "b" }));
  it("ignores plain send question", () => expect(parseWorksheetCommand("send question now")).toBeNull());
  it("ignores 'to students'", () => expect(parseWorksheetCommand("send question to students")).toBeNull());
  it("accepts trailing 'to' as two", () => expect(parseWorksheetCommand("send question to")).toEqual({ number: 2, part: "" }));
});

describe("findWorksheetItem", () => {
  const items = [{ number: 1, part: "" }, { number: 2, part: "b" }, { number: 2, part: "a" }];
  it("question 2 falls back to 2a", () => expect(findWorksheetItem(items, { number: 2, part: "" })).toEqual({ number: 2, part: "a" }));
  it("finds a named part", () => expect(findWorksheetItem(items, { number: 2, part: "b" })).toEqual({ number: 2, part: "b" }));
  it("misses unknown numbers", () => expect(findWorksheetItem(items, { number: 9, part: "" })).toBeNull());
  it("misses unknown parts", () => expect(findWorksheetItem(items, { number: 1, part: "c" })).toBeNull());
});

describe("suggestWorksheet", () => {
  const sheets = [{ id: "a", title: "Worksheet 4 Newton's Laws" }, { id: "b", title: "Worksheet 5 Momentum" }];
  it("matches spoken number", () => expect(suggestWorksheet(sheets, "take out worksheet 4")?.id).toBe("a"));
  it("needs a sheet word", () => expect(suggestWorksheet(sheets, "momentum is conserved")).toBeNull());
});

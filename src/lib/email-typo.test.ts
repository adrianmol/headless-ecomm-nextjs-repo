import { describe, expect, it } from "vitest";
import { suggestEmail } from "./email-typo";

describe("suggestEmail", () => {
  it("catches the common domain typos", () => {
    expect(suggestEmail("ion@gmial.con")).toBe("ion@gmail.com");
    expect(suggestEmail("ion@gmail.co")).toBe("ion@gmail.com");
    expect(suggestEmail("ion@yaho.com")).toBe("ion@yahoo.com");
    expect(suggestEmail("ion@yahoo.rp")).toBe("ion@yahoo.ro");
    expect(suggestEmail("ion@hotmial.com")).toBe("ion@hotmail.com");
    expect(suggestEmail("  ion@GMAIL.CMO ")).toBe("ion@gmail.com");
  });

  it("keeps the local part exactly as typed", () => {
    expect(suggestEmail("Ion.Popescu+toner@gmai.com")).toBe(
      "Ion.Popescu+toner@gmail.com",
    );
  });

  it("leaves correct and unrelated domains alone", () => {
    for (const email of [
      "ion@gmail.com",
      "ion@yahoo.ro",
      // Real providers close to a popular one: suggesting would be wrong.
      "ion@mail.com",
      "ion@gmx.net",
      // A company domain is nobody's typo of gmail.
      "achizitii@primaria-cluj.ro",
      "ion@reprint.ro",
    ]) {
      expect(suggestEmail(email), email).toBeNull();
    }
  });

  it("says nothing about input that is not an address yet", () => {
    for (const input of ["", "ion", "ion@", "@gmail.com"]) {
      expect(suggestEmail(input), input).toBeNull();
    }
  });
});

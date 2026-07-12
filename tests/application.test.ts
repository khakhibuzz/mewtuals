import { describe, expect, it } from "vitest";
import {
  prototypeSubmitter,
  validateApplication,
  validateCompanyUrl,
  validatePhone,
  validateWorkEmail,
} from "../app/lib/application";

describe("validateCompanyUrl", () => {
  it.each([
    ["argide.ai", "https://argide.ai/"],
    [" https://www.argide.ai/demo ", "https://www.argide.ai/demo"],
    ["fcm.travel", "https://fcm.travel/"],
    ["fd.co", "https://fd.co/"],
  ])("normalizes %s", (input, expected) => {
    expect(validateCompanyUrl(input)).toEqual({ ok: true, value: expected });
  });

  it.each([
    "argide",
    "ftp://argide.ai",
    "not a url",
    "https://argide.ai/demo page",
    "localhost:3000",
    "https://service.localhost",
    "http://127.0.0.1",
    "http://10.0.0.2",
    "http://172.16.0.2",
    "http://192.168.1.2",
  ])("rejects non-public company URL %s", (input) => {
    expect(validateCompanyUrl(input)).toEqual({
      ok: false,
      error: "Enter a public company URL.",
    });
  });
});

describe("validateWorkEmail", () => {
  it.each([
    [" founder@argide.ai ", "founder@argide.ai"],
    ["FOUNDER+MUTUALS@GMAIL.COM", "founder+mutuals@gmail.com"],
  ])("normalizes %s without blocking early founders", (input, expected) => {
    expect(validateWorkEmail(input)).toEqual({ ok: true, value: expected });
  });

  it.each(["founder", "@argide.ai", "founder@localhost"])(
    "rejects invalid email %s",
    (input) => {
      expect(validateWorkEmail(input)).toEqual({
        ok: false,
        error: "Enter a valid work email.",
      });
    },
  );
});

describe("validatePhone", () => {
  it.each([
    ["+91 98765 43210", "+919876543210"],
    ["(415) 555-0132", "4155550132"],
    ["44.20.7946.0958", "442079460958"],
  ])("normalizes %s", (input, expected) => {
    expect(validatePhone(input)).toEqual({ ok: true, value: expected });
  });

  it.each(["12345", "call-me", "+1234567890123456"])(
    "rejects invalid phone %s",
    (input) => {
      expect(validatePhone(input)).toEqual({
        ok: false,
        error: "Enter a phone number with 8 to 15 digits.",
      });
    },
  );
});

describe("validateApplication", () => {
  it("returns field-specific required errors", () => {
    expect(
      validateApplication({ companyUrl: "", workEmail: " ", phone: "" }),
    ).toEqual({
      ok: false,
      errors: {
        companyUrl: "Company URL is required.",
        workEmail: "Work email is required.",
        phone: "Phone number is required.",
      },
    });
  });

  it("returns normalized application data", () => {
    expect(
      validateApplication({
        companyUrl: "argide.ai",
        workEmail: " FOUNDER@ARGIDE.AI ",
        phone: "+91 98765 43210",
      }),
    ).toEqual({
      ok: true,
      value: {
        companyUrl: "https://argide.ai/",
        workEmail: "founder@argide.ai",
        phone: "+919876543210",
      },
    });
  });
});

describe("prototypeSubmitter", () => {
  it("keeps the submission boundary asynchronous and side-effect free", async () => {
    await expect(
      prototypeSubmitter({
        companyUrl: "https://argide.ai/",
        workEmail: "founder@argide.ai",
        phone: "+919876543210",
      }),
    ).resolves.toBeUndefined();
  });
});

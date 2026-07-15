import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  VerificationQueue,
  type VerificationQueueProfile,
} from "../app/components/product/VerificationQueue";

const profiles: readonly VerificationQueueProfile[] = [
  {
    id: "17ca68ae-8840-4fa2-a5e0-951963f028d5",
    name: "Alpha Studio",
    memberEmail: "alpha@example.com",
    organisationName: "Alpha",
    identityLabel: "Organisation · Startup",
    domain: "alpha.example",
    primaryUrl: "https://alpha.example/",
    submittedAt: "2026-01-15T09:30:00.000Z",
  },
  {
    id: "89ef0f37-c99b-40f6-9c9f-4d809551f4f5",
    name: "Beta Studio",
    memberEmail: "beta@example.com",
    organisationName: "Beta",
    identityLabel: "Organisation · Brand",
    domain: "beta.example",
    primaryUrl: "https://beta.example/",
    submittedAt: "2026-02-20T18:05:00.000Z",
  },
];

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolver) => {
    resolve = resolver;
  });
  return { promise, resolve };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("verification queue", () => {
  it("server-renders a deterministic UTC timestamp with machine-readable time", () => {
    const html = renderToString(<VerificationQueue profiles={profiles} />);

    expect(html).toContain("15 Jan 2026, 09:30 UTC");
    expect(html).toContain('dateTime="2026-01-15T09:30:00.000Z"');
  });

  it("uses profile-specific accessible decision labels", () => {
    render(<VerificationQueue profiles={profiles} />);

    expect(
      screen.getByRole("button", { name: "Approve Alpha Studio" }),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Waitlist Alpha Studio" }),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Approve Beta Studio" }),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Waitlist Beta Studio" }),
    ).toBeVisible();
  });

  it("locks the entire queue during a request and recovers after an error", async () => {
    const user = userEvent.setup();
    const firstResponse = deferred<Response>();
    const fetchMock = vi
      .fn<(...arguments_: Parameters<typeof fetch>) => ReturnType<typeof fetch>>()
      .mockImplementationOnce(() => firstResponse.promise)
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: "Second review failed." }), {
          status: 409,
          headers: { "Content-Type": "application/json" },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);
    render(<VerificationQueue profiles={profiles} />);

    await user.click(
      screen.getByRole("button", { name: "Approve Alpha Studio" }),
    );
    expect(
      screen
        .getAllByRole("button")
        .every((button) => button.hasAttribute("disabled")),
    ).toBe(true);

    await user.click(
      screen.getByRole("button", { name: "Waitlist Beta Studio" }),
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);

    firstResponse.resolve(
      new Response(JSON.stringify({ error: "First review failed." }), {
        status: 409,
        headers: { "Content-Type": "application/json" },
      }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "First review failed.",
    );
    await waitFor(() => {
      expect(
        screen
          .getAllByRole("button")
          .every((button) => !button.hasAttribute("disabled")),
      ).toBe(true);
    });

    await user.click(
      screen.getByRole("button", { name: "Waitlist Beta Studio" }),
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Second review failed.",
    );
  });
});

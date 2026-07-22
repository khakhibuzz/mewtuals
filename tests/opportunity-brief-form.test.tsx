import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { OpportunityBriefForm } from "../app/components/product/OpportunityBriefForm";

const tracking = {
  source: "bengaluru-meetup",
  utm: {
    source: "linkedin",
    medium: "social",
    campaign: "meetup-launch",
    term: "creator partnership",
    content: "qr-card",
  },
};

function successfulResponse(
  overrides: Record<string, unknown> = {},
) {
  return new Response(
    JSON.stringify({
      ok: true,
      requestId: "00000000-0000-4000-8000-000000000101",
      status: "submitted",
      submission: {
        participantType: "company",
        profileUrl: "https://example.com/Founder",
        email: "current@example.com",
        phoneNumber: null,
        openToText: null,
        source: "bengaluru-meetup",
        utm: tracking.utm,
      },
      ...overrides,
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

async function fillRequiredFields(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText("Public profile URL"), "https://example.com/Founder");
  await user.type(screen.getByLabelText("Email address (optional)"), "current@example.com");
}

describe("public Opportunity Brief form", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows accessible participant choices, field semantics, and exact action copy", () => {
    const { container } = render(<OpportunityBriefForm tracking={tracking} />);

    expect(screen.getByRole("group", { name: "I’m joining as" })).toBeVisible();
    expect(screen.getByRole("radio", { name: "Company / Startup / Brand" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Creator / Podcaster / Media" })).not.toBeChecked();
    expect(screen.getByLabelText("Public profile URL")).toHaveAttribute("type", "url");
    expect(screen.getByLabelText("Public profile URL")).toHaveAttribute("inputmode", "url");
    expect(screen.getByLabelText("Email address (optional)")).toHaveAttribute("autocomplete", "email");
    expect(screen.getByLabelText("WhatsApp number (optional)")).toHaveAttribute("inputmode", "tel");
    expect(screen.getByLabelText("WhatsApp number (optional)")).toHaveAttribute("autocomplete", "tel");
    expect(screen.getByLabelText("What are you open to? (optional)")).toBeVisible();
    expect(screen.getByRole("button", { name: "Get my opportunity brief" })).toBeVisible();
    expect(screen.getByText("No login. No deck. We start with what is already public.")).toBeVisible();
    expect(
      screen.queryByRole("textbox", { name: "Website" }),
    ).not.toBeInTheDocument();
    expect(container.querySelector('input[name="website"]')).toHaveAttribute("aria-hidden", "true");
    expect(container.querySelector('input[name="website"]')).toHaveAttribute("tabindex", "-1");
  });

  it("requires at least one contact method and focuses the error summary", async () => {
    const user = userEvent.setup();
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    render(<OpportunityBriefForm tracking={tracking} />);

    await user.type(screen.getByLabelText("Public profile URL"), "https://example.com");
    await user.click(screen.getByRole("button", { name: "Get my opportunity brief" }));

    const summary = await screen.findByRole("alert");
    expect(summary).toHaveTextContent("Email or WhatsApp number is required.");
    expect(summary).toHaveFocus();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("keeps focus in a field while correcting client validation errors", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("fetch", vi.fn());
    render(<OpportunityBriefForm tracking={tracking} />);

    await user.click(
      screen.getByRole("button", { name: "Get my opportunity brief" }),
    );

    const summary = await screen.findByRole("alert");
    const profileUrl = screen.getByLabelText("Public profile URL");
    expect(summary).toHaveFocus();

    profileUrl.focus();
    for (const character of "https://example.com") {
      await user.type(profileUrl, character);
      expect(profileUrl).toHaveFocus();
      expect(summary).not.toHaveFocus();
    }
  });

  it("shows a disabled loading state while the public request is pending", async () => {
    const user = userEvent.setup();
    let resolveRequest!: (value: Response) => void;
    const fetch = vi.fn(
      () => new Promise<Response>((resolve) => { resolveRequest = resolve; }),
    );
    vi.stubGlobal("fetch", fetch);
    render(<OpportunityBriefForm tracking={tracking} />);
    await fillRequiredFields(user);

    await user.click(screen.getByRole("button", { name: "Get my opportunity brief" }));

    expect(screen.getByRole("button", { name: "Submitting…" })).toBeDisabled();
    resolveRequest(successfulResponse());
    await screen.findByRole("heading", { name: "You’re on our research list." });
  });

  it("focuses a safe error summary and connects returned field errors", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      ok: false,
      error: "Review the Opportunity Brief request.",
      errors: { profileUrl: "Profile URL is invalid." },
    }), { status: 400, headers: { "Content-Type": "application/json" } })));
    render(<OpportunityBriefForm tracking={tracking} />);
    await fillRequiredFields(user);

    await user.click(screen.getByRole("button", { name: "Get my opportunity brief" }));

    const summary = await screen.findByRole("alert");
    expect(summary).toHaveTextContent("Review the Opportunity Brief request.");
    expect(summary).toHaveFocus();
    expect(document.getElementById("profileUrl-error")).toHaveTextContent(
      "Profile URL is invalid.",
    );
    expect(screen.getByLabelText("Public profile URL")).toHaveAttribute("aria-invalid", "true");
  });

  it("keeps focus in a field while correcting a server validation error", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      ok: false,
      error: "Review the Opportunity Brief request.",
      errors: { profileUrl: "Profile URL is invalid." },
    }), { status: 400, headers: { "Content-Type": "application/json" } })));
    render(<OpportunityBriefForm tracking={tracking} />);
    await fillRequiredFields(user);

    await user.click(
      screen.getByRole("button", { name: "Get my opportunity brief" }),
    );

    const summary = await screen.findByRole("alert");
    const profileUrl = screen.getByLabelText("Public profile URL");
    expect(summary).toHaveFocus();

    profileUrl.focus();
    for (const character of "/corrected") {
      await user.type(profileUrl, character);
      expect(profileUrl).toHaveFocus();
      expect(summary).not.toHaveFocus();
    }
  });

  it("focuses the exact success confirmation and shows only the current submission", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("fetch", vi.fn(async () => successfulResponse({
      storedEmail: "private-stored@example.com",
      adminNotes: "private note",
    })));
    render(<OpportunityBriefForm tracking={tracking} />);
    await fillRequiredFields(user);

    await user.click(screen.getByRole("button", { name: "Get my opportunity brief" }));

    const heading = await screen.findByRole("heading", { name: "You’re on our research list." });
    expect(heading).toHaveFocus();
    expect(screen.getByText("We’ll study your profile and look for three partnerships worth exploring. Strong matches may also receive an invitation to join the verified Mewtuals network.")).toBeVisible();
    expect(screen.getByRole("link", { name: "https://example.com/Founder" })).toHaveAttribute(
      "href",
      "https://example.com/Founder",
    );
    expect(screen.getByText("current@example.com")).toBeVisible();
    expect(screen.queryByText("private-stored@example.com")).not.toBeInTheDocument();
    expect(screen.queryByText("private note")).not.toBeInTheDocument();
  });

  it("submits server-provided source and UTM values without authentication or redirects", async () => {
    const user = userEvent.setup();
    const fetch = vi.fn(async () => successfulResponse());
    vi.stubGlobal("fetch", fetch);
    const initialLocation = window.location.href;
    render(<OpportunityBriefForm tracking={tracking} />);
    await user.click(screen.getByRole("radio", { name: "Creator / Podcaster / Media" }));
    await fillRequiredFields(user);

    await user.click(screen.getByRole("button", { name: "Get my opportunity brief" }));
    await screen.findByRole("heading", { name: "You’re on our research list." });

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith("/api/opportunity-briefs", expect.objectContaining({
      method: "POST",
      headers: { "Content-Type": "application/json" },
    }));
    const request = fetch.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(String(request.body))).toEqual({
      participantType: "creator",
      profileUrl: "https://example.com/Founder",
      email: "current@example.com",
      phoneNumber: "",
      openToText: "",
      source: "bengaluru-meetup",
      utm: tracking.utm,
      website: "",
    });
    expect(window.location.href).toBe(initialLocation);
    expect(fetch.mock.calls.some(([path]) => String(path).includes("auth"))).toBe(false);
  });

  it("uses WhatsApp as the sole contact and confirms the normalized current value", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("fetch", vi.fn(async () => successfulResponse({
      submission: {
        participantType: "company",
        profileUrl: "https://example.com/",
        email: null,
        phoneNumber: "+919876543210",
        openToText: null,
        source: null,
        utm: {},
      },
    })));
    render(<OpportunityBriefForm tracking={{ utm: {} }} />);
    await user.type(screen.getByLabelText("Public profile URL"), "https://example.com");
    await user.type(screen.getByLabelText("WhatsApp number (optional)"), "+91 98765 43210");

    await user.click(screen.getByRole("button", { name: "Get my opportunity brief" }));

    await waitFor(() => expect(screen.getByText("+919876543210")).toBeVisible());
  });
});

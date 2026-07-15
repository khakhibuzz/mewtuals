import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { IdentityForm } from "../app/components/product/IdentityForm";
import { LogoutButton } from "../app/components/product/LogoutButton";
import { MagicLinkForm } from "../app/components/product/MagicLinkForm";
import { ProfileConfirmForm } from "../app/components/product/ProfileConfirmForm";
import { SourceForm } from "../app/components/product/SourceForm";
import { VerificationSubmit } from "../app/components/product/VerificationSubmit";

describe("product onboarding forms", () => {
  it("offers exactly two identity choices and every subtype progressively", async () => {
    const user = userEvent.setup();
    render(<IdentityForm />);

    expect(screen.getAllByRole("radio")).toHaveLength(2);
    expect(screen.getByRole("radio", { name: "Organisation" })).toBeVisible();
    expect(screen.getByRole("radio", { name: "Creator" })).toBeVisible();
    expect(screen.getByRole("option", { name: "Company" })).toBeVisible();
    expect(screen.getByRole("option", { name: "Brand" })).toBeVisible();
    expect(screen.getByRole("option", { name: "Startup" })).toBeVisible();
    expect(screen.getByRole("option", { name: "Distribution partner" })).toBeVisible();

    await user.click(screen.getByRole("radio", { name: "Creator" }));
    expect(screen.getByRole("option", { name: "Creator" })).toBeVisible();
    expect(screen.getByRole("option", { name: "Podcaster" })).toBeVisible();
    expect(screen.getByRole("option", { name: "Publication" })).toBeVisible();
    expect(screen.getByRole("option", { name: "Media operator" })).toBeVisible();
  });

  it("shows identity-specific source requirements and linked accessible errors", () => {
    const { rerender } = render(
      <SourceForm
        identityKind="organisation"
        initialValues={{ websiteUrl: "bad" }}
        initialErrors={{ websiteUrl: "Enter a public website URL." }}
      />,
    );
    const website = screen.getByRole("textbox", { name: "Website" });
    expect(website).toBeRequired();
    expect(website).toHaveValue("bad");
    expect(website).toHaveAccessibleDescription("Enter a public website URL.");
    expect(screen.getByRole("textbox", { name: "LinkedIn (optional)" })).not.toBeRequired();

    rerender(<SourceForm identityKind="creator" />);
    expect(screen.getByRole("textbox", { name: "Primary profile URL" })).toBeRequired();
    expect(screen.getByRole("textbox", { name: "Business email (optional)" })).not.toBeRequired();
  });

  it("keeps the generated profile editable and requires confirmation", () => {
    render(
      <ProfileConfirmForm
        draft={{
          name: "Mew Studio",
          organisationName: "Mew Media",
          domain: "example.com",
          identityLabel: "Creator · Podcaster",
          primaryUrl: "https://example.com/mew",
        }}
        initialErrors={{ domain: "Enter a public domain." }}
      />,
    );

    expect(screen.getByRole("textbox", { name: "Display name" })).toHaveValue("Mew Studio");
    expect(screen.getByRole("textbox", { name: "Organisation or creator name" })).toHaveValue("Mew Media");
    expect(screen.getByRole("textbox", { name: "Canonical domain" })).toHaveValue("example.com");
    expect(screen.getByText("Creator · Podcaster")).toBeVisible();
    expect(screen.getByRole("checkbox", { name: /I confirm this profile/i })).toBeRequired();
  });

  it("provides an accessible magic-link success state including the local verify link", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            message: "If that email can sign in, a link is on its way.",
            accepted: true,
            developmentVerifyUrl: "http://localhost:4000/auth/verify?token=local",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );
    render(<MagicLinkForm mode="join" />);

    await user.type(screen.getByRole("textbox", { name: "Email address" }), "member@example.com");
    await user.click(screen.getByRole("button", { name: "Join Mewtuals" }));

    expect(await screen.findByRole("status")).toHaveTextContent("a link is on its way");
    expect(screen.getByRole("link", { name: "Open local sign-in link" })).toHaveAttribute(
      "href",
      "http://localhost:4000/auth/verify?token=local",
    );
    vi.unstubAllGlobals();
  });

  it("labels the final draft to pending action explicitly", () => {
    render(<VerificationSubmit profileName="Mew Studio" />);
    expect(screen.getByRole("button", { name: "Submit for verification" })).toBeVisible();
    expect(screen.getByText(/Mew Studio/)).toBeVisible();
  });

  it("logs out through the protected POST endpoint before leaving the product", async () => {
    const user = userEvent.setup();
    const onLoggedOut = vi.fn();
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true })));
    vi.stubGlobal("fetch", fetchMock);
    render(<LogoutButton onLoggedOut={onLoggedOut} />);

    await user.click(screen.getByRole("button", { name: "Log out" }));

    expect(fetchMock).toHaveBeenCalledWith("/api/auth/logout", { method: "POST" });
    expect(onLoggedOut).toHaveBeenCalledOnce();
    vi.unstubAllGlobals();
  });
});

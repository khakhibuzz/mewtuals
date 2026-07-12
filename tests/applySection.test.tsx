import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ApplySection } from "../app/components/ApplySection";

describe("ApplySection", () => {
  it("asks only for the three definitive application details", () => {
    render(<ApplySection />);

    expect(
      screen.getByText("No deck required. We start with the company itself."),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Company URL")).toBeRequired();
    expect(screen.getByLabelText("Work email")).toBeRequired();
    expect(screen.getByLabelText("Phone number")).toBeRequired();
    expect(screen.getAllByRole("textbox")).toHaveLength(3);
  });

  it("associates required errors with each invalid field", async () => {
    const user = userEvent.setup();
    const submitApplication = vi.fn();
    render(<ApplySection submitApplication={submitApplication} />);

    await user.click(screen.getByRole("button", { name: "Apply for representation" }));

    const summary = screen.getByRole("alert");
    expect(summary).toHaveTextContent("Complete the three required details.");
    expect(summary).toHaveTextContent("Company URL is required.");
    expect(summary).toHaveTextContent("Work email is required.");
    expect(summary).toHaveTextContent("Phone number is required.");
    for (const label of ["Company URL", "Work email", "Phone number"]) {
      const input = screen.getByLabelText(label);
      expect(input).toHaveAttribute("aria-invalid", "true");
      const errorId = input.getAttribute("aria-describedby");
      expect(errorId).toBeTruthy();
      expect(document.getElementById(errorId!)).not.toBeEmptyDOMElement();
    }
    expect(submitApplication).not.toHaveBeenCalled();
  });

  it("announces every field-specific format error in the summary", async () => {
    const user = userEvent.setup();
    render(<ApplySection submitApplication={vi.fn()} />);

    await user.type(
      screen.getByLabelText("Company URL"),
      "https://argide.ai/demo page",
    );
    await user.type(screen.getByLabelText("Work email"), "founder");
    await user.type(screen.getByLabelText("Phone number"), "call-me");
    await user.click(screen.getByRole("button", { name: "Apply for representation" }));

    const summary = screen.getByRole("alert");
    expect(summary).toHaveTextContent("Enter a public company URL.");
    expect(summary).toHaveTextContent("Enter a valid work email.");
    expect(summary).toHaveTextContent(
      "Enter a phone number with 8 to 15 digits.",
    );
  });

  it("submits normalized data through the injected boundary", async () => {
    const user = userEvent.setup();
    const submitApplication = vi.fn().mockResolvedValue(undefined);
    render(<ApplySection submitApplication={submitApplication} />);

    await user.type(screen.getByLabelText("Company URL"), "argide.ai");
    await user.type(
      screen.getByLabelText("Work email"),
      "FOUNDER@ARGIDE.AI",
    );
    await user.type(screen.getByLabelText("Phone number"), "+91 98765 43210");
    await user.click(screen.getByRole("button", { name: "Apply for representation" }));

    await waitFor(() => {
      expect(submitApplication).toHaveBeenCalledWith({
        companyUrl: "https://argide.ai/",
        workEmail: "founder@argide.ai",
        phone: "+919876543210",
      });
    });
    expect(
      screen.getByText("Prototype mode — your information was not sent."),
    ).toBeInTheDocument();
  });

  it("resets the prototype success state for another review", async () => {
    const user = userEvent.setup();
    render(<ApplySection submitApplication={vi.fn().mockResolvedValue(undefined)} />);

    await user.type(screen.getByLabelText("Company URL"), "argide.ai");
    await user.type(screen.getByLabelText("Work email"), "founder@argide.ai");
    await user.type(screen.getByLabelText("Phone number"), "+919876543210");
    await user.click(screen.getByRole("button", { name: "Apply for representation" }));
    await user.click(
      await screen.findByRole("button", { name: "Try another application" }),
    );

    expect(screen.getByLabelText("Company URL")).toHaveFocus();
    expect(screen.getByLabelText("Company URL")).toHaveValue("");
    expect(screen.getByLabelText("Work email")).toHaveValue("");
    expect(screen.getByLabelText("Phone number")).toHaveValue("");
  });
});

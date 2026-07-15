import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { CaseStudies } from "../app/components/CaseStudies";
import { caseStudies } from "../app/data/caseStudies";

describe("CaseStudies", () => {
  it("renders every illustrative case with the complete compact card contract", () => {
    render(<CaseStudies />);

    const cards = screen.getAllByRole("button", { name: /Open case study/ });
    expect(cards).toHaveLength(5);

    caseStudies.forEach((study, index) => {
      const card = within(cards[index]);
      expect(card.getByText("Illustrative case study")).toBeInTheDocument();
      expect(card.getByText(study.opportunityType)).toBeInTheDocument();
      expect(card.getByText(study.title)).toBeInTheDocument();
      expect(card.getByText(study.thesis)).toBeInTheDocument();
      for (const part of Object.values(study.equation)) {
        expect(card.getByText(part)).toBeInTheDocument();
      }
      expect(card.getByText("Open case study")).toBeInTheDocument();
    });

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("opens the complete matching study", async () => {
    const user = userEvent.setup();
    render(<CaseStudies />);

    await user.click(screen.getAllByRole("button", { name: /Open case study/ })[0]);

    const dialog = screen.getByRole("dialog", {
      name: "Resolve the moment of friction",
    });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    for (const heading of [
      "Situation",
      "Signal captured",
      "Hidden leverage",
      "Proposed counterpart",
      "Value exchanged",
      "Smallest two-sided test",
      "Mewtuals’ first approach",
      "30-day execution",
      "Success measures",
      "Risks and trust constraints",
      "Human decision gate",
    ]) {
      expect(within(dialog).getByRole("heading", { name: heading })).toBeInTheDocument();
    }
    expect(within(dialog).getByText(caseStudies[0].firstApproach)).toBeInTheDocument();
  });

  it("locks the page, traps focus, closes with Escape, and restores focus", async () => {
    const user = userEvent.setup();
    render(<CaseStudies />);
    const trigger = screen.getAllByRole("button", { name: /Open case study/ })[0];
    trigger.focus();

    await user.keyboard("{Enter}");
    const back = screen.getByRole("button", { name: "Back to case studies" });
    const apply = screen.getByRole("link", { name: "Apply with this path" });

    await waitFor(() => expect(back).toHaveFocus());
    expect(document.body).toHaveAttribute("data-dialog-open", "true");
    expect(document.body.style.overflow).toBe("hidden");

    await user.tab({ shift: true });
    expect(apply).toHaveFocus();
    await user.tab();
    expect(back).toHaveFocus();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    expect(document.body).not.toHaveAttribute("data-dialog-open");
    expect(document.body.style.overflow).toBe("");
  });

  it("moves focus into the application after choosing a study path", async () => {
    const user = userEvent.setup();
    render(
      <>
        <CaseStudies />
        <label htmlFor="company-url">Company URL</label>
        <input id="company-url" />
      </>,
    );

    await user.click(screen.getAllByRole("button", { name: /Open case study/ })[0]);
    await user.click(screen.getByRole("link", { name: "Apply with this path" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Company URL")).toHaveFocus();
  });
});

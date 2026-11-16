import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BatteryMarket } from "../app/components/battery-atlas/BatteryMarket";
import { BatteryPolicies } from "../app/components/battery-atlas/BatteryPolicies";

describe("Battery purchase catalog", () => {
  it("filters supplier enquiries and preserves indicative pricing", () => {
    render(<BatteryMarket />);
    fireEvent.change(screen.getByLabelText("Purchase route"), { target: { value: "enquiry" } });
    fireEvent.change(screen.getByLabelText("Search products"), { target: { value: "Voltech 24" } });
    const card = screen.getByRole("article", { name: /Voltech custom LFP · 24/ });
    expect(within(card).getByText(/Indicative.*GST extra/)).toBeVisible();
    expect(within(card).getByRole("link", { name: /Enquire with supplier/ })).toHaveAttribute("href", "https://voltechpowersolutions.in/custom-battery-packs");
    expect(screen.getAllByRole("article")).toHaveLength(1);
  });
  it("does not offer an out-of-stock battery as available to buy", () => {
    render(<BatteryMarket />);
    const card = screen.getByRole("article", { name: /Axelium/ });
    expect(within(card).getByText("Out of stock · at review")).toBeVisible();
    expect(within(card).getByRole("link", { name: /Check restock/ })).toHaveAttribute("target", "_blank");
    expect(within(card).queryByRole("link", { name: /View & buy/ })).not.toBeInTheDocument();
  });
  it("recovers from zero search results", () => {
    render(<BatteryMarket />);
    fireEvent.change(screen.getByLabelText("Search products"), { target: { value: "unlisted product xyz" } });
    expect(screen.getByRole("heading", { name: "No matching products" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(screen.getAllByRole("article")).toHaveLength(10);
  });
});
describe("Battery policy watch", () => {
  it("filters policy areas without mixing analysis with government facts", () => {
    render(<BatteryPolicies />);
    fireEvent.click(screen.getByRole("button", { name: "Recycling" }));
    expect(screen.getAllByRole("article")).toHaveLength(2);
    expect(screen.getAllByRole("heading", { name: "Supply-chain impact · Atlas interpretation" })).toHaveLength(2);
    expect(screen.getByText(/not a universal compulsory digital battery passport/)).toBeVisible();
    expect(screen.getByRole("link", { name: /Original Gazette/ })).toHaveAttribute("href", "https://cpcb.nic.in/uploads/hwmd/Battery-WasteManagementRules-2025.pdf");
  });
});

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { BatteryAtlas } from "../app/components/battery-atlas/BatteryAtlas";

describe("India Battery Atlas", () => {
  it("shows sourced research and distinguishes missing supplier evidence from no activity", () => {
    render(<BatteryAtlas />);
    fireEvent.click(screen.getByRole("button", { name: "Flat map" }));
    expect(screen.getByRole("heading", { name: "India" })).toBeVisible();
    expect(screen.getByText(/Selected evidence, not a complete census/i)).toBeVisible();
    expect(screen.queryByText(/0 suppliers/i)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "03 Components" }));
    expect(screen.getByRole("heading", { name: "Components" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: /Read research: Epsilon/ }));
    expect(screen.getByRole("heading", { name: "Epsilon · EAM-ONE" })).toBeVisible();
    expect(screen.getAllByRole("link", { name: /Anode material project/ })[0]).toHaveAttribute("href", expect.stringContaining("epsilonam.com"));
    fireEvent.click(screen.getByRole("button", { name: "06 End uses" }));
    fireEvent.click(screen.getByRole("button", { name: /Read research: Addverb/ }));
    expect(screen.getByText(/do not identify battery chemistry/i)).toBeVisible();
  });

  it("keeps the result list and locality pins scoped to the selected lifecycle stage", () => {
    render(<BatteryAtlas />);
    fireEvent.click(screen.getByRole("button", { name: "Flat map" }));
    fireEvent.click(screen.getByRole("button", { name: "04 Cells" }));
    expect(screen.getByRole("button", { name: /Read research: Agratas/ })).toBeVisible();
    expect(screen.queryByRole("button", { name: /Read research: Amara/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /All stages/ }));
    expect(screen.getByRole("button", { name: /Read research: Amara/ })).toBeVisible();
  });

  it("supports closing and reopening India with the keyboard", () => {
    render(<BatteryAtlas />);
    fireEvent.click(screen.getByRole("button", { name: "Flat map" }));
    fireEvent.click(screen.getByRole("button", { name: "Close country details" }));
    expect(screen.queryByRole("heading", { name: "India" })).not.toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole("button", { name: "Select India on map" }), { key: "Enter" });
    expect(screen.getByRole("heading", { name: "India" })).toBeVisible();
  });

  it("bounds zoom and restores the India view", () => {
    render(<BatteryAtlas />);
    fireEvent.click(screen.getByRole("button", { name: "Flat map" }));
    const zoomIn = screen.getByRole("button", { name: "Zoom in" });
    for (let i = 0; i < 20; i++) fireEvent.click(zoomIn);
    expect(zoomIn).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Reset map" }));
    expect(zoomIn).not.toBeDisabled();
    expect(screen.getByRole("button", { name: "Zoom out" })).toBeDisabled();
  });
  it("explains provenance without presenting an announced import as delivery", () => {
    Element.prototype.scrollIntoView = vi.fn();
    render(<BatteryAtlas />);
    fireEvent.click(screen.getByRole("button", { name: "Flat map" }));
    fireEvent.click(screen.getByRole("button", { name: "An overseas cell sourcing agreement" }));
    expect(screen.getByText(/An announced supplier relationship is not shipment evidence/)).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Open the research record ↗" }));
    expect(screen.getByRole("heading", { name: "Greenfuel–EVE · cell sourcing" })).toBeVisible();
    expect(screen.getByText(/No shipment-level origin/)).toBeVisible();
  });

});

import { render, screen } from "@testing-library/react";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("administrator loading surface", () => {
  it("announces navigation progress without rendering a private snapshot", async () => {
    const loadingSource = join(process.cwd(), "app/admin/loading.tsx");
    const exists = existsSync(loadingSource);

    expect(exists, "app/admin/loading.tsx must exist").toBe(true);
    if (!exists) return;

    const loadingPath = "../app/admin/loading.tsx";
    const loadingModule = await import(/* @vite-ignore */ loadingPath);

    const { container } = render(<loadingModule.default />);
    const status = screen.getByRole("status");

    expect(status).toHaveAttribute("aria-live", "polite");
    expect(status).toHaveTextContent("Loading administrator view…");
    expect(container.querySelector("table, dl, form, ul, ol")).toBeNull();
  });
});

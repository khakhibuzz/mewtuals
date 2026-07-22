import jsQR from "jsqr";
import { PNG } from "pngjs";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import SharePage from "../app/share/page";
import {
  generateShareQrDataUrl,
  SHARE_DESTINATION,
} from "../app/share/share-qr";

describe("conference share QR", () => {
  it("decodes to the public join destination", async () => {
    const dataUrl = await generateShareQrDataUrl();
    const png = PNG.sync.read(Buffer.from(dataUrl.split(",")[1], "base64"));
    const decoded = jsQR(
      new Uint8ClampedArray(png.data),
      png.width,
      png.height,
    );

    expect(SHARE_DESTINATION).toBe("https://mewtuals.com/join");
    expect(decoded?.data).toBe("https://mewtuals.com/join");
  });

  it("presents the join invitation and fallback link", async () => {
    render(await SharePage());

    expect(
      screen.getByRole("heading", { name: "Scan to join Mewtuals" }),
    ).toBeVisible();
    expect(
      screen.getByRole("img", { name: "QR code to join Mewtuals" }),
    ).toBeVisible();
    expect(
      screen.getByRole("link", { name: "mewtuals.com/join" }),
    ).toHaveAttribute("href", "/join");
    expect(
      screen.getByText(
        "One partnership can change a company. Mewtuals helps you find the right one.",
      ),
    ).toBeVisible();
  });
});

import jsQR from "jsqr";
import { PNG } from "pngjs";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import SharePage from "../app/share/page";
import {
  generateShareQrDataUrl,
  SHARE_DESTINATION,
} from "../app/share/share-qr";

function decodeQrDataUrl(dataUrl: string) {
  const png = PNG.sync.read(Buffer.from(dataUrl.split(",")[1], "base64"));

  return jsQR(new Uint8ClampedArray(png.data), png.width, png.height)?.data;
}

describe("conference share QR", () => {
  it("decodes to the public join destination", async () => {
    const dataUrl = await generateShareQrDataUrl();

    expect(SHARE_DESTINATION).toBe("https://mewtuals.com/join");
    expect(decodeQrDataUrl(dataUrl)).toBe(SHARE_DESTINATION);
  });

  it("presents the join invitation and fallback link", async () => {
    render(await SharePage());

    expect(
      screen.getByRole("heading", { name: "Scan to join Mewtuals" }),
    ).toBeVisible();
    const qrImage = screen.getByRole<HTMLImageElement>("img", {
      name: "QR code to join Mewtuals",
    });
    const renderedQrSrc = qrImage.getAttribute("src");

    expect(qrImage).toBeVisible();
    expect(renderedQrSrc).not.toBeNull();
    expect(decodeQrDataUrl(renderedQrSrc ?? "")).toBe(SHARE_DESTINATION);
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

import jsQR from "jsqr";
import { PNG } from "pngjs";
import { describe, expect, it } from "vitest";

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
});

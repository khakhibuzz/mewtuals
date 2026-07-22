import QRCode from "qrcode";

export const SHARE_DESTINATION =
  "https://mewtuals.com/join?source=bengaluru-meetup";

export function generateShareQrDataUrl() {
  return QRCode.toDataURL(SHARE_DESTINATION, {
    errorCorrectionLevel: "M",
    margin: 4,
    width: 768,
    color: { dark: "#11110fff", light: "#ffffffff" },
  });
}

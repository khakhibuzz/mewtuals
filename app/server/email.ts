export type MagicLinkDelivery = {
  email: string;
  verifyUrl: string;
};

export interface EmailSender {
  sendMagicLink(delivery: MagicLinkDelivery): Promise<void>;
}

type EmailEnvironment = "development" | "test" | "production";

type EmailSenderOptions = {
  environment: EmailEnvironment;
  apiKey?: string;
  from?: string;
  fetch?: typeof globalThis.fetch;
};

export function createEmailSender(options: EmailSenderOptions): EmailSender {
  const request = options.fetch ?? globalThis.fetch;
  const hasCredentials = Boolean(options.apiKey && options.from);

  if (options.environment === "production" && !hasCredentials) {
    throw new Error(
      "RESEND_API_KEY and EMAIL_FROM are required for production email delivery.",
    );
  }

  return {
    async sendMagicLink({ email, verifyUrl }) {
      if (!hasCredentials) return;

      const response = await request("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${options.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: options.from,
          to: [email],
          subject: "Your Mewtuals sign-in link",
          html: [
            "<p>Sign in to Mewtuals:</p>",
            `<p><a href="${escapeHtml(verifyUrl)}">Continue to Mewtuals</a></p>`,
            "<p>This link expires in 15 minutes and can only be used once.</p>",
          ].join(""),
        }),
      });

      if (!response.ok) {
        throw new Error(`Resend rejected the magic-link email (${response.status}).`);
      }
    },
  };
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

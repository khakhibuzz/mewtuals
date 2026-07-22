import type {
  AcknowledgementOutcome,
  AcknowledgementSender,
} from "./opportunity-brief-service";

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

type ResendMessage = {
  to: string;
  subject: string;
  html: string;
};

async function sendResendEmail(
  options: EmailSenderOptions,
  message: ResendMessage,
): Promise<Response> {
  const request = options.fetch ?? globalThis.fetch;
  return request("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${options.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: options.from,
      to: [message.to],
      subject: message.subject,
      html: message.html,
    }),
  });
}

export function createEmailSender(options: EmailSenderOptions): EmailSender {
  const hasCredentials = Boolean(options.apiKey && options.from);

  if (options.environment === "production" && !hasCredentials) {
    throw new Error(
      "RESEND_API_KEY and EMAIL_FROM are required for production email delivery.",
    );
  }

  return {
    async sendMagicLink({ email, verifyUrl }) {
      if (!hasCredentials) return;

      const response = await sendResendEmail(options, {
        to: email,
        subject: "Your Mewtuals sign-in link",
        html: [
          "<p>Sign in to Mewtuals:</p>",
          `<p><a href="${escapeHtml(verifyUrl)}">Continue to Mewtuals</a></p>`,
          "<p>This link expires in 15 minutes and can only be used once.</p>",
        ].join(""),
      });

      if (!response.ok) {
        throw new Error(`Resend rejected the magic-link email (${response.status}).`);
      }
    },
  };
}

export function createOpportunityBriefAcknowledgementSender(
  options: EmailSenderOptions,
): AcknowledgementSender {
  const hasCredentials = Boolean(options.apiKey && options.from);

  return {
    async sendAcknowledgement({
      email,
      profileUrl,
    }): Promise<AcknowledgementOutcome> {
      if (!hasCredentials) return { status: "pending" };

      let response: Response;
      try {
        response = await sendResendEmail(options, {
          to: email,
          subject: "Mewtuals is researching your next partnership",
          html: [
            "<p>You’re on our research list.</p>",
            "<p>We received your Opportunity Brief request for:</p>",
            `<p><a href="${escapeHtml(profileUrl)}">${escapeHtml(profileUrl)}</a></p>`,
            "<p>Mewtuals will study your public profile and look for three partnership directions worth exploring.</p>",
            "<p>A later invitation may let you claim this profile and join the Mewtuals network.</p>",
          ].join(""),
        });
      } catch {
        return {
          status: "failed",
          error: "Acknowledgement email transport failed.",
        };
      }

      return response.ok
        ? { status: "sent" }
        : {
            status: "failed",
            error: `Resend rejected the acknowledgement email (${response.status}).`,
          };
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

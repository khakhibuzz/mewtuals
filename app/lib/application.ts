export type ApplicationInput = {
  companyUrl: string;
  workEmail: string;
  phone: string;
};

export type ApplicationErrors = Partial<
  Record<keyof ApplicationInput, string>
>;

export type ApplicationResult =
  | { ok: true; value: ApplicationInput }
  | { ok: false; errors: ApplicationErrors };

export type ApplicationSubmitter = (value: ApplicationInput) => Promise<void>;

type FieldResult =
  | { ok: true; value: string }
  | { ok: false; error: string };

const URL_ERROR = "Enter a public company URL.";
const EMAIL_ERROR = "Enter a valid work email.";
const PHONE_ERROR = "Enter a phone number with 8 to 15 digits.";

function hasPrivateIpv4Address(hostname: string): boolean {
  const octets = hostname.split(".").map(Number);
  if (
    octets.length !== 4 ||
    octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)
  ) {
    return false;
  }

  const [first, second] = octets;
  return (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168)
  );
}

function hasPrivateIpv6Address(hostname: string): boolean {
  if (!hostname.includes(":")) return false;

  if (hostname === "::1") return true;
  const firstHextet = Number.parseInt(hostname.split(":")[0], 16);
  if (!Number.isInteger(firstHextet)) return false;

  return (
    (firstHextet >= 0xfc00 && firstHextet <= 0xfdff) ||
    (firstHextet >= 0xfe80 && firstHextet <= 0xfebf)
  );
}

function hasPrivateHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  return (
    (normalized === "localhost" || normalized.endsWith(".localhost")) ||
    hasPrivateIpv6Address(normalized) ||
    hasPrivateIpv4Address(normalized)
  );
}

export function validateCompanyUrl(input: string): FieldResult {
  const value = input.trim();
  if (/\s/.test(value)) {
    return { ok: false, error: URL_ERROR };
  }

  const scheme = value.match(/^([a-z][a-z\d+.-]*):\/\//i)?.[1];

  if (scheme && !["http", "https"].includes(scheme.toLowerCase())) {
    return { ok: false, error: URL_ERROR };
  }

  try {
    const url = new URL(scheme ? value : `https://${value}`);
    const hostname = url.hostname.replace(/^\[|\]$/g, "");

    if (
      !["http:", "https:"].includes(url.protocol) ||
      !hostname.includes(".") ||
      hasPrivateHostname(hostname) ||
      url.username ||
      url.password
    ) {
      return { ok: false, error: URL_ERROR };
    }

    return { ok: true, value: url.href };
  } catch {
    return { ok: false, error: URL_ERROR };
  }
}

export function validateWorkEmail(input: string): FieldResult {
  const value = input.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
    return { ok: false, error: EMAIL_ERROR };
  }
  return { ok: true, value };
}

export function validatePhone(input: string): FieldResult {
  const value = input.trim();
  if (!/^\+?[\d\s().-]+$/.test(value)) {
    return { ok: false, error: PHONE_ERROR };
  }

  const digits = value.replace(/\D/g, "");
  if (digits.length < 8 || digits.length > 15) {
    return { ok: false, error: PHONE_ERROR };
  }

  return { ok: true, value: `${value.startsWith("+") ? "+" : ""}${digits}` };
}

export function validateApplication(input: ApplicationInput): ApplicationResult {
  const errors: ApplicationErrors = {};

  const companyUrl = input.companyUrl.trim()
    ? validateCompanyUrl(input.companyUrl)
    : { ok: false as const, error: "Company URL is required." };
  const workEmail = input.workEmail.trim()
    ? validateWorkEmail(input.workEmail)
    : { ok: false as const, error: "Work email is required." };
  const phone = input.phone.trim()
    ? validatePhone(input.phone)
    : { ok: false as const, error: "Phone number is required." };

  if (!companyUrl.ok) errors.companyUrl = companyUrl.error;
  if (!workEmail.ok) errors.workEmail = workEmail.error;
  if (!phone.ok) errors.phone = phone.error;

  if (Object.keys(errors).length > 0) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    value: {
      companyUrl: companyUrl.value,
      workEmail: workEmail.value,
      phone: phone.value,
    },
  };
}

export const prototypeSubmitter: ApplicationSubmitter = async () => {
  await Promise.resolve();
};

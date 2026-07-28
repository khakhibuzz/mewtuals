const trackingParameterNames = new Set([
  "dclid",
  "fbclid",
  "gclid",
  "mc_cid",
  "mc_eid",
  "msclkid",
]);

function parseIpv4(hostname: string): number[] | null {
  const octets = hostname.split(".").map(Number);
  if (
    octets.length !== 4 ||
    octets.some(
      (octet) => !Number.isInteger(octet) || octet < 0 || octet > 255,
    )
  ) {
    return null;
  }
  return octets;
}

function isNonGlobalIpv4(hostname: string): boolean {
  const octets = parseIpv4(hostname);
  if (!octets) return false;

  const [first, second, third] = octets;
  return (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    (first === 100 && second >= 64 && second <= 127) ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 0 && (third === 0 || third === 2)) ||
    (first === 192 && second === 168) ||
    (first === 198 && (second === 18 || second === 19)) ||
    (first === 198 && second === 51 && third === 100) ||
    (first === 203 && second === 0 && third === 113) ||
    first >= 224
  );
}

function expandIpv6(address: string): number[] | null {
  const halves = address.split("::");
  if (halves.length > 2) return null;

  const left = halves[0] ? halves[0].split(":") : [];
  const right = halves[1] ? halves[1].split(":") : [];
  const missingGroupCount = 8 - left.length - right.length;
  if (
    (halves.length === 1 && missingGroupCount !== 0) ||
    (halves.length === 2 && missingGroupCount < 1)
  ) {
    return null;
  }

  return [
    ...left,
    ...Array.from({ length: missingGroupCount }, () => "0"),
    ...right,
  ].map((group) => Number.parseInt(group || "0", 16));
}

function ipv6Value(address: string): bigint | null {
  const groups = expandIpv6(address);
  if (!groups || groups.length !== 8) return null;
  return groups.reduce(
    (value, group) => (value << BigInt(16)) | BigInt(group),
    BigInt(0),
  );
}

type Ipv6Cidr = {
  network: string;
  prefixLength: number;
};

// IANA IPv6 Special-Purpose Address Space registry, updated 2025-10-09:
// https://www.iana.org/assignments/iana-ipv6-special-registry/iana-ipv6-special-registry.xhtml
const wellKnownNat64Ipv6Cidr: Ipv6Cidr = {
  network: "64:ff9b::",
  prefixLength: 96,
};

const globallyReachableIpv6Cidrs: readonly Ipv6Cidr[] = [
  wellKnownNat64Ipv6Cidr,
  { network: "2001:1::1", prefixLength: 128 },
  { network: "2001:1::2", prefixLength: 128 },
  { network: "2001:1::3", prefixLength: 128 },
  { network: "2001:3::", prefixLength: 32 },
  { network: "2001:4:112::", prefixLength: 48 },
  { network: "2001:30::", prefixLength: 28 },
];

const nonGlobalIpv6Cidrs: readonly Ipv6Cidr[] = [
  { network: "::", prefixLength: 128 },
  { network: "::1", prefixLength: 128 },
  { network: "::", prefixLength: 96 },
  { network: "::ffff:0:0", prefixLength: 96 },
  { network: "::ffff:0:0:0", prefixLength: 96 },
  { network: "64:ff9b:1::", prefixLength: 48 },
  { network: "100::", prefixLength: 64 },
  { network: "100:0:0:1::", prefixLength: 64 },
  { network: "2001::", prefixLength: 23 },
  { network: "2001:db8::", prefixLength: 32 },
  { network: "2002::", prefixLength: 16 },
  { network: "3fff::", prefixLength: 20 },
  { network: "5f00::", prefixLength: 16 },
  { network: "fc00::", prefixLength: 7 },
  { network: "fe80::", prefixLength: 10 },
  { network: "fec0::", prefixLength: 10 },
  { network: "ff00::", prefixLength: 8 },
];

function isIpv6WithinCidr(address: string, cidr: Ipv6Cidr): boolean {
  const addressValue = ipv6Value(address);
  const networkValue = ipv6Value(cidr.network);
  if (addressValue === null || networkValue === null) return false;

  const suffixLength = BigInt(128 - cidr.prefixLength);
  return addressValue >> suffixLength === networkValue >> suffixLength;
}

function embeddedNat64Ipv4(address: string): string | null {
  if (!isIpv6WithinCidr(address, wellKnownNat64Ipv6Cidr)) return null;

  const groups = expandIpv6(address);
  if (!groups) return null;

  return [
    groups[6] >> 8,
    groups[6] & 0xff,
    groups[7] >> 8,
    groups[7] & 0xff,
  ].join(".");
}

function isNonGlobalIpv6(hostname: string): boolean {
  const address = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  const nat64Ipv4 = embeddedNat64Ipv4(address);
  if (nat64Ipv4 !== null && isNonGlobalIpv4(nat64Ipv4)) return true;
  if (
    globallyReachableIpv6Cidrs.some((cidr) =>
      isIpv6WithinCidr(address, cidr),
    )
  ) {
    return false;
  }
  return nonGlobalIpv6Cidrs.some((cidr) => isIpv6WithinCidr(address, cidr));
}

function assertPublicHostname(hostname: string, label: string): void {
  // This is a literal-address guard only. Fetch boundaries must resolve DNS and
  // revalidate resolved addresses and every redirect target before connecting.
  const normalized = hostname
    .replace(/^\[|\]$/g, "")
    .replace(/\.+$/, "")
    .toLowerCase();
  const privateName =
    normalized === "localhost" ||
    (!normalized.includes(".") && !normalized.includes(":")) ||
    [".home", ".internal", ".lan", ".local", ".localhost"].some((suffix) =>
      normalized.endsWith(suffix),
    );

  if (
    privateName ||
    isNonGlobalIpv4(normalized) ||
    isNonGlobalIpv6(normalized)
  ) {
    throw new Error(`${label} must use a public host.`);
  }
}

export function normalizePublicHttpUrl(
  value: string,
  label = "URL",
): string {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error(`${label} must be a valid absolute URL.`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`${label} must use HTTP or HTTPS.`);
  }
  if (url.username || url.password) {
    throw new Error(`${label} must not contain credentials.`);
  }
  assertPublicHostname(url.hostname, label);
  url.hostname = url.hostname
    .toLowerCase()
    .replace(/^www\./, "")
    .replace(/\.+$/, "");
  url.hash = "";
  for (const key of [...url.searchParams.keys()]) {
    if (
      key.toLowerCase().startsWith("utm_") ||
      trackingParameterNames.has(key.toLowerCase())
    ) {
      url.searchParams.delete(key);
    }
  }
  const retainedParameters = [...url.searchParams.entries()].sort(
    ([leftKey, leftValue], [rightKey, rightValue]) =>
      leftKey.localeCompare(rightKey) || leftValue.localeCompare(rightValue),
  );
  url.search = new URLSearchParams(retainedParameters).toString();
  url.pathname = url.pathname.replace(/\/+$/, "") || "/";
  return url.toString().replace(/\/$/, "");
}

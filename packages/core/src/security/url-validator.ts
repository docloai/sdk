/**
 * URL Validation and SSRF Protection
 *
 * ⚠️ SECURITY CRITICAL: SSRF (Server-Side Request Forgery) Prevention
 *
 * This module blocks URLs that could be used in Server-Side Request Forgery attacks:
 * - Internal IP addresses (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16)
 * - Loopback addresses (127.0.0.0/8, ::1)
 * - Cloud metadata services (AWS, GCP, Aliyun, etc.)
 * - Link-local addresses (169.254.0.0/16)
 *
 * Attack example: An attacker tricks your server to make requests to:
 * - http://169.254.169.254 (AWS credentials endpoint)
 * - http://10.0.0.1:8080/admin (internal service)
 * - http://localhost/api/admin (localhost admin endpoint)
 *
 * Prevents Server-Side Request Forgery attacks by validating URLs against blocklist
 */

/**
 * IP ranges that should be blocked (internal networks)
 * RFC 1918 private ranges + loopback + cloud metadata
 */
const BLOCKED_IP_RANGES = [
  // Loopback
  { start: '127.0.0.0', end: '127.255.255.255' },
  // Private Class A
  { start: '10.0.0.0', end: '10.255.255.255' },
  // Private Class B
  { start: '172.16.0.0', end: '172.31.255.255' },
  // Private Class C
  { start: '192.168.0.0', end: '192.168.255.255' },
  // Link Local
  { start: '169.254.0.0', end: '169.254.255.255' },
];

const BLOCKED_METADATA_HOSTS = [
  '169.254.169.254', // AWS metadata service
  '169.254.169.253', // AWS metadata service (Windows)
  'metadata.google.internal', // GCP metadata service
  'metadata', // GCP alias
  '100.100.100.200', // Aliyun metadata service
  'instance-data', // OpenStack alias
];

/**
 * IPv6 address patterns that should be blocked
 * Prevents SSRF attacks using IPv6 addresses
 */
const BLOCKED_IPV6_PATTERNS = [
  /^::1$/,                  // Loopback (::1)
  /^::$/,                   // Any address (::)
  /^::ffff:/i,              // IPv4-mapped IPv6 (::ffff:0:0/96) - matches ::ffff:127.0.0.1
  /^::ffff:0:/i,            // IPv4-mapped IPv6 alternative
  /^fe80:/i,                // Link-local (fe80::/10)
  /^fec0:/i,                // Site-local deprecated (fec0::/10)
  /^fc00:/i,                // Unique local address (fc00::/7)
  /^fd00:/i,                // Unique local address (fd00::/8)
  /^ff00:/i,                // Multicast (ff00::/8)
  /^0:0:0:0:0:0:0:1$/i,     // Loopback expanded form
];

/**
 * Convert IPv4 string to number for range comparison
 */
function ipToNumber(ip: string): number {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some((p) => p < 0 || p > 255)) {
    return -1;
  }
  return (parts[0] << 24) + (parts[1] << 16) + (parts[2] << 8) + parts[3];
}

/**
 * Check if IP is in blocked range
 */
function isIpInBlockedRange(ip: string): boolean {
  const ipNum = ipToNumber(ip);
  if (ipNum === -1) return false;

  return BLOCKED_IP_RANGES.some((range) => {
    const startNum = ipToNumber(range.start);
    const endNum = ipToNumber(range.end);
    return ipNum >= startNum && ipNum <= endNum;
  });
}

/**
 * Check if IPv6 address is blocked
 * Handles both bracket notation ([::1]) and standard notation (::1)
 */
function isIPv6Blocked(hostname: string): boolean {
  // Remove brackets if present ([::1] -> ::1)
  const addr = hostname.replace(/^\[|\]$/g, '');

  return BLOCKED_IPV6_PATTERNS.some(pattern => pattern.test(addr));
}

/**
 * Validate a URL to prevent SSRF (Server-Side Request Forgery) attacks
 *
 * ⚠️ SECURITY CRITICAL: SSRF Prevention
 *
 * This function blocks URLs that could be used to exploit the server:
 * - Internal IP addresses (breaks firewall perimeter security)
 * - Cloud metadata services (leaks credentials, API keys)
 * - Localhost/loopback (access admin services, debug ports)
 *
 * By default, blocks internal network access automatically.
 *
 * @param urlString - The URL to validate
 * @param options - Validation options
 *   - blockInternal (default: true) - Block internal IP ranges. ⚠️ Set to false only if you understand SSRF risks
 *   - allowedProtocols (default: ['http:', 'https:']) - Restrict to specific protocols
 * @throws Error if URL is invalid, uses blocked protocol, or points to blocked IP/host
 * @returns The validated URL object
 * @security Always validate user-provided URLs. Do not set blockInternal to false without SSRF security review
 *
 * @example
 * ```typescript
 * // Validate user-provided URL
 * try {
 *   const url = validateUrl(userInput);
 *   const response = await fetch(url.toString());
 * } catch (error) {
 *   // URL was malicious or pointed to internal resource
 * }
 * ```
 */
export function validateUrl(
  urlString: string,
  options: {
    blockInternal?: boolean;
    allowedProtocols?: string[];
  } = {}
): URL {
  const {
    blockInternal = true,
    allowedProtocols = ['http:', 'https:'],
  } = options;

  let url: URL;

  try {
    url = new URL(urlString);
  } catch (error) {
    throw new Error(`Invalid URL: ${urlString}`);
  }

  // Check protocol
  if (!allowedProtocols.includes(url.protocol)) {
    throw new Error(
      `Blocked protocol: ${url.protocol}. Allowed: ${allowedProtocols.join(', ')}`
    );
  }

  // Check for internal access if enabled
  if (blockInternal) {
    const hostname = url.hostname;

    // Check blocked metadata hosts
    if (BLOCKED_METADATA_HOSTS.includes(hostname)) {
      throw new Error(`Blocked metadata service: ${hostname}`);
    }

    // Check IPv6 addresses (includes bracket notation)
    if (hostname.includes(':') || hostname.startsWith('[')) {
      if (isIPv6Blocked(hostname)) {
        throw new Error(`Blocked IPv6 address: ${hostname}`);
      }
    }

    // Check if IPv4 is in blocked range
    if (isIpInBlockedRange(hostname)) {
      throw new Error(`Blocked internal IP address: ${hostname}`);
    }

    // Block localhost keyword
    if (hostname === 'localhost') {
      throw new Error('Blocked localhost access');
    }
  }

  return url;
}

/**
 * Fetch a URL with SSRF protection and timeout
 * @param url - The URL to fetch
 * @param timeoutMs - Request timeout in milliseconds (default 30s)
 * @throws Error if URL is invalid, blocked, or request times out
 */
export async function secureFetch(
  url: string,
  timeoutMs: number = 30000
): Promise<Response> {
  // Validate URL first
  const validatedUrl = validateUrl(url);

  // Create abort controller for timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(validatedUrl.toString(), {
      signal: controller.signal,
    });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Extract hostname from URL string for validation
 * Useful for pre-validation checks before full URL parsing
 */
export function getHostnameFromUrl(urlString: string): string {
  try {
    const url = new URL(urlString);
    return url.hostname;
  } catch {
    return '';
  }
}

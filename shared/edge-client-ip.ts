export const EDGE_CLIENT_IP_HEADER = 'x-domain-expansion-client-ip';
export const EDGE_CLIENT_IP_TIME_HEADER = 'x-domain-expansion-client-ip-time';
export const EDGE_CLIENT_IP_SIGNATURE_HEADER = 'x-domain-expansion-client-ip-signature';

const PAYLOAD_VERSION = 'domain-expansion-edge-client-ip:v1';
const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;
const SECRET_PATTERN = /^[a-f\d]{64}$/i;

export async function createEdgeClientIpHeaders(ip: string, secret: string, now: Date): Promise<Record<string, string>> {
  if (!isValidEdgeClientIp(ip)) throw new Error('Invalid client IP address');
  const keyBytes = secretBytes(secret);
  const timestamp = timestampValue(now);
  const payload = new TextEncoder().encode(`${PAYLOAD_VERSION}\n${timestamp}\n${ip}`);
  const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign('HMAC', key, payload);
  return {
    [EDGE_CLIENT_IP_HEADER]: ip,
    [EDGE_CLIENT_IP_TIME_HEADER]: timestamp,
    [EDGE_CLIENT_IP_SIGNATURE_HEADER]: bytesToHex(new Uint8Array(signature)),
  };
}

export async function getVerifiedEdgeClientIp(
  headers: { get(name: string): string | null },
  secret: string | null,
  now: Date,
): Promise<string | null> {
  if (!secret || !SECRET_PATTERN.test(secret)) return null;
  const ip = headers.get(EDGE_CLIENT_IP_HEADER);
  const timestamp = headers.get(EDGE_CLIENT_IP_TIME_HEADER);
  const signature = headers.get(EDGE_CLIENT_IP_SIGNATURE_HEADER);
  if (!ip || !isValidEdgeClientIp(ip) || !timestamp || !/^(0|[1-9]\d{0,15})$/.test(timestamp)) return null;
  if (!signature || !/^[a-f\d]{64}$/i.test(signature)) return null;

  const timestampMs = Number(timestamp);
  const nowMs = now.getTime();
  if (!Number.isSafeInteger(timestampMs) || !Number.isFinite(nowMs) || Math.abs(nowMs - timestampMs) > MAX_CLOCK_SKEW_MS) return null;

  const keyBytes = secretBytes(secret);
  const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
  const payload = new TextEncoder().encode(`${PAYLOAD_VERSION}\n${timestamp}\n${ip}`);
  return await crypto.subtle.verify('HMAC', key, hexToBytes(signature), payload) ? ip : null;
}

export function isValidEdgeClientIp(value: string): boolean {
  if (value.length === 0 || value.length > 45 || value !== value.trim()) return false;
  return isValidIpv4(value) || isValidIpv6(value);
}

function isValidIpv4(value: string): boolean {
  const parts = value.split('.');
  return parts.length === 4 && parts.every((part) => {
    if (!/^(0|[1-9]\d{0,2})$/.test(part)) return false;
    const octet = Number(part);
    return octet <= 255;
  });
}

function isValidIpv6(value: string): boolean {
  if (!value.includes(':') || value.includes('%') || value.includes(':::')) return false;
  let address = value;
  const lastColon = address.lastIndexOf(':');
  const lastDot = address.lastIndexOf('.');
  if (lastDot > lastColon) {
    const separator = address.lastIndexOf(':');
    const embedded = address.slice(separator + 1);
    if (!isValidIpv4(embedded)) return false;
    const octets = embedded.split('.').map(Number);
    const high = ((octets[0] << 8) | octets[1]).toString(16);
    const low = ((octets[2] << 8) | octets[3]).toString(16);
    address = `${address.slice(0, separator)}:${high}:${low}`;
  }

  const compressionIndex = address.indexOf('::');
  if (compressionIndex !== -1 && address.indexOf('::', compressionIndex + 2) !== -1) return false;
  const compressed = compressionIndex !== -1;
  if (!compressed && (address.startsWith(':') || address.endsWith(':'))) return false;
  const left = compressed ? address.slice(0, compressionIndex) : address;
  const right = compressed ? address.slice(compressionIndex + 2) : '';
  if (left.endsWith(':') || right.startsWith(':')) return false;
  const groups = [...(left ? left.split(':') : []), ...(right ? right.split(':') : [])];
  if (groups.some((group) => !/^[a-f\d]{1,4}$/i.test(group))) return false;
  return compressed ? groups.length < 8 : groups.length === 8;
}

function timestampValue(now: Date): string {
  const timestamp = now.getTime();
  if (!Number.isSafeInteger(timestamp) || timestamp < 0) throw new Error('Invalid edge client IP timestamp');
  return String(timestamp);
}

function secretBytes(secret: string): Uint8Array {
  if (!SECRET_PATTERN.test(secret)) throw new Error('EDGE_CLIENT_IP_SECRET must be 64 hexadecimal characters');
  return hexToBytes(secret);
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

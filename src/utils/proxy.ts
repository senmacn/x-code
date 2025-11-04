import { HttpsProxyAgent } from "https-proxy-agent";
import type { Agent } from "http";

export function getProxyAgent(proxyUrl?: string): Agent | undefined {
  if (!proxyUrl) return undefined;
  return new HttpsProxyAgent(proxyUrl);
}
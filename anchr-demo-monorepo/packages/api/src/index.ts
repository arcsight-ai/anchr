/**
 * API package — depends only on @market-os/core public surface.
 */
import { getVersion, formatMessage } from "@market-os/core";

export function apiVersion(): string {
  return getVersion();
}

export function greet(name: string): string {
  return formatMessage(`Hello, ${name}`);
}

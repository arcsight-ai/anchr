import { toId } from "@demo/core";

export function getClient(): unknown {
  return { id: toId("api") };
}

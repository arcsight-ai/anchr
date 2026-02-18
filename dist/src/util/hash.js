import { createHash } from "crypto";
export function sha256Hex(data) {
    return createHash("sha256").update(data, "utf8").digest("hex");
}

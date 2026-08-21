import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Raw Lua source for atomic acquisition of inventory-side seat-segment locks.
 *
 * Keys shape: `inv:lock:seat:{scheduleId}:{seatInventoryId}:{fromSequence}:{toSequence}`.
 *
 * @returns The script body as a UTF-8 string, ready to pass to `redis.eval(...)`.
 */
export const seatLockLua: string = fs.readFileSync(
  path.resolve(__dirname, "./seat-lock.lua"),
  "utf8",
);

/**
 * Raw Lua source for ownership-checked release of inventory-side seat-segment locks.
 *
 * Iterates each key in `KEYS`, reads the current value, and only `DEL`s the key
 * if it still equals the caller-supplied `lockToken`. Returns the number of
 * locks actually released (a stale caller whose TTL expired will see 0).
 *
 * @returns The script body as a UTF-8 string, ready to pass to `redis.eval(...)`.
 */
export const seatUnlockLua: string = fs.readFileSync(
  path.resolve(__dirname, "./seat-unlock.lua"),
  "utf8",
);

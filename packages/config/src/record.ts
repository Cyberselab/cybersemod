import { ConfigError } from "./errors.js";

export type ConfigRecord = Record<string, unknown>;
const unsafe = new Set(["__proto__", "constructor", "prototype"]);
export const isSafeSegment = (value: string): boolean => value.length > 0 && !unsafe.has(value.toLowerCase());

export function isConfigRecord(value: unknown): value is ConfigRecord {
  if (typeof value !== "object" || value === null) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function clone(value: unknown, ancestors = new Set<object>()): unknown {
  if (value === null || typeof value !== "object") return value;
  if (ancestors.has(value) || (!Array.isArray(value) && !isConfigRecord(value))) {
    throw new ConfigError("CONFIG_VALUE_INVALID", "Configuration must contain acyclic plain data");
  }
  ancestors.add(value);
  let result: unknown;
  if (Array.isArray(value)) {
    result = value.map((item) => clone(item, ancestors));
  } else {
    const record: ConfigRecord = {};
    for (const [key, child] of Object.entries(value)) {
      if (!isSafeSegment(key)) throw new ConfigError("CONFIG_VALUE_INVALID", "Unsafe configuration key");
      record[key] = clone(child, ancestors);
    }
    result = record;
  }
  ancestors.delete(value);
  return result;
}

export function mergeConfigRecords(base: ConfigRecord, override: ConfigRecord): ConfigRecord {
  if (!isConfigRecord(base) || !isConfigRecord(override)) {
    throw new ConfigError("CONFIG_VALUE_INVALID", "Configuration root must be a plain object");
  }
  const result = clone(base) as ConfigRecord;
  const safeOverride = clone(override) as ConfigRecord;
  for (const [key, value] of Object.entries(safeOverride)) {
    const previous = Object.hasOwn(result, key) ? result[key] : undefined;
    result[key] = isConfigRecord(previous) && isConfigRecord(value)
      ? mergeConfigRecords(previous, value) : value;
  }
  return result;
}

export function setConfigPath(
  record: ConfigRecord, path: readonly string[], value: string, source: "ENV" | "FLAG",
): void {
  if (path.length === 0 || path.some((segment) => !isSafeSegment(segment))) {
    throw new ConfigError(`CONFIG_${source}_KEY_INVALID`, "Invalid configuration field path");
  }
  let current = record;
  for (const [index, segment] of path.entries()) {
    const previous = Object.hasOwn(current, segment) ? current[segment] : undefined;
    if (index === path.length - 1) {
      if (isConfigRecord(previous)) {
        throw new ConfigError(`CONFIG_${source}_KEY_CONFLICT`, "Configuration field path conflicts with an object");
      }
      current[segment] = value;
    } else {
      if (previous !== undefined && !isConfigRecord(previous)) {
        throw new ConfigError(`CONFIG_${source}_KEY_CONFLICT`, "Configuration field path conflicts with a scalar");
      }
      if (previous === undefined) current[segment] = {};
      current = current[segment] as ConfigRecord;
    }
  }
}

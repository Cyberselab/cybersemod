import { ConfigError } from "./errors.js";
import { isSafeSegment, setConfigPath, type ConfigRecord } from "./record.js";

function setFlag(result: ConfigRecord, key: string, value: string): void {
  if (key.split(".").some((part) => !isSafeSegment(part))) {
    throw new ConfigError("CONFIG_FLAG_KEY_INVALID", "Invalid configuration field path");
  }
  const path = key.split(".").map((part) => part.toLowerCase()
    .replace(/[-_]([a-z0-9])/g, (_, letter: string) => letter.toUpperCase()));
  setConfigPath(result, path, value, "FLAG");
}

/** Explicit --set path=value entries. Values remain strings. */
export function readSetConfig(entries: readonly string[]): ConfigRecord {
  const result: ConfigRecord = {};
  for (const entry of entries) {
    const separator = entry.indexOf("=");
    if (separator < 1) throw new ConfigError("CONFIG_FLAG_KEY_INVALID", "Expected a configuration assignment path=value");
    setFlag(result, entry.slice(0, separator), entry.slice(separator + 1));
  }
  return result;
}

/** Payboy compatibility parser. Call only with arguments owned by configuration. */
export function readFlagConfig(argv: readonly string[]): ConfigRecord {
  const result: ConfigRecord = {};
  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index]!;
    if (argument === "--") break;
    if (!argument.startsWith("--")) continue;
    const separator = argument.indexOf("=");
    let key = argument.slice(2, separator < 0 ? undefined : separator);
    const negated = separator < 0 && key.startsWith("no-");
    if (negated) key = key.slice(3);
    let value = separator < 0 ? undefined : argument.slice(separator + 1);
    if (value === undefined && !negated && argv[index + 1] !== undefined && !argv[index + 1]!.startsWith("-")) {
      value = argv[++index];
    }
    setFlag(result, key, value ?? (negated ? "false" : "true"));
  }
  return result;
}

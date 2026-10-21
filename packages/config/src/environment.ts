import { ConfigError } from "./errors.js";
import { setConfigPath, type ConfigRecord } from "./record.js";

export type Environment = Readonly<Record<string, string | undefined>>;

export function readEnvironmentConfig(environment: Environment, prefix: string): ConfigRecord {
  if (!/^[A-Z0-9_]+$/.test(prefix)) {
    throw new ConfigError("CONFIG_ENV_PREFIX_INVALID", "Environment prefix must contain uppercase letters, digits or underscores");
  }
  const result: ConfigRecord = {};
  for (const [key, value] of Object.entries(environment).sort(([a], [b]) => a.localeCompare(b))) {
    if (!key.startsWith(`${prefix}__`) || value === undefined) continue;
    const path = key.slice(prefix.length + 2).split("__")
      .map((segment) => segment.toLowerCase().replace(/_([a-z0-9])/g, (_, letter: string) => letter.toUpperCase()));
    setConfigPath(result, path, value, "ENV");
  }
  return result;
}

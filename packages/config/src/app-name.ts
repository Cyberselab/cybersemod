import { ConfigError } from "./errors.js";

export type AppName = `@${string}/${string}`;
export type ConfigFileFormat = "json" | "yaml" | "yml" | "toml";

export function validateAppName(appName: string): AppName {
  if (!/^@[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._-]*$/.test(appName)) {
    throw new ConfigError("CONFIG_APP_NAME_INVALID", "Expected a lowercase scoped application name");
  }
  return appName as AppName;
}

export function parseAppName(appName: string): { scope: string; name: string } {
  validateAppName(appName);
  const separator = appName.indexOf("/");
  return { scope: appName.slice(1, separator), name: appName.slice(separator + 1) };
}

export function getEnvironmentPrefix(appName: string): string {
  const { scope, name } = parseAppName(appName);
  const normalize = (value: string) => value.toUpperCase().replace(/[^A-Z0-9]+/g, "_");
  return `${normalize(scope)}__${normalize(name)}`;
}

export function getConfigFileName(appName: string, format: ConfigFileFormat): string {
  const { scope, name } = parseAppName(appName);
  return `${scope}/${name}.${format}`;
}

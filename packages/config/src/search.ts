import { stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { parseAppName } from "./app-name.js";
import { ConfigError } from "./errors.js";

export interface ConfigSearchDirectories { current?: string; home?: string; system?: string }

export function getConfigFileSearchPaths(appName: string, directories: ConfigSearchDirectories = {}): string[] {
  const { scope, name } = parseAppName(appName);
  const bases = [join(directories.system ?? "/etc", scope), join(directories.home ?? homedir(), `.${scope}`), directories.current ?? process.cwd()];
  return bases.flatMap((base) => ["json", "yaml", "toml"].map((format) => join(base, `${name}.${format}`)));
}

export async function findConfigFile(appName: string, directories: ConfigSearchDirectories = {}): Promise<string> {
  for (const path of getConfigFileSearchPaths(appName, directories).reverse()) {
    try {
      if (!(await stat(path)).isFile()) throw new Error("Configuration candidate is not a regular file");
      return path;
    } catch (error) {
      if (["ENOENT", "ENOTDIR"].includes((error as NodeJS.ErrnoException).code ?? "")) continue;
      throw new ConfigError("CONFIG_FILE_READ_FAILED", "Unable to inspect configuration candidate", error);
    }
  }
  throw new ConfigError("CONFIG_FILE_NOT_FOUND", "No configuration file found");
}

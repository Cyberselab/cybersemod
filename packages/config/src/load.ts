import { resolve } from "node:path";
import { getEnvironmentPrefix, validateAppName } from "./app-name.js";
import { readDotEnvFiles } from "./dotenv.js";
import { readEnvironmentConfig, type Environment } from "./environment.js";
import { ConfigError } from "./errors.js";
import { readConfigFile } from "./file.js";
import { mergeConfigRecords, type ConfigRecord } from "./record.js";
import { findConfigFile, type ConfigSearchDirectories } from "./search.js";

export interface ConfigSchema<T> { parse(input: unknown): T }
export interface LoadConfigOptions<T> {
  appName: string;
  schema: ConfigSchema<T>;
  file?: { path?: string | undefined; required?: boolean };
  environment?: Environment;
  environmentPrefix?: string;
  flags?: ConfigRecord;
  directories?: ConfigSearchDirectories;
  dotenv?: boolean;
}

export async function loadConfig<T>(options: LoadConfigOptions<T>): Promise<T> {
  validateAppName(options.appName);
  const current = options.directories?.current ?? process.cwd();
  let path = options.file?.path;
  if (path !== undefined) path = resolve(current, path);
  else {
    try { path = await findConfigFile(options.appName, options.directories); }
    catch (error) {
      if (!(error instanceof ConfigError && error.code === "CONFIG_FILE_NOT_FOUND" && options.file?.required === false)) throw error;
    }
  }
  const file = path === undefined ? {} : await readConfigFile(path);
  const environment = options.environment ?? { ...process.env };
  const combined = options.dotenv === false ? environment : await readDotEnvFiles(current, environment);
  const env = readEnvironmentConfig(combined, options.environmentPrefix ?? getEnvironmentPrefix(options.appName));
  return options.schema.parse(mergeConfigRecords(mergeConfigRecords(file, env), options.flags ?? {}));
}

import { readFile } from "node:fs/promises";
import { extname } from "node:path";
import { parse as parseToml } from "smol-toml";
import { parse as parseYaml } from "yaml";
import { ConfigError } from "./errors.js";
import { isConfigRecord, mergeConfigRecords, type ConfigRecord } from "./record.js";

export async function readConfigFile(path: string): Promise<ConfigRecord> {
  const format = extname(path).toLowerCase();
  if (![".json", ".yaml", ".yml", ".toml"].includes(format)) {
    throw new ConfigError("CONFIG_FILE_FORMAT_UNSUPPORTED", "Unsupported configuration format");
  }
  let content: string;
  try { content = await readFile(path, "utf8"); }
  catch (error) { throw new ConfigError("CONFIG_FILE_READ_FAILED", "Unable to read configuration file", error); }
  let parsed: unknown;
  try {
    parsed = format === ".json" ? JSON.parse(content)
      : format === ".toml" ? parseToml(content) : parseYaml(content);
  } catch (error) {
    throw new ConfigError("CONFIG_FILE_PARSE_FAILED", "Unable to parse configuration file", error);
  }
  if (!isConfigRecord(parsed)) {
    throw new ConfigError("CONFIG_FILE_ROOT_INVALID", "Configuration file root must be a plain object");
  }
  return mergeConfigRecords({}, parsed);
}

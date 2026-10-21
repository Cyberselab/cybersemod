import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { parse } from "dotenv";
import { ConfigError } from "./errors.js";
import type { Environment } from "./environment.js";

export async function readDotEnvFiles(
  directory = process.cwd(), environment: Environment = process.env,
): Promise<Environment> {
  const mode = environment.NODE_ENV;
  if (mode !== undefined && !/^[a-z0-9][a-z0-9_-]*$/i.test(mode)) {
    throw new ConfigError("CONFIG_ENV_MODE_INVALID", "Invalid dotenv environment mode");
  }
  const names = [".env", ".env.local"];
  if (mode !== undefined) names.push(`.env.${mode}`, `.env.${mode}.local`);
  let result: Record<string, string | undefined> = {};
  for (const name of names) {
    try {
      result = { ...result, ...parse(await readFile(join(directory, name), "utf8")) };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
      throw new ConfigError("CONFIG_ENV_FILE_READ_FAILED", "Unable to read dotenv file", error);
    }
  }
  // An undefined process entry is absent, not an override of a dotenv value.
  for (const [key, value] of Object.entries(environment)) if (value !== undefined) result[key] = value;
  return result;
}

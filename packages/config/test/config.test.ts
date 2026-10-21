import { afterEach, describe, expect, expectTypeOf, test } from "bun:test";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { z } from "zod";
import { loadConfig } from "../src/load.js";
import { getConfigFileName, getEnvironmentPrefix, validateAppName } from "../src/app-name.js";
import { readConfigFile } from "../src/file.js";
import { findConfigFile, getConfigFileSearchPaths } from "../src/search.js";
import { readDotEnvFiles } from "../src/dotenv.js";
import { readEnvironmentConfig } from "../src/environment.js";
import { readFlagConfig, readSetConfig } from "../src/flags.js";
import { mergeConfigRecords } from "../src/record.js";
import { ConfigError } from "../src/errors.js";

const directories: string[] = [];
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "cybersemod-config-"));
  directories.push(root);
  const current = join(root, "current"), home = join(root, "home"), system = join(root, "system");
  await Promise.all([mkdir(current), mkdir(home), mkdir(system)]);
  return { root, current, home, system };
}
afterEach(async () => {
  for (const directory of directories.splice(0)) {
    const path = resolve(directory);
    if (!path.startsWith(resolve(tmpdir()) + sep) || !path.includes("cybersemod-config-")) throw new Error("Unsafe test cleanup");
    await rm(path, { recursive: true, force: true });
  }
});
const identity = { parse: (value: unknown) => value };

describe("identity and discovery", () => {
  test("maps scoped identities and rejects invalid names", () => {
    expect(getEnvironmentPrefix("@payboy/chain-observer")).toBe("PAYBOY__CHAIN_OBSERVER");
    expect(getConfigFileName("@payboy/server", "toml")).toBe("payboy/server.toml");
    for (const name of ["payboy", "@Payboy/server", "@a/../x", "@a/", "@/b"]) {
      expect(() => validateAppName(name)).toThrow(ConfigError);
    }
  });
  test("selects exactly one file by directory then format; yml is explicit only", async () => {
    const paths = await fixture();
    const candidates = getConfigFileSearchPaths("@demo/server", paths);
    expect(candidates).toHaveLength(9);
    for (const path of candidates) {
      await mkdir(resolve(path, ".."), { recursive: true });
      await writeFile(path, path.endsWith(".toml") ? "selected = true" : '{"lowerOnly":true}');
    }
    expect(await findConfigFile("@demo/server", paths)).toBe(join(paths.current, "server.toml"));
    expect(await loadConfig({ appName: "@demo/server", schema: identity, directories: paths, environment: {}, dotenv: false })).toEqual({ selected: true });
  });
  test("does not fall back when highest candidate is malformed or a directory", async () => {
    const paths = await fixture();
    await writeFile(join(paths.current, "server.json"), "{}");
    await writeFile(join(paths.current, "server.toml"), "broken = [");
    await expect(loadConfig({ appName: "@demo/server", schema: identity, directories: paths })).rejects.toMatchObject({ code: "CONFIG_FILE_PARSE_FAILED" });
    await mkdir(join(paths.current, "server.yaml"));
    await rm(join(paths.current, "server.toml"));
    await expect(findConfigFile("@demo/server", paths)).rejects.toMatchObject({ code: "CONFIG_FILE_READ_FAILED" });
  });
});

describe("configuration sources", () => {
  test("merges file < dotenv < mode < process < flags with schema transformations", async () => {
    const paths = await fixture();
    await writeFile(join(paths.current, "server.json"), JSON.stringify({ database: { url: "file", poolSize: 1 }, enabled: true, port: 1 }));
    await writeFile(join(paths.current, ".env"), "DEMO__SERVER__PORT=2\nDEMO__SERVER__DATABASE__URL=dotenv");
    await writeFile(join(paths.current, ".env.local"), "DEMO__SERVER__PORT=3");
    await writeFile(join(paths.current, ".env.test"), "DEMO__SERVER__PORT=4");
    await writeFile(join(paths.current, ".env.test.local"), "DEMO__SERVER__PORT=5");
    const schema = z.object({
      port: z.coerce.number(),
      enabled: z.preprocess((value) => value === "false" ? false : value, z.boolean()),
      database: z.object({ url: z.string(), poolSize: z.coerce.number() }),
    });
    const environment = { NODE_ENV: "test", DEMO__SERVER__PORT: "6", DEMO__SERVER__DATABASE__POOL_SIZE: "10", OTHER__SERVER__PORT: "99" };
    const result = await loadConfig({ appName: "@demo/server", schema, directories: paths, environment, flags: { port: "7", enabled: "false" } });
    expect(result).toEqual({ port: 7, enabled: false, database: { url: "dotenv", poolSize: 10 } });
    expectTypeOf(result.port).toEqualTypeOf<number>();
    expect(environment.DEMO__SERVER__PORT).toBe("6");
    expect((await readDotEnvFiles(paths.current, { NODE_ENV: "test" })).DEMO__SERVER__PORT).toBe("5");
    expect((await readDotEnvFiles(paths.current, {})).DEMO__SERVER__PORT).toBe("3");
  });
  test("does not let dotenv choose mode or modify process environment", async () => {
    const paths = await fixture();
    const before = process.env.CYBERSEMOD_TEST_UNIQUE;
    await writeFile(join(paths.current, ".env"), "NODE_ENV=production\nCYBERSEMOD_TEST_UNIQUE=file");
    await writeFile(join(paths.current, ".env.production"), "CYBERSEMOD_TEST_UNIQUE=mode");
    expect((await readDotEnvFiles(paths.current, {})).CYBERSEMOD_TEST_UNIQUE).toBe("file");
    expect(process.env.CYBERSEMOD_TEST_UNIQUE).toBe(before);
    await expect(readDotEnvFiles(paths.current, { NODE_ENV: "../../escape" })).rejects.toMatchObject({ code: "CONFIG_ENV_MODE_INVALID" });
  });
  test("optional file allows env-only config; explicit path never falls back", async () => {
    const paths = await fixture();
    const options = { appName: "@demo/server", schema: z.object({ port: z.coerce.number() }), directories: paths, environment: { DEMO__SERVER__PORT: "8" } };
    await expect(loadConfig(options)).rejects.toMatchObject({ code: "CONFIG_FILE_NOT_FOUND" });
    expect(await loadConfig({ ...options, file: { required: false } })).toEqual({ port: 8 });
    await expect(loadConfig({ ...options, file: { path: "missing.json", required: false } })).rejects.toMatchObject({ code: "CONFIG_FILE_READ_FAILED" });
  });
  test("custom prefix, relative explicit file, disabled dotenv and defaults", async () => {
    const paths = await fixture();
    await writeFile(join(paths.current, "custom.json"), "{}");
    await writeFile(join(paths.current, ".env"), "CUSTOM__PORT=99");
    const result = await loadConfig({ appName: "@demo/server", schema: z.object({ port: z.coerce.number().default(42) }), file: { path: "custom.json" }, directories: paths, environmentPrefix: "CUSTOM", environment: {}, dotenv: false });
    expect(result.port).toBe(42);
    expect(readEnvironmentConfig({ CUSTOM__PORT: "9" }, "CUSTOM")).toEqual({ port: "9" });
  });
  test("preserves original schema errors", async () => {
    const paths = await fixture();
    const error = new Error("validation sentinel");
    await expect(loadConfig({ appName: "@demo/server", schema: { parse() { throw error; } }, file: { required: false }, directories: paths, environment: {} })).rejects.toBe(error);
  });
});

describe("formats and safe merge", () => {
  for (const [extension, content] of [["json", '{"port":8}'], ["yaml", "port: 8"], ["yml", "port: 8"], ["toml", "port = 8"]]) {
    test(`reads ${extension}`, async () => {
      const paths = await fixture();
      const path = join(paths.current, `config.${extension}`);
      await writeFile(path, content!);
      expect(await readConfigFile(path)).toEqual({ port: 8 });
    });
  }
  test("reports format, parse and root errors without leaking contents", async () => {
    const paths = await fixture();
    const path = join(paths.current, "bad.json");
    await writeFile(path, "secret-value");
    try { await readConfigFile(path); throw new Error("expected rejection"); }
    catch (error) { expect(error).toMatchObject({ code: "CONFIG_FILE_PARSE_FAILED" }); expect((error as Error).message).not.toContain("secret-value"); }
    await writeFile(path, "[]");
    await expect(readConfigFile(path)).rejects.toMatchObject({ code: "CONFIG_FILE_ROOT_INVALID" });
    await expect(readConfigFile(join(paths.current, "config.ini"))).rejects.toMatchObject({ code: "CONFIG_FILE_FORMAT_UNSUPPORTED" });
  });
  test("deep merges objects, replaces arrays and null, and owns its output", () => {
    const base = { nested: { keep: 1 }, list: [{ x: 1 }], nullable: { a: 1 } };
    const override = { nested: { add: 2 }, list: [{ x: 2 }], nullable: null };
    const result = mergeConfigRecords(base, override);
    expect(result).toEqual({ nested: { keep: 1, add: 2 }, list: [{ x: 2 }], nullable: null });
    (result.list as { x: number }[])[0]!.x = 9;
    expect(override.list[0]!.x).toBe(2);
    expect(base.list[0]!.x).toBe(1);
  });
  test("blocks unsafe keys in files, arrays, flags and environment", async () => {
    const paths = await fixture();
    const path = join(paths.current, "bad.json");
    for (const key of ["__proto__", "constructor", "prototype"]) {
      await writeFile(path, `{"list":[{"${key}":{}}]}`);
      await expect(readConfigFile(path)).rejects.toMatchObject({ code: "CONFIG_VALUE_INVALID" });
      expect(() => readSetConfig([`${key}.x=1`])).toThrow(ConfigError);
    }
    expect(() => readEnvironmentConfig({ DEMO__CONSTRUCTOR__X: "1" }, "DEMO")).toThrow(ConfigError);
    expect(() => mergeConfigRecords({}, { bad: new Date() })).toThrow(ConfigError);
    const cyclic: Record<string, unknown> = {}; cyclic.self = cyclic;
    expect(() => mergeConfigRecords({}, cyclic)).toThrow(ConfigError);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
});

describe("configuration arguments", () => {
  test("set keeps equals, empty and negative values; last duplicate wins", () => {
    expect(readSetConfig(["database.pool-size=10", "token=a=b", "empty=", "offset=-1", "offset=-2"]))
      .toEqual({ database: { poolSize: "10" }, token: "a=b", empty: "", offset: "-2" });
  });
  test("legacy flags preserve Payboy boolean and terminator semantics", () => {
    expect(readFlagConfig(["serve", "--port", "3", "--feature-enabled", "--no-cache", "--offset=-1", "--", "--ignored=1"]))
      .toEqual({ port: "3", featureEnabled: "true", cache: "false", offset: "-1" });
  });
  test("rejects conflicting paths in either order and invalid assignments", () => {
    for (const values of [["a=1", "a.b=2"], ["a.b=2", "a=1"], ["a..b=2"], ["missing"]]) {
      expect(() => readSetConfig(values)).toThrow(ConfigError);
    }
    expect(() => readEnvironmentConfig({ DEMO__A: "1", DEMO__A__B: "2" }, "DEMO")).toThrow(ConfigError);
    expect(() => readEnvironmentConfig({}, "")).toThrow(ConfigError);
  });
});

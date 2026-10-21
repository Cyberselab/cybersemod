import { describe, expect, expectTypeOf, test } from "bun:test";
import { z } from "zod";
import { createCliApp, runCli } from "../src/app.js";
import { defineCommand } from "../src/command.js";
import { loadCommandConfig, withConfig } from "../src/config.js";
import { formatBuildInfo } from "../src/build-info.js";
import { join } from "node:path";

const base = { name: "demo", description: "Demo application" };
const schema = z.object({ port: z.coerce.number().default(3000) });
const missingDirectory = join(import.meta.dir, "nonexistent-fixture-directory");
const configOptions = { appName: "@demo/server", schema, file: { required: false }, environment: {}, dotenv: false,
  directories: { current: missingDirectory, home: missingDirectory, system: missingDirectory },
};
async function run(app: ReturnType<typeof createCliApp>, argv: string[]) {
  let stdout = "", stderr = "";
  const code = await runCli(app, { argv, stdout: (text) => { stdout += text; }, stderr: (text) => { stderr += text; } });
  return { code, stdout, stderr };
}

describe("Commander application conventions", () => {
  test("registers useXxxCommand functions and loads only the selected action", async () => {
    let imports = 0;
    let result: unknown;
    const useGreetCommand = defineCommand<{ upper?: boolean }>({
      name: "greet <name>", description: "Greet someone",
      configure: (command) => { command.option("-u, --upper", "Uppercase"); },
      loadAction: async () => {
        imports++;
        return async ({ args, options }) => { result = { args, options }; };
      },
    });
    const make = () => createCliApp({ ...base, commands: [useGreetCommand] });
    expect((await run(make(), ["greet", "--help"])).code).toBe(0);
    expect(imports).toBe(0);
    expect((await run(make(), ["greet", "Ada", "-u"])).code).toBe(0);
    expect(imports).toBe(1);
    expect(result).toEqual({ args: ["Ada"], options: { upper: true } });
  });
  test("help and version require neither configuration nor action imports", async () => {
    let calls = 0;
    const make = () => {
      const app = createCliApp({ ...base, buildInfo: { version: "1.2.3", branch: "main", commit: "abc" } });
      app.command("serve").action(withConfig({ ...configOptions, file: { path: "absent.json" } }, () => { calls++; }));
      return app;
    };
    const help = await run(make(), ["serve", "--help"]);
    expect(help.code).toBe(0);
    expect(help.stdout).toContain("Build: 1.2.3 (main@abc)");
    const version = await run(make(), ["--version"]);
    expect(version).toEqual({ code: 0, stdout: "1.2.3 (main@abc)\n", stderr: "" });
    expect(calls).toBe(0);
    expect(formatBuildInfo({ version: "0.1.0" })).toBe("0.1.0 (unknown@unknown)");
  });
  test("legacy help does not parse or validate configuration flags", async () => {
    const app = createCliApp({ ...base, legacyFlags: true });
    app.command("serve").action(withConfig(configOptions, () => { throw new Error("must not run"); }));
    expect((await run(app, ["serve", "--help", "--constructor.x=secret"])).code).toBe(0);
  });
  test("strict mode rejects unknown flags and misspelled commands before actions", async () => {
    let calls = 0;
    const make = () => {
      const app = createCliApp(base);
      app.command("serve").action(() => { calls++; });
      return app;
    };
    for (const argv of [["serve", "--prot=4"], ["srve"], ["serve", "extra"]]) {
      expect((await run(make(), argv)).code).toBe(2);
    }
    expect(calls).toBe(0);
  });
  test("business failures return 1 without exposing errors; input failures return 2", async () => {
    const app = createCliApp(base);
    app.command("fail").action(() => { throw new Error("secret-credential"); });
    const result = await run(app, ["fail"]);
    expect(result.code).toBe(1);
    expect(result.stderr).not.toContain("secret-credential");
    const input = createCliApp(base);
    input.command("serve").action(withConfig(configOptions, () => {}));
    const invalid = await run(input, ["serve", "--set", "port=secret-value"]);
    expect(invalid.code).toBe(2);
    expect(invalid.stderr).toContain("validation failed");
    expect(invalid.stderr).not.toContain("secret-value");
  });
  test("enforces fresh application instances and reserved global options", async () => {
    const app = createCliApp(base);
    expect((await run(app, ["--help"])).code).toBe(0);
    expect((await run(app, ["--help"])).code).toBe(2);
    const conflict = createCliApp(base);
    conflict.command("serve").option("--set <value>");
    expect((await run(conflict, ["serve"])).stderr).toContain("reserved");
  });
});

describe("configuration adapter and argument ownership", () => {
  test("set works before and after nested commands, apart from business options", async () => {
    const app = createCliApp(base);
    let result: unknown;
    app.command("create").command("tenant <id>").option("--name <name>")
      .action(withConfig(configOptions, ({ config, options, args }) => {
        expectTypeOf(config.port).toEqualTypeOf<number>();
        result = { config, options, args };
      }));
    const execution = await run(app, ["--set", "port=4000", "create", "tenant", "id1", "--name", "Ada", "--set", "port=5000"]);
    expect(execution.code).toBe(0);
    expect(result).toEqual({ config: { port: 5000 }, options: { name: "Ada" }, args: ["id1"] });
  });
  test("explicit missing file fails and --config is never a configuration field", async () => {
    const app = createCliApp(base);
    app.command("serve").action(withConfig(configOptions, () => { throw new Error("must not run"); }));
    const execution = await run(app, ["serve", "--config", "missing.json"]);
    expect(execution.code).toBe(2);
    expect(execution.stderr).toContain("CONFIG_FILE_READ_FAILED");
  });
  test("legacy mode separates business flags, aliases, short values and configuration flags", async () => {
    const app = createCliApp({ ...base, legacyFlags: true });
    let result: unknown;
    const fullSchema = z.object({ port: z.coerce.number(), cache: z.string(), offset: z.coerce.number() });
    app.command("serve <id>").alias("s").option("-n, --name <value>").option("-v, --verbose")
      .action(withConfig({ ...configOptions, schema: fullSchema }, ({ config, options, args }) => { result = { config, options, args }; }));
    const execution = await run(app, ["s", "id", "-vn", "business", "--port=4", "--no-cache", "--offset=-1"]);
    expect(execution.code).toBe(0);
    expect(result).toEqual({ config: { port: 4, cache: "false", offset: -1 }, options: { name: "business", verbose: true }, args: ["id"] });
  });
  test("legacy nested command options and repeatable set overrides have deterministic priority", async () => {
    const app = createCliApp({ ...base, legacyFlags: true });
    let config: unknown;
    app.command("create").command("tenant").option("--name <value>")
      .action(withConfig(configOptions, (context) => { config = context.config; }));
    expect((await run(app, ["create", "tenant", "--name", "demo", "--port", "1", "--set", "port=2"])).code).toBe(0);
    expect(config).toEqual({ port: 2 });
  });
  test("terminator preserves option-looking positional values in both modes", async () => {
    for (const legacyFlags of [false, true]) {
      const app = createCliApp({ ...base, legacyFlags });
      let args: readonly unknown[] = [];
      app.command("echo [values...]").action(withConfig(configOptions, (context) => { args = context.args; }));
      expect((await run(app, ["echo", "--", "--port=8", "--set", "port=9"])).code).toBe(0);
      expect(args).toEqual([["--port=8", "--set", "port=9"]]);
    }
  });
  test("explicit assignments work in tests and do not leak between app instances", async () => {
    const ports: number[] = [];
    const make = () => {
      const app = createCliApp(base);
      app.command("serve").action(withConfig(configOptions, ({ config }) => { ports.push(config.port); }));
      return app;
    };
    await run(make(), ["serve", "--set", "port=4000"]);
    await run(make(), ["serve"]);
    expect(ports).toEqual([4000, 3000]);
  });
  test("defineCommand actions can load configuration via their context", async () => {
    let port: number | undefined;
    const useServe = defineCommand({ name: "serve", description: "Start", loadAction: async () => async ({ command }) => {
      port = (await loadCommandConfig(command, configOptions)).port;
    } });
    const app = createCliApp({ ...base, commands: [useServe] });
    expect((await run(app, ["serve", "--set", "port=8"])).code).toBe(0);
    expect(port).toBe(8);
  });
});

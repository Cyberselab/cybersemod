import { Command, CommanderError } from "commander";
import { ConfigError } from "@cyberselab/config/errors";
import { formatBuildInfo, type BuildInfo } from "./build-info.js";
import { CommandInputError } from "./errors.js";
import { partitionLegacyArguments } from "./arguments.js";
import { appStates } from "./state.js";

export interface CliAppOptions {
  name: string;
  description: string;
  buildInfo?: BuildInfo;
  legacyFlags?: boolean;
  commands?: readonly ((app: Command) => unknown)[];
}

export function createCliApp(options: CliAppOptions): Command {
  const app = new Command(options.name).description(options.description)
    .option("--config <path>", "Configuration file path")
    .option("--set <path=value>", "Override a configuration field (repeatable)",
      (value: string, previous: string[] = []) => [...previous, value], [] as string[]);
  if (options.buildInfo) {
    const identifier = formatBuildInfo(options.buildInfo);
    app.version(identifier).addHelpText("beforeAll", `Build: ${identifier}\n`);
  }
  appStates.set(app, { legacyFlags: options.legacyFlags ?? false, legacyArguments: [], used: false });
  for (const register of options.commands ?? []) register(app);
  return app;
}

function configureTree(command: Command, root: Command, out: (text: string) => void, err: (text: string) => void): void {
  if (command !== root && command.options.some((option) => ["config", "set", "help", "version"].includes(option.attributeName()) || ["-h", "-V"].includes(option.short ?? ""))) {
    throw new CommandInputError("Subcommands must not redefine reserved CLI options");
  }
  command.exitOverride().configureOutput({
    writeOut: out, writeErr: err,
    // Commander input errors can contain raw values. The runner reports a safe diagnostic.
    outputError: () => {},
  });
  for (const child of command.commands) configureTree(child, root, out, err);
}

export interface RunCliOptions {
  /** User arguments only: no runtime or script path. */
  argv?: readonly string[];
  stdout?: (text: string) => void;
  stderr?: (text: string) => void;
}

/** Returns an exit code. The executable owns process.exitCode and resource cleanup. */
export async function runCli(app: Command, options: RunCliOptions = {}): Promise<number> {
  const out = options.stdout ?? ((text: string) => { process.stdout.write(text); });
  const err = options.stderr ?? ((text: string) => { process.stderr.write(text); });
  try {
    const state = appStates.get(app);
    if (!state) throw new CommandInputError("Use createCliApp to create the application");
    if (state.used) throw new CommandInputError("Create a fresh CLI application for each execution");
    state.used = true;
    configureTree(app, app, out, err);
    let argv = [...(options.argv ?? process.argv.slice(2))];
    if (state.legacyFlags) {
      const partitioned = partitionLegacyArguments(app, argv);
      argv = partitioned.argv;
      state.legacyArguments = partitioned.configurationArgv;
    }
    await app.parseAsync(argv, { from: "user" });
    return 0;
  } catch (error) {
    if (error instanceof CommanderError) {
      if (error.exitCode === 0) return 0;
      // Help caused by a missing command is an input error, not an execution failure.
      err("Invalid command line input. Use --help for usage.\n");
      return 2;
    }
    if (error instanceof ConfigError) { err(`${error.code}: ${error.message}\n`); return 2; }
    if (error instanceof CommandInputError) { err(`${error.message}\n`); return 2; }
    err("Command execution failed.\n");
    return 1;
  }
}

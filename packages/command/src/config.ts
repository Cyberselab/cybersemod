import { loadConfig, type LoadConfigOptions } from "@cybersemod/config/load";
import { ConfigError } from "@cybersemod/config/errors";
import { readFlagConfig, readSetConfig } from "@cybersemod/config/flags";
import { mergeConfigRecords } from "@cybersemod/config/record";
import { getActionContext, type ActionContext, type CommandOptions } from "./command.js";
import { CommandInputError } from "./errors.js";
import { appStates, rootCommand } from "./state.js";

export type ConfigActionContext<T, Options extends CommandOptions = CommandOptions> = ActionContext<Options> & { config: T };

export async function loadCommandConfig<T>(command: ActionContext["command"], options: LoadConfigOptions<T>): Promise<T> {
  const root = rootCommand(command);
  const global = root.opts<{ config?: string; set?: string[] }>();
  const flags = mergeConfigRecords(
    mergeConfigRecords(options.flags ?? {}, readFlagConfig(appStates.get(root)?.legacyArguments ?? [])),
    readSetConfig(global.set ?? []),
  );
  try {
    return await loadConfig({
      ...options,
      file: { ...options.file, path: global.config ?? options.file?.path },
      flags,
    });
  } catch (error) {
    if (error instanceof ConfigError) throw error;
    throw new CommandInputError("Configuration validation failed", error);
  }
}

/** Adapter for native Commander .action(), with lazy configuration loading. */
export function withConfig<T, Options extends CommandOptions = CommandOptions>(
  options: LoadConfigOptions<T>,
  action: (context: ConfigActionContext<T, Options>) => unknown | Promise<unknown>,
): (...values: unknown[]) => Promise<void> {
  return async (...values) => {
    const context = getActionContext<Options>(values);
    const config = await loadCommandConfig(context.command, options);
    await action({ ...context, config });
  };
}

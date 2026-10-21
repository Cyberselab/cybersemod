import { Command } from "commander";

export type CommandOptions = Record<string, unknown>;
export interface ActionContext<Options extends CommandOptions = CommandOptions> {
  args: readonly unknown[];
  options: Options;
  command: Command;
}
export type CommandAction<Options extends CommandOptions = CommandOptions> = (context: ActionContext<Options>) => unknown | Promise<unknown>;

export function getActionContext<Options extends CommandOptions>(values: readonly unknown[]): ActionContext<Options> {
  const command = values.at(-1);
  if (!(command instanceof Command)) throw new Error("Expected a Commander action invocation");
  return { args: values.slice(0, -2), options: command.opts<Options>(), command };
}

export interface CommandDefinition<Options extends CommandOptions = CommandOptions> {
  name: string;
  description: string;
  configure?: (command: Command) => void;
  /** Imported only when the command action actually executes. */
  loadAction: () => Promise<CommandAction<Options>>;
}

/** Produces a useXxxCommand(app) registration function without hiding Commander. */
export function defineCommand<Options extends CommandOptions = CommandOptions>(definition: CommandDefinition<Options>): (app: Command) => Command {
  return (app) => {
    const command = app.command(definition.name).description(definition.description);
    definition.configure?.(command);
    command.action(async (...values: unknown[]) => {
      const action = await definition.loadAction();
      await action(getActionContext<Options>(values));
    });
    return command;
  };
}

// The native type is intentionally available for project-specific useXxxCommand functions.
export type { Command };

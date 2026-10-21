import type { Command } from "commander";

export interface AppState { legacyFlags: boolean; legacyArguments: readonly string[]; used: boolean }
export const appStates = new WeakMap<Command, AppState>();

export function rootCommand(command: Command): Command {
  while (command.parent !== null) command = command.parent;
  return command;
}

import { createCliApp } from "@cyberselab/command/app";
import { useShowCommand } from "./commands/show.command.js";

export function createApp() {
  return createCliApp({
    name: "example",
    description: "Configuration and Commander conventions example",
    buildInfo: { version: "0.1.0" },
    commands: [useShowCommand],
  });
}

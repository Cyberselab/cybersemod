import { defineCommand } from "@cyberselab/command/command";

export const useShowCommand = defineCommand<{ uppercase?: boolean }>({
  name: "show <label>",
  description: "Show the example host and port",
  configure: (command) => { command.option("-u, --uppercase", "Uppercase the label"); },
  loadAction: async () => (await import("../actions/show.action.js")).showAction,
});

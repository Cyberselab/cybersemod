import type { CommandAction } from "@cybersemod/command/command";
import { loadCommandConfig } from "@cybersemod/command/config";
import { configSchema } from "../../config-schema.js";

export const showAction: CommandAction<{ uppercase?: boolean }> = async ({ command, options, args }) => {
  const config = await loadCommandConfig(command, {
    appName: "@example/server",
    schema: configSchema,
    file: { required: false },
  });
  const label = String(args[0]);
  console.log(JSON.stringify({ label: options.uppercase ? label.toUpperCase() : label, ...config }));
};

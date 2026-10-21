import type { Command, Option } from "commander";

function optionsFor(command: Command): Option[] {
  return [...command.options, ...(command.parent ? optionsFor(command.parent) : [])];
}

/** Partition only unregistered long flags; Commander retains all business input. */
export function partitionLegacyArguments(root: Command, argv: readonly string[]): { argv: string[]; configurationArgv: string[] } {
  const output: string[] = [];
  const legacy: string[] = [];
  let command = root;
  for (let index = 0; index < argv.length; index++) {
    const token = argv[index]!;
    if (token === "--") { output.push(...argv.slice(index)); break; }
    const options = optionsFor(command);
    const name = token.split("=", 1)[0]!;
    const option = options.find((candidate) => candidate.long === name || candidate.short === name);
    if (option) {
      output.push(token);
      if (!token.includes("=") && (option.required || option.optional)) {
        const next = argv[index + 1];
        if (next !== undefined && (option.required || !next.startsWith("-"))) output.push(argv[++index]!);
        if (option.variadic) {
          while (argv[index + 1] !== undefined && !argv[index + 1]!.startsWith("-")) output.push(argv[++index]!);
        }
      }
      continue;
    }
    // Preserve short clusters, including attached option values, for Commander.
    if (/^-[^-]/.test(token)) {
      output.push(token);
      for (let letter = 1; letter < token.length; letter++) {
        const short = options.find((candidate) => candidate.short === `-${token[letter]}`);
        if (short?.required || short?.optional) {
          const next = argv[index + 1];
          if (letter === token.length - 1 && next !== undefined && (short.required || !next.startsWith("-"))) output.push(argv[++index]!);
          if (short.variadic) {
            while (argv[index + 1] !== undefined && !argv[index + 1]!.startsWith("-")) output.push(argv[++index]!);
          }
          break;
        }
      }
      continue;
    }
    if (token.startsWith("--") && !["--help", "--version"].includes(name)) {
      legacy.push(token);
      if (!token.includes("=") && !token.startsWith("--no-") && argv[index + 1] !== undefined && !argv[index + 1]!.startsWith("-")) {
        legacy.push(argv[++index]!);
      }
      continue;
    }
    output.push(token);
    const child = command.commands.find((candidate) => candidate.name() === token || candidate.aliases().includes(token));
    if (child) command = child;
  }
  return { argv: output, configurationArgv: legacy };
}

import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";

// Installs tarballs outside the workspace so workspace links cannot hide packaging errors.
const root = resolve(import.meta.dir, "..");
const temporary = await mkdtemp(join(tmpdir(), "cybersemod-packages-"));
async function execute(argv: string[], cwd: string): Promise<string> {
  const child = Bun.spawn(argv, { cwd, stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr, code] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]);
  if (code !== 0) throw new Error(`${argv.join(" ")} failed (${code})\n${stdout}\n${stderr}`);
  return stdout;
}
try {
  for (const name of ["config", "command"]) {
    await execute([process.execPath, "pm", "pack", "--filename", join(temporary, `${name}.tgz`), "--ignore-scripts"], join(root, "packages", name));
  }
  const consumer = join(temporary, "consumer");
  await mkdir(consumer);
  await writeFile(join(consumer, "package.json"), JSON.stringify({
    name: "package-consumer", private: true, type: "module",
    dependencies: { "@cybersemod/config": `file:../config.tgz`, "@cybersemod/command": `file:../command.tgz` },
    // Both packages are unpublished: bind the transitive semver dependency to our tarball too.
    overrides: { "@cybersemod/config": "file:../config.tgz" },
  }));
  await execute([process.execPath, "install", "--ignore-scripts"], consumer);
  const source = `
import { loadConfig } from '@cybersemod/config/load';
import { createCliApp, runCli } from '@cybersemod/command/app';
import { defineCommand } from '@cybersemod/command/command';
import { withConfig } from '@cybersemod/command/config';
const options = { appName: '@smoke/server', schema: { parse(input: unknown) { return input as { port: string }; } }, file: { required: false }, dotenv: false, environment: {}, directories: { current: '.', home: '.', system: '.' } };
const config = await loadConfig({ ...options, flags: { port: '1' } });
const port: string = config.port;
if (port !== '1') throw new Error('configuration smoke failed');
let observed = '';
const app = createCliApp({ name: 'smoke', description: 'Smoke' });
app.command('serve').action(withConfig(options, ({ config }) => { observed = config.port; }));
if (await runCli(app, { argv: ['serve', '--set', 'port=9'] }) !== 0 || observed !== '9') throw new Error('CLI smoke failed');
let imported = false;
const useTask = defineCommand({ name: 'task', description: 'Task', loadAction: async () => { imported = true; return () => {}; } });
const help = createCliApp({ name: 'smoke', description: 'Smoke', commands: [useTask] });
if (await runCli(help, { argv: ['task', '--help'], stdout: () => {} }) !== 0 || imported) throw new Error('lazy smoke failed');
console.log('package smoke passed');
`;
  await writeFile(join(consumer, "smoke.ts"), source);
  await writeFile(join(consumer, "tsconfig.json"), JSON.stringify({
    compilerOptions: { target: "ES2022", module: "ESNext", moduleResolution: "Bundler", strict: true, skipLibCheck: true, outDir: "output", types: [] },
    include: ["smoke.ts"],
  }));
  // No bun custom condition here: validates dist/*.d.ts and the emitted ESM default exports.
  await execute([process.execPath, join(root, "node_modules/typescript/bin/tsc"), "-p", "tsconfig.json"], consumer);
  console.log((await execute([process.execPath, "smoke.ts"], consumer)).trim());
  console.log((await execute(["node", "output/smoke.js"], consumer)).trim());
  await execute([process.execPath, "build", "smoke.ts", "--compile", "--outfile", "smoke.exe"], consumer);
  console.log((await execute([join(consumer, "smoke.exe")], consumer)).trim());
  console.log("Tarball installation, declarations, ESM and Bun executable checks passed.");
} finally {
  const target = resolve(temporary);
  if (!target.startsWith(resolve(tmpdir()) + sep) || !target.includes("cybersemod-packages-")) throw new Error("Unsafe verification cleanup");
  await rm(target, { recursive: true, force: true });
}

import { runCli } from "@cyberselab/command/app";
import { createApp } from "./cli/app.js";

process.exitCode = await runCli(createApp());

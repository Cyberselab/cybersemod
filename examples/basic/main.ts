import { runCli } from "@cybersemod/command/app";
import { createApp } from "./cli/app.js";

process.exitCode = await runCli(createApp());

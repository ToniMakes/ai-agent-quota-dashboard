#!/usr/bin/env node
import { runCli } from "./cli/run-cli.js";

await runCli(process.argv.slice(2), import.meta.url);

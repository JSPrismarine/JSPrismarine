#!/usr/bin/env node
import { runCommand } from './command';

/** The `jsp-addon` entry point. Everything it does is in `runCommand`, which the tests drive. */
process.exitCode = await runCommand(process.argv.slice(2), {
    env: process.env,
    stdout: (text) => process.stdout.write(text),
    stderr: (text) => process.stderr.write(text)
});

import { parseArgs, type ParseArgsConfig } from 'node:util';
import { BEHAVIOUR_NAMES } from '../bot/behaviour/Behaviours';
import { runBot, runConnect, runPing } from './commands';

/**
 * How long a `--duration` or `--ramp` value means.
 *
 * A bare number is *seconds*, not milliseconds: `--duration 60` meaning a sixteenth of a
 * second is the kind of surprise that wastes an afternoon of load testing.
 */
export const parseDuration = (value: string): number => {
    const match = /^(\d+(?:\.\d+)?)(ms|s|m|h)?$/.exec(value.trim());
    if (!match) throw new UsageError(`Cannot read "${value}" as a duration. Try 30s, 10m, or 500ms.`);

    const amount = Number(match[1]);
    switch (match[2]) {
        case 'ms':
            return amount;
        case 'm':
            return amount * 60_000;
        case 'h':
            return amount * 3_600_000;
        default:
            return amount * 1000;
    }
};

/** `5` and `5/s` both mean five per second. */
export const parseRate = (value: string): number => {
    const match = /^(\d+(?:\.\d+)?)(?:\/s)?$/.exec(value.trim());
    if (!match) throw new UsageError(`Cannot read "${value}" as a rate. Try 5 or 5/s.`);

    return Number(match[1]);
};

export const parseCount = (value: string, flag: string): number => {
    const count = Number(value);
    if (!Number.isInteger(count) || count < 0) throw new UsageError(`${flag} must be a whole number, got "${value}"`);

    return count;
};

/** Something the user can fix by typing something else, as opposed to a failure. */
export class UsageError extends Error {}

const OPTIONS: ParseArgsConfig['options'] = {
    host: { type: 'string', short: 'h' },
    port: { type: 'string', short: 'p' },
    name: { type: 'string' },
    'name-prefix': { type: 'string' },
    count: { type: 'string', short: 'c' },
    ramp: { type: 'string' },
    duration: { type: 'string', short: 'd' },
    seed: { type: 'string' },
    behaviour: { type: 'string', short: 'b' },
    'view-distance': { type: 'string' },
    report: { type: 'string' },
    timeout: { type: 'string' },
    verbose: { type: 'boolean', short: 'v' },
    help: { type: 'boolean' }
};

const HELP = `jsp-client - a Minecraft: Bedrock Edition client

  jsp-client connect --host <address> [--port 19132] [--name Steve]
      Joins a server and prints the chat until interrupted.

  jsp-client ping --host <address> [--port 19132]
      Asks a server for its MOTD without connecting.

  jsp-client bot --host <address> --count <n> [options]
      Runs a fleet of synthetic players against a server and reports what happened.

      --count, -c        how many bots                          (required)
      --behaviour, -b    comma separated: ${BEHAVIOUR_NAMES.join(', ')}
      --duration, -d     how long to run for, e.g. 10m          (default 60s)
      --ramp             connections per second, 0 for all at once  (default 10)
      --seed             makes the run reproducible             (default 1)
      --view-distance    in chunks; the biggest dial there is   (default 4)
      --name-prefix      each bot gets its index appended       (default Bot)
      --report           write the full report as JSON here
      --timeout          per bot login budget, e.g. 30s         (default 30s)

Common:
      --host, -h         server address                         (required)
      --port, -p         server port                            (default 19132)
      --verbose, -v      log everything the client does
      --help

Exit codes: 0 all good, 1 something failed, 2 the command line was wrong.`;

/**
 * Parsed flags.
 *
 * The array arm is `parseArgs`'s doing: it types every value as possibly repeated because
 * an option *could* be declared `multiple`. None here are, but the readers below check the
 * type anyway rather than casting the possibility away.
 */
export type Values = Record<string, string | boolean | (string | boolean)[] | undefined>;

export interface CliIo {
    out(line: string): void;
    err(line: string): void;
}

const CONSOLE_IO: CliIo = {
    out: (line) => process.stdout.write(`${line}\n`),
    err: (line) => process.stderr.write(`${line}\n`)
};

/**
 * The command line, and the whole of it.
 *
 * `node:util.parseArgs` rather than a dependency: the repository has no argument library
 * anywhere, the engine requirement is already Node 21, and a load-testing binary that has to
 * stay `bun build --compile`-able has every reason not to grow a dependency tree for the
 * sake of parsing five flags.
 *
 * @param argv - arguments after the executable and script, i.e. `process.argv.slice(2)`.
 * @returns the process exit code.
 */
export const run = async (argv: readonly string[], io: CliIo = CONSOLE_IO): Promise<number> => {
    try {
        const [command, ...rest] = argv;

        if (command === undefined || command === '--help' || command === 'help') {
            io.out(HELP);
            return command === undefined ? 2 : 0;
        }

        const { values } = parseArgs({ args: [...rest], options: OPTIONS, allowPositionals: false });

        if (values.help) {
            io.out(HELP);
            return 0;
        }

        switch (command) {
            case 'connect':
                return await runConnect(values, io);
            case 'ping':
                return await runPing(values, io);
            case 'bot':
                return await runBot(values, io);
            default:
                throw new UsageError(`Unknown command "${command}". Try --help.`);
        }
    } catch (error: unknown) {
        // A usage mistake is not a stack trace: it is a sentence and a different exit code,
        // so a script can tell "you typed it wrong" from "the server refused you".
        if (error instanceof UsageError) {
            io.err(error.message);
            return 2;
        }

        io.err(error instanceof Error ? error.message : String(error));
        return 1;
    }
};

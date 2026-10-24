import yargs from 'yargs/yargs';
import pkg from '../../package.json' with { type: 'json' };
import { BEHAVIOR_NAMES } from '../bot/behavior/Behaviors';
import { runBot, runConnect, runPing } from './commands';

import type { Options } from 'yargs';

/**
 * How long a `--duration` or `--ramp` value means.
 *
 * A bare number is seconds, not milliseconds: `--duration 60` meaning a sixteenth of a
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

/** Parses a rate expressed as a number per second. */
export const parseRate = (value: string): number => {
    const match = /^(\d+(?:\.\d+)?)(?:\/s)?$/.exec(value.trim());
    if (!match) throw new UsageError(`Cannot read "${value}" as a rate. Try 5 or 5/s.`);

    return Number(match[1]);
};

/** Parses a non-negative whole-number option. */
export const parseCount = (value: string, flag: string): number => {
    const count = Number(value);
    if (!Number.isInteger(count) || count < 0) throw new UsageError(`${flag} must be a whole number, got "${value}"`);

    return count;
};

/** A command-line input mistake that should exit with status 2. */
export class UsageError extends Error {}

/** Values consumed by the command handlers. */
export interface Values {
    [key: string]: unknown;
    host?: string;
    port?: string;
    name?: string;
    count?: string;
    ramp?: string;
    duration?: string;
    seed?: string;
    behavior?: string;
    'view-distance'?: string;
    'name-prefix'?: string;
    report?: string;
    timeout?: string;
    verbose?: boolean;
}

/** Output streams used by the CLI, replaceable by callers embedding it. */
export interface CliIo {
    out(line: string): void;
    err(line: string): void;
}

const CONSOLE_IO: CliIo = {
    out: (line) => process.stdout.write(`${line}\n`),
    err: (line) => process.stderr.write(`${line}\n`)
};

const DEFAULT_PORT = '19132';
const CLI_NAME = Object.keys(pkg.bin)[0] ?? pkg.name;

const HOST_PORT_OPTIONS = {
    host: {
        alias: 'h',
        describe: 'Server address (required)',
        type: 'string'
    },
    port: {
        alias: 'p',
        default: DEFAULT_PORT,
        describe: 'Server port',
        type: 'string'
    }
} satisfies Record<string, Options>;

/**
 * Parses and runs a client command.
 *
 * @param argv - arguments after the executable and script, i.e. `process.argv.slice(2)`.
 * @param io - output streams for command results and diagnostics.
 * @returns the process exit code.
 */
export const run = async (argv: readonly string[], io: CliIo = CONSOLE_IO): Promise<number> => {
    let exitCode = 0;
    let commandError: { error: unknown } | undefined;
    const execute = async (command: (values: Values, io: CliIo) => Promise<number>, values: Values): Promise<void> => {
        try {
            exitCode = await command(values, io);
        } catch (error: unknown) {
            commandError = { error };
        }
    };

    const cli = yargs([...argv])
        .scriptName(CLI_NAME)
        .usage('$0 <command> [options]')
        .example('$0 bot --host <address> --count <n>', 'Run synthetic players against a server')
        .strict()
        .showHelpOnFail(false)
        .help('help', 'Show this help message')
        .version('version', 'Show the client version', `${CLI_NAME} ${pkg.version}`)
        .completion('completion', 'Generate a shell completion script')
        .exitProcess(false)
        .fail((message, error) => {
            if (error instanceof UsageError) throw error;
            throw new UsageError(message ?? error?.message ?? 'Invalid command-line arguments');
        })
        .option('verbose', {
            alias: 'v',
            type: 'boolean',
            describe: 'Log everything the client does'
        })
        .command(
            'connect',
            'Join a server and print chat until interrupted',
            (yargs) =>
                yargs.options({
                    ...HOST_PORT_OPTIONS,
                    name: { type: 'string', default: 'Player', describe: 'Player display name' },
                    timeout: { type: 'string', describe: 'Login timeout, e.g. 30s' }
                }),
            async (values) => {
                await execute(runConnect, values);
            }
        )
        .command(
            'ping',
            'Ask a server for its MOTD without connecting',
            (yargs) => yargs.options(HOST_PORT_OPTIONS),
            async (values) => {
                await execute(runPing, values);
            }
        )
        .command(
            'bot',
            'Run a fleet of synthetic players and report the results',
            (yargs) =>
                yargs.options({
                    ...HOST_PORT_OPTIONS,
                    count: { alias: 'c', type: 'string', describe: 'Number of bots to run (required)' },
                    behavior: {
                        alias: 'b',
                        type: 'string',
                        describe: `Comma-separated behaviors: ${BEHAVIOR_NAMES.join(', ')}`
                    },
                    duration: { alias: 'd', type: 'string', default: '60s', describe: 'Run duration, e.g. 10m' },
                    ramp: { type: 'string', default: '10', describe: 'Connections per second; 0 starts all at once' },
                    seed: { type: 'string', default: '1', describe: 'Seed for reproducible runs' },
                    'view-distance': { type: 'string', default: '4', describe: 'Client view distance in chunks' },
                    'name-prefix': { type: 'string', default: 'Bot', describe: 'Prefix for generated player names' },
                    report: { type: 'string', describe: 'Write the full report as JSON to this path' },
                    timeout: { type: 'string', default: '30s', describe: 'Login timeout per bot, e.g. 30s' }
                }),
            async (values) => {
                await execute(runBot, values);
            }
        )
        .demandCommand(1, `Please specify a command. Run ${CLI_NAME} --help for usage.`);

    if (argv.length === 0) {
        cli.showHelp((help) => io.out(help.replace(/\n+$/, '')));
        return 2;
    }

    const firstToken = argv[0];
    if (
        firstToken !== undefined &&
        !firstToken.startsWith('-') &&
        !['connect', 'ping', 'bot', 'completion'].includes(firstToken)
    ) {
        io.err(`Unknown command "${firstToken}". Try --help.`);
        return 2;
    }

    try {
        let parserOutput = '';
        await cli.parseAsync([...argv], {}, (_error, _parsed, output) => {
            parserOutput = output;
        });
        if (parserOutput.length > 0) {
            io.out(parserOutput.replace(/\n+$/, ''));
            return 0;
        }
        if (commandError !== undefined) throw commandError.error;
        return exitCode;
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

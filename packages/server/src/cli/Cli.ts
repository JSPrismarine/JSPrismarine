import { GENERATION_HOST_ROLE } from '@jsprismarine/chunkgen/hostRole';
import yargs from 'yargs/yargs';
import { BUILT_IN_PROTOCOL_PROVIDERS, describeProtocolProviders } from '@jsprismarine/prismarine/protocolProviders';
import { serverVersion } from '@jsprismarine/prismarine/version';
import { ServerErrors } from '@jsprismarine/errors/server';

/**
 * The roles the entry point can take; `server` is what the host spawns its child with, and the
 * generation host is what a compiled executable starts itself as.
 */
export const ROLES = ['server', GENERATION_HOST_ROLE] as const;

/**
 * Builds the server's command-line parser without running it, so help text can be read
 * without parsing.
 *
 * `pnpm` passes an argument separator through after script defaults such as `--watch`, so the
 * separators are dropped before the server options are parsed.
 */
export const serverCli = (argv: readonly string[]) =>
    yargs(argv.filter((argument) => argument !== '--'))
        .scriptName('prismarine')
        .usage('$0 [options]')
        .parserConfiguration({ 'boolean-negation': false })
        .option('port', {
            alias: 'p',
            type: 'number',
            describe: 'Server port (overrides port in config.json)'
        })
        .option('watch', {
            type: 'boolean',
            default: false,
            describe: 'Restart the server when a workspace package changes'
        })
        .option('no-tui', {
            type: 'boolean',
            default: false,
            describe: 'Use the plain line console even on an interactive terminal'
        })
        .option('headless', {
            type: 'boolean',
            default: false,
            describe: 'Run without any console; nothing is read from stdin'
        })
        .option('devtools', {
            type: 'boolean',
            default: false,
            describe: 'Enable local DevTools debugging and profiling'
        })
        .option('devtools-wait', {
            type: 'boolean',
            default: false,
            describe: 'Enable DevTools and wait for a debugger before server initialization'
        })
        .option('role', {
            type: 'string',
            choices: ROLES,
            hidden: true
        })
        .help('help', 'Show this help message')
        // The version on the first line, for a script that reads it, then every built-in edition.
        .version(
            'version',
            'Show the server version and the Minecraft versions it speaks',
            [serverVersion(), ...describeProtocolProviders(BUILT_IN_PROTOCOL_PROVIDERS)].join('\n')
        )
        .alias('version', 'v')
        .completion('completion', 'Generate a shell completion script')
        .strict()
        .check(({ _, port, watch, headless }) => {
            if (_.length > 0) throw new ServerErrors.UnexpectedArgument({ argument: _.join(' ') });
            if (watch && headless) throw new ServerErrors.WatchWithoutConsole();
            if (port !== undefined && (!Number.isInteger(port) || port < 1 || port > 65535)) {
                throw new ServerErrors.InvalidPort();
            }

            return true;
        })
        .exitProcess(false)
        .fail((message, error) => {
            if (error) throw error;
            throw message === undefined
                ? new ServerErrors.InvalidCommandLineArguments()
                : new ServerErrors.CommandLineRejected({ reason: message });
        });

/** Parses the server's command-line options and handles help and completion commands. */
export const parseServerArgs = (argv: readonly string[]) => serverCli(argv).parseSync();

/** The parsed server command line. */
export type ServerArgs = ReturnType<typeof parseServerArgs>;

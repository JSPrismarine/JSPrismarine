import yargs from 'yargs/yargs';
import pkg from '../../package.json' with { type: 'json' };

/** The roles the entry point can take; `server` is what the host spawns its child with. */
export const ROLES = ['server'] as const;

/**
 * Builds the server's command-line parser without running it, so help text can be read
 * without parsing.
 *
 * A leading `--`, which `pnpm run dev -- --port 1` passes through, is dropped so the options
 * after it parse as options rather than positionals.
 */
export const serverCli = (argv: readonly string[]) =>
    yargs(argv[0] === '--' ? argv.slice(1) : [...argv])
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
        .option('role', {
            type: 'string',
            choices: ROLES,
            hidden: true
        })
        .help('help', 'Show this help message')
        .version('version', 'Show the server version', pkg.version)
        .completion('completion', 'Generate a shell completion script')
        .strict()
        .check(({ _, port, watch, headless }) => {
            if (_.length > 0) throw new Error(`Unexpected argument "${_.join(' ')}"`);
            if (watch && headless) throw new Error('--watch needs a console; drop --headless or --watch');
            if (port !== undefined && (!Number.isInteger(port) || port < 1 || port > 65535)) {
                throw new Error('--port must be a whole number between 1 and 65535');
            }

            return true;
        })
        .exitProcess(false)
        .fail((message, error) => {
            if (error) throw error;
            throw new Error(message ?? 'Invalid command-line arguments');
        });

/** Parses the server's command-line options and handles help and completion commands. */
export const parseServerArgs = (argv: readonly string[]) => serverCli(argv).parseSync();

/** The parsed server command line. */
export type ServerArgs = ReturnType<typeof parseServerArgs>;

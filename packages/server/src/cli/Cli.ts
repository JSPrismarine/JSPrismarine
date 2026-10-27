import yargs from 'yargs/yargs';
import pkg from '../../package.json' with { type: 'json' };

declare const BUILD_TIME: string | undefined;
declare const BUILD_GIT_HASH: string | undefined;
declare const BUILD_VERSION: string | undefined;
declare const BUILD_FLAVOR: string | undefined;
declare const BUILD_TYPE: string | undefined;

const buildVersion = typeof BUILD_VERSION === 'undefined' ? pkg.version : BUILD_VERSION;
const buildDetails = [
    typeof BUILD_FLAVOR === 'undefined' ? undefined : BUILD_FLAVOR,
    typeof BUILD_TYPE === 'undefined' ? undefined : BUILD_TYPE,
    typeof BUILD_GIT_HASH === 'undefined' ? undefined : `commit ${BUILD_GIT_HASH}`,
    typeof BUILD_TIME === 'undefined' ? undefined : `built ${BUILD_TIME}`
].filter((detail) => detail !== undefined);
const versionText = buildDetails.length > 0 ? `${buildVersion} (${buildDetails.join(', ')})` : buildVersion;

/** The roles the entry point can take; `server` is what the host spawns its child with. */
export const ROLES = ['server'] as const;

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
        .option('role', {
            type: 'string',
            choices: ROLES,
            hidden: true
        })
        .help('help', 'Show this help message')
        .version('version', 'Show the server version', versionText)
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

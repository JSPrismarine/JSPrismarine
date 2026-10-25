import yargs from 'yargs/yargs';
import pkg from '../../package.json' with { type: 'json' };

/** Parses the server's command-line options and handles help and completion commands. */
export const parseServerArgs = (argv: readonly string[]) =>
    yargs([...argv])
        .scriptName('prismarine')
        .usage('$0 [options]')
        .option('port', {
            alias: 'p',
            type: 'number',
            describe: 'Server port (overrides port in config.json)'
        })
        .help('help', 'Show this help message')
        .version('version', 'Show the server version', pkg.version)
        .completion('completion', 'Generate a shell completion script')
        .strict()
        .check(({ _, port }) => {
            if (_.length > 0) throw new Error(`Unexpected argument "${_.join(' ')}"`);
            if (port !== undefined && (!Number.isInteger(port) || port < 1 || port > 65535)) {
                throw new Error('--port must be a whole number between 1 and 65535');
            }

            return true;
        })
        .exitProcess(false)
        .fail((message, error) => {
            if (error) throw error;
            throw new Error(message ?? 'Invalid command-line arguments');
        })
        .parseSync();

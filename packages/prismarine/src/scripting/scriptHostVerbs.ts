import type { CommandHost } from '@jsprismarine/commands';
import { collectCommandWork } from '../command/deferred';
import type Server from '../Server';
import type { Level } from '../world/Level';

/**
 * Runs a command host verb on behalf of a script, which is no command dispatch.
 *
 * A verb parks the work it starts for the dispatch that ran it, and refuses to run outside one.
 * A script's call returns before that work ends and has nothing to await it with, so the work
 * is collected here and a failure in it is logged rather than lost.
 */
export type ScriptHostVerb = <T>(verb: (host: CommandHost) => T) => T;

/**
 * The {@link ScriptHostVerb} of a level's scripts, over the level's command host.
 *
 * @param server - The server whose command manager owns the host.
 * @param level - The level the scripts run in.
 */
export const scriptHostVerbs =
    (server: Server, level: Level): ScriptHostVerb =>
    (verb) => {
        const { value, started } = collectCommandWork(() => verb(server.getCommandManager().getHost(level)));
        for (const work of started) {
            void work.catch((error: unknown) =>
                server.getLogger().warn(`A script's command work failed: ${String(error)}`)
            );
        }
        return value;
    };

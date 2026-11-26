/**
 * `addon`, the console's command for the server's addons: `list`, `install`, `update`, `remove`
 * and `sync`. Only the console runs it, so nobody adds code to a server from inside the game:
 * its level is above an operator's, and its tree requires a source the console typed.
 */
import type { CommandRegistry, CommandSource } from '@jsprismarine/commands';
import { arg, command, lit, messageArgument, stringArgument, value } from '@jsprismarine/commands';
import { CommandPermissionLevel } from '@jsprismarine/minecraft';

import type Server from '../Server';
import type { InstalledAddon } from '../addons/AddonManager';
import { isPathLock, isSourceLock } from '../addons/addonFiles';
import type { AddonRequest } from '../addons/addonFiles';
import { isConsoleSource } from './consoleSource';
import { deferCommandWork } from './deferred';

/** Where a request installs from, as `addon list` prints it. */
const describeRequest = (key: string, request: AddonRequest): string => {
    if ('source' in request) return `${request.source}/${request.name ?? key}@${request.version}`;
    if ('url' in request) return request.url;
    return request.path;
};

/** One line of `addon list`. */
const listLine = ({ key, request, locked, packs }: InstalledAddon): string => {
    if (request === undefined)
        return `§e${key}§r ${locked?.version ?? ''}, no longer in addons.json; addon sync removes it`;
    const from = describeRequest(key, request);
    if (locked === undefined) return `§e${key}§r from ${from}, not installed yet; addon sync installs it`;
    const linked = isPathLock(locked) && locked.sha256 === undefined ? ', linked to the folder' : '';
    const reason = isSourceLock(locked) ? locked.deprecated : undefined;
    const deprecated = reason === undefined ? '' : `, §cdeprecated§r: ${reason}`;
    // A lone behavior pack is what an addon was before archives held more, and needs no list.
    const contents =
        packs.length > 1 || packs.some(({ summary }) => summary.kind !== 'behavior')
            ? `, holding ${packs.map(({ folder, summary }) => `${summary.kind} pack ${folder === '.' ? summary.name : folder}`).join(', ')}`
            : '';
    const worlds = isSourceLock(locked) || locked.worlds === undefined ? 0 : locked.worlds.length;
    const imported = worlds === 0 ? '' : `, imported ${worlds} world${worlds === 1 ? '' : 's'}`;
    return `§e${key}§r ${locked.version} from ${from}${linked}${contents}${imported}${deprecated}`;
};

/**
 * Splits `install`'s argument into the addon and the `as <name>` after it. The last two words are
 * the alias when the first of them is `as`, so a path with spaces takes one too; a path whose own
 * last two words are `as` and a name needs an `as <name>` after it.
 */
const installArguments = (line: string): { readonly spec: string; readonly as?: string } => {
    const trimmed = line.trim();
    const alias = /\sas\s+(\S+)$/.exec(trimmed);
    const spec = alias === null ? '' : trimmed.slice(0, alias.index).trimEnd();
    if (alias === null || spec === '') return { spec: trimmed };
    return { spec, as: alias[1]! };
};

/**
 * Registers `addon` into the registry the server dispatches.
 * @param server - The server whose addons it manages, read when the command runs.
 */
export const registerAddonCommand = (registry: CommandRegistry<CommandSource>, server: Server): void => {
    // The installer logs what it does, and the console is where the log goes, so the closing line
    // is logged too rather than sent as feedback that `sendCommandFeedback` could silence.
    const run = (work: () => Promise<string | undefined>): number => {
        deferCommandWork(
            work().then((line) => {
                if (line !== undefined) server.getLogger().info(line);
            })
        );
        // The command ran; the work it started is parked.
        return 1;
    };

    registry.register(
        lit('addon')
            .requires(isConsoleSource)
            .then(
                lit('list').executes(
                    command(() =>
                        run(async () => {
                            const addons = await server.getAddons().list();
                            const log = server.getLogger();
                            if (addons.length === 0)
                                return 'No addons are installed; addon install <name> installs one';
                            log.info(`§6${addons.length} addon(s):`);
                            for (const addon of addons) log.info(`- ${listLine(addon)}`);
                            return undefined;
                        })
                    )
                )
            )
            .then(
                lit('install').then(
                    arg('addon', messageArgument()).executes(
                        command((context) =>
                            run(async () => {
                                const { spec, as } = installArguments(value<string>(context, 'addon'));
                                await server.getAddons().install(spec, as);
                                return undefined;
                            })
                        )
                    )
                )
            )
            .then(
                lit('update')
                    .executes(
                        command(() =>
                            run(async () => {
                                const changed = await server.getAddons().update();
                                return changed.length === 0 ? 'Every addon is up to date' : undefined;
                            })
                        )
                    )
                    .then(
                        arg('name', stringArgument()).executes(
                            command((context) =>
                                run(async () => {
                                    await server.getAddons().update(value<string>(context, 'name'));
                                    return undefined;
                                })
                            )
                        )
                    )
            )
            .then(
                lit('remove').then(
                    arg('name', stringArgument()).executes(
                        command((context) =>
                            run(async () => {
                                await server.getAddons().remove(value<string>(context, 'name'));
                                return undefined;
                            })
                        )
                    )
                )
            )
            .then(
                lit('sync').executes(
                    command(() =>
                        run(async () => {
                            const failed = await server.getAddons().sync();
                            return failed.length === 0
                                ? 'Addons are in line with addons.json and addons.lock.json'
                                : `§c${failed.length} addon(s) could not be installed: ${failed.join(', ')}`;
                        })
                    )
                )
            ),
        {
            description: 'Installs, updates, lists and removes addons. Only the console runs it.',
            permissionLevel: CommandPermissionLevel.INTERNAL
        }
    );
};

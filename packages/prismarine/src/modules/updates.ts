import type { KernelLogger, Module } from '@jsprismarine/kernel';

import type { UpdateCheck, UpdateChecker } from '../updates/UpdateChecker';
import type { AvailableUpdate, UpdateStatus } from '../updates/status';
import { decideUpdateCheck, updateTargetOf } from '../updates/decision';
import type { UpdateTarget } from '../updates/decision';
import type { UpdateSettings } from '../updates/settings';
import { errorMessage } from '../utils/errorMessage';
import type { Environment } from '../utils/isTestRunner';
import { unrefTimer } from '../utils/unrefTimer';
import type { CancelableTimer } from '../utils/unrefTimer';
import { buildDefines, serverVersion } from '../version';
import type { BuildDefines } from '../version';
import { updatesToken } from './tokens';

/** The node a player needs to hear about updates in chat. Operators hold it through `*`. */
export const UPDATE_NOTIFY_PERMISSION = 'jsprismarine.updates.notify';

/** How long after startup the first scheduled check runs, so it never competes with the start itself. */
export const FIRST_UPDATE_CHECK_DELAY_MS = 60_000;

/** A player the server can tell about an update. */
export interface UpdateNoticeTarget {
    hasPermission(node: string): boolean;
    sendMessage(message: string): Promise<void>;
}

/** The server's update checks, provided as `prismarine:updates`. */
export interface Updates {
    /** What the server knows: the last check's outcome, or why it does not check. */
    status(): UpdateStatus;
    /**
     * Checks now, whatever the schedule, and tells online players who hold
     * {@link UPDATE_NOTIFY_PERMISSION} about a build no check found before. It runs even when the
     * schedule is off, which is how `update check` works on a server run from a checkout.
     */
    check(): Promise<UpdateStatus>;
    /** Tells a player who just joined about a known update, when they hold the node. */
    welcome(player: UpdateNoticeTarget): Promise<void>;
}

/** What {@link updatesModule} reads. */
export interface UpdatesModuleOptions {
    /** The `updates` settings, read at each start, after the config has loaded. */
    readonly settings: () => UpdateSettings;
    /** The players online, told when a check finds a new build. */
    readonly players: () => readonly UpdateNoticeTarget[];
    /** The process's own by default. */
    readonly env?: Environment;
    /** This build's stamps by default. */
    readonly build?: BuildDefines;
    /** The global `fetch` by default. */
    readonly fetch?: typeof fetch;
    /** An unreferenced `setTimeout` by default. */
    readonly setTimer?: CancelableTimer;
    /** `Date.now` by default. */
    readonly now?: () => number;
}

/** The chat line a player who holds the node sees. */
const chatLine = (update: AvailableUpdate, current: string): string =>
    `§eJSPrismarine ${update.version} is out§r; this server runs ${current}. Release notes: ${update.notes}`;

/**
 * Provides {@link Updates} as `prismarine:updates` and, when {@link decideUpdateCheck} allows it,
 * checks shortly after each start and then every `updates.interval` minutes. A check that finds a
 * new build logs it once and tells the players online who hold {@link UPDATE_NOTIFY_PERMISSION}.
 *
 * The checker's code loads with a dynamic import the first time it is needed, so a server whose
 * checks are off, such as one run from a checkout, never loads it unless `update check` asks.
 * @param options - Where the settings and players come from, and the clock and `fetch` to use.
 * @returns The module to register on the kernel.
 */
export const updatesModule = (options: UpdatesModuleOptions): Module => {
    const { env = process.env, build = buildDefines(), setTimer = unrefTimer } = options;
    const current = serverVersion(build);
    let logger: KernelLogger | undefined;
    let checker: UpdateChecker | undefined;
    let checkerTarget: UpdateTarget | undefined;
    let off: UpdateStatus | undefined;
    let cancel: (() => void) | undefined;

    const checkerFor = async (target: UpdateTarget): Promise<UpdateChecker> => {
        if (
            checker !== undefined &&
            checkerTarget?.channel === target.channel &&
            checkerTarget.source === target.source
        ) {
            return checker;
        }
        const { UpdateChecker } = await import('../updates/UpdateChecker');
        checker = new UpdateChecker({
            current,
            channel: target.channel,
            source: target.source,
            logger: logger ?? { warn: () => undefined, debug: () => undefined },
            ...(options.fetch === undefined ? {} : { fetch: options.fetch }),
            ...(options.now === undefined ? {} : { now: options.now })
        });
        checkerTarget = target;
        return checker;
    };

    const tellPlayers = async (update: AvailableUpdate): Promise<void> => {
        await Promise.all(
            options
                .players()
                .filter((player) => player.hasPermission(UPDATE_NOTIFY_PERMISSION))
                .map((player) => player.sendMessage(chatLine(update, current)))
        );
    };

    const announce = async ({ found }: UpdateCheck, log: boolean): Promise<void> => {
        if (found === undefined) return;
        if (log) {
            logger?.info(
                `JSPrismarine ${found.version} is out; this server runs ${current}. Release notes: ${found.notes}`
            );
        }
        await tellPlayers(found);
    };

    const service: Updates = {
        status: () => checker?.status() ?? off ?? { state: 'unchecked' },
        check: async () => {
            const target = updateTargetOf(options.settings(), build);
            if (target === undefined) {
                return { state: 'off', reason: 'config.json holds an updates setting it cannot use' };
            }
            const result = await (await checkerFor(target)).check();
            // `update check` prints the outcome itself, so only the players hear about it here.
            await announce(result, false);
            return result.status;
        },
        welcome: async (player) => {
            const update = checker?.available();
            if (update === undefined || !player.hasPermission(UPDATE_NOTIFY_PERMISSION)) return;
            await player.sendMessage(chatLine(update, current));
        }
    };

    return {
        id: 'prismarine:updates',
        register: (ctx) => {
            ctx.provide(updatesToken, service);
        },
        start: async (ctx) => {
            logger = ctx.logger;
            const settings = options.settings();
            for (const problem of settings.problems) ctx.logger.warn(problem);
            const decision = decideUpdateCheck({ env, settings, build });
            if (!decision.on) {
                off = { state: 'off', reason: decision.reason };
                ctx.logger[decision.level](`Update checks are off because ${decision.reason}`);
                return;
            }
            off = undefined;
            const scheduled = await checkerFor(decision.target);
            const intervalMs = settings.interval * 60_000;
            const run = (): void => {
                scheduled
                    .check()
                    .then((result) => announce(result, true))
                    .catch((error: unknown) => ctx.logger.warn(`Update check failed: ${errorMessage(error)}`))
                    .finally(() => {
                        if (cancel !== undefined) cancel = setTimer(run, intervalMs);
                    });
            };
            cancel = setTimer(run, FIRST_UPDATE_CHECK_DELAY_MS);
        },
        stop: () => {
            cancel?.();
            cancel = undefined;
        }
    };
};

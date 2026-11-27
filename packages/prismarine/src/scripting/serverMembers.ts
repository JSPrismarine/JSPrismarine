/**
 * What `@jsprismarine/server`'s `performance`, `getPing`, `bossBars`, `playerList` and
 * `serverList` reach of the server: its ticker's figures, a player's round trip time from their
 * transport, boss bars on a player's own screen, the name a player's entry shows in every
 * client's player list, and the status every transport advertises in a server list.
 */
import { PrismarineServerErrors } from '@jsprismarine/errors/prismarine/server';
import { BossBarColor } from '@jsprismarine/protocol/bedrock/packet/BossEventPacket';
import type {
    JsprismarineServerMembers,
    ScriptBossBarState,
    ScriptLevelInfo,
    ScriptLevelMembers,
    ScriptPermissionMembers,
    ScriptServerListMembers
} from '@jsprismarine/script-host/host/jsprismarineMembers';
import type { JsprismarineBossBarColor } from '@jsprismarine/script-host/host/jsprismarineServer';

import { sameSubject } from '../identity/Subject';
import { BossBar } from '../player/BossBar';
import type PlayerSession from '../player/PlayerSession';
import type { PermissionManager } from '../permission/PermissionManager';
import { checkExpiry, checkNode } from '../permission/model';
import type { ServerStatus } from '../network/ServerStatus';
import type Server from '../Server';
import { SeedGenerator } from '../utils/Seed';
import type { Level } from '../world/Level';
import { DEFAULT_CREATED_PRESET } from '../world/LevelRegistry';
import { transferToLevel } from '../world/levelTransfer';
import { PrismarineWorldErrors } from '@jsprismarine/errors/prismarine/world';

/** The wire's color of each color a script names. */
const BAR_COLORS: Readonly<Record<JsprismarineBossBarColor, BossBarColor>> = {
    pink: BossBarColor.Pink,
    blue: BossBarColor.Blue,
    red: BossBarColor.Red,
    green: BossBarColor.Green,
    yellow: BossBarColor.Yellow,
    purple: BossBarColor.Purple,
    rebeccaPurple: BossBarColor.RebeccaPurple,
    white: BossBarColor.White
};

/** One player's script bars: the one network bar they see, and every bar the scripts gave them, oldest first. */
interface Screen {
    readonly session: PlayerSession;
    readonly bar: BossBar;
    readonly bars: { readonly id: number; state: ScriptBossBarState }[];
    /** What the network bar shows. */
    drawn: ScriptBossBarState;
    /**
     * Whether a send failed, so the client may not show what `drawn` says. The next draw sends the
     * whole bar again rather than the fields that changed.
     */
    stale: boolean;
    /**
     * Once the player has no script bar left, whether the Remove that takes the network bar away
     * is on its way or failed. The screen stays until a Remove arrives, so it can be sent again.
     */
    removal?: 'sending' | 'failed';
}

/** How many times a player's last Remove is sent in a row before it waits for the next hide. */
const REMOVE_ATTEMPTS = 3;

/**
 * The boss bars the scripts show, per player. The client keys a boss bar by the actor it is bound
 * to, and a script's bar has no actor of its own, so each player gets one bar, bound to their own
 * entity, which shows the script bar shown last. Hiding that one shows the one before it again.
 */
export class ScriptBossBarScreens {
    private readonly screens = new Map<string, Screen>();
    private readonly sessionOf: (player: string) => PlayerSession | undefined;

    /** @param sessionOf - The session of a player, by the entity id the scripts know them by. */
    public constructor(sessionOf: (player: string) => PlayerSession | undefined) {
        this.sessionOf = sessionOf;
    }

    /** Puts a bar in front of the player's other script bars. A player without a session sees nothing. */
    public show(player: string, id: number, state: ScriptBossBarState): void {
        const existing = this.screens.get(player);
        if (existing !== undefined) {
            if (existing.bars.length === 0) {
                // The network bar is being taken away, or failed to be, so the bar goes again whole.
                existing.removal = undefined;
                existing.stale = true;
            }
            existing.bars.push({ id, state });
            this.draw(existing);
            return;
        }
        const session = this.sessionOf(player);
        if (session === undefined) return;
        const bar = new BossBar({ actorUniqueId: session.runtimeId, name: state.text, color: BAR_COLORS[state.color] });
        const screen: Screen = { session, bar, bars: [{ id, state }], drawn: state, stale: false };
        this.screens.set(player, screen);
        // Both run now: the bar has no subscriber yet when its fill is set, and has the player before
        // anything else the scripts do this tick reaches it.
        const filled = bar.setPercent(state.progress);
        this.deliver(screen, [filled, bar.addPlayer(session)]);
    }

    /** Changes what a bar shows, and redraws it when it is the one the player sees. */
    public update(player: string, id: number, state: ScriptBossBarState): void {
        const screen = this.screens.get(player);
        const shown = screen?.bars.find((bar) => bar.id === id);
        if (screen === undefined || shown === undefined) return;
        shown.state = state;
        this.draw(screen);
    }

    /**
     * Takes a bar away. The player sees the bar before it, or none once they have no script bar
     * left. Hiding again after the last Remove failed sends it again.
     */
    public hide(player: string, id: number): void {
        const screen = this.screens.get(player);
        if (screen === undefined) return;
        if (screen.bars.length === 0) {
            if (screen.removal === 'failed') this.remove(player, screen);
            return;
        }
        const index = screen.bars.findIndex((bar) => bar.id === id);
        if (index < 0) return;
        screen.bars.splice(index, 1);
        if (screen.bars.length > 0) this.draw(screen);
        else this.remove(player, screen);
    }

    /**
     * Takes the network bar off the screen of a player with no script bar left. A Remove that
     * fails goes again while the player is connected, up to {@link REMOVE_ATTEMPTS} times; a bar
     * shown in the meantime stops it, since its draw sends the whole bar.
     */
    private remove(player: string, screen: Screen, attempt = 1): void {
        const { session, bar } = screen;
        screen.removal = 'sending';
        const removing = () => this.screens.get(player) === screen && screen.bars.length === 0;
        // A Remove goes only to a subscribed player, and one that failed has unsubscribed them, so
        // they subscribe again first. The Add that sends follows the failed Remove, so it is shown
        // for no longer than it takes the Remove after it to arrive.
        const sends = Promise.all([bar.addPlayer(session), bar.removePlayer(session)]);
        session.released(
            sends.then(
                () => {
                    if (removing()) this.screens.delete(player);
                },
                (error: unknown) => {
                    if (!removing()) throw error;
                    if (!session.isConnected()) this.screens.delete(player);
                    else if (attempt < REMOVE_ATTEMPTS) this.remove(player, screen, attempt + 1);
                    else screen.removal = 'failed';
                    throw error;
                }
            )
        );
    }

    /**
     * Makes the player's network bar show their newest script bar. Each field is sent only when it
     * changed, unless a send failed since the last draw: then the bar goes to the player again whole.
     */
    private draw(screen: Screen): void {
        const { session, bar, bars, drawn } = screen;
        const newest = bars.at(-1)?.state;
        if (newest === undefined) return;
        screen.drawn = newest;
        if (screen.stale) {
            screen.stale = false;
            // Without the player subscribed these only set the bar; the Add carries all of it.
            const removed = bar.removePlayer(session);
            void bar.setName(newest.text);
            void bar.setPercent(newest.progress);
            void bar.setColor(BAR_COLORS[newest.color]);
            this.deliver(screen, [removed, bar.addPlayer(session)]);
            return;
        }
        this.deliver(screen, [
            newest.text === drawn.text ? undefined : bar.setName(newest.text),
            newest.progress === drawn.progress ? undefined : bar.setPercent(newest.progress),
            newest.color === drawn.color ? undefined : bar.setColor(BAR_COLORS[newest.color])
        ]);
    }

    /** Hands a draw's sends to the session, and marks the screen stale when one fails. */
    private deliver(screen: Screen, sends: readonly (Promise<void> | undefined)[]): void {
        screen.session.released(
            Promise.all(sends).then(
                () => undefined,
                (error: unknown) => {
                    screen.stale = true;
                    throw error;
                }
            )
        );
    }
}

/**
 * `permissions` of `@jsprismarine/server` over the permission manager. A bad argument throws the
 * manager's own error before anything is written; a write then persists on the manager's queue,
 * and a failed write is logged by the manager, not thrown to the script.
 * @param permissions - The server's permission manager.
 * @param sessionOf - The session of a player, by the entity id the scripts know them by.
 * @param sessions - Every online session, for naming the player a change touched.
 */
export const scriptPermissionMembers = (
    permissions: PermissionManager,
    sessionOf: (player: string) => PlayerSession | undefined,
    sessions: () => readonly PlayerSession[]
): ScriptPermissionMembers => {
    /** The identity of an online player. @throws PlayerNotFound for one who left. */
    const identityOf = (player: string) => {
        const session = sessionOf(player);
        if (session === undefined) throw new PrismarineServerErrors.PlayerNotFound({ username: player });
        return session.identity;
    };
    /** @throws PermissionGroupNotFound when the file has no such group. */
    const checkGroup = (group: string): string => {
        if (permissions.groupOf(group) === undefined)
            throw new PrismarineServerErrors.PermissionGroupNotFound({ group });
        return group;
    };
    /** Checks what a write takes before it is queued, so the script hears of a bad argument at the call. */
    const checked = (node: string, expires: string | undefined): string | undefined => {
        checkNode(node);
        return expires === undefined ? undefined : checkExpiry(expires, Date.now());
    };
    /** Hands a write to the manager's queue; the manager logs a failure, so nothing is left to hear. */
    const queued = (write: Promise<unknown>): void => void write.catch(() => {});
    return {
        has: (player, node) => permissions.has(identityOf(player), node),
        groupsOf: (player) => permissions.groupsOf(identityOf(player)),
        primaryGroupOf: (player) => permissions.primaryGroupOf(identityOf(player)),
        metaOf: (player, key) => permissions.metaOf(identityOf(player), key),
        weightOf: (player) => permissions.groupOf(permissions.primaryGroupOf(identityOf(player)))?.weight ?? 0,
        grant: (player, node, expires) => {
            const identity = identityOf(player);
            queued(permissions.grantUser(identity, node, checked(node, expires)));
        },
        revoke: (player, node) => queued(permissions.revokeUser(identityOf(player), node)),
        grantToGroup: (group, node, expires) => {
            checkGroup(group);
            queued(permissions.grantGroup(group, node, checked(node, expires)));
        },
        revokeFromGroup: (group, node) => queued(permissions.revokeGroup(checkGroup(group), node)),
        addToGroup: (player, group, expires) => {
            const identity = identityOf(player);
            checkGroup(group);
            const until = expires === undefined ? undefined : checkExpiry(expires, Date.now());
            queued(permissions.addToGroup(identity, group, until));
        },
        removeFromGroup: (player, group) => queued(permissions.removeFromGroup(identityOf(player), group)),
        onChange: (listener) =>
            permissions.onChange(({ subject, name, group }) => {
                if (group !== undefined) {
                    listener({ target: { group } });
                    return;
                }
                if (subject === undefined) {
                    listener({});
                    return;
                }
                const session = sessions().find((candidate) => sameSubject(candidate.identity.subject, subject));
                listener({
                    target: {
                        name: name ?? permissions.userOf(subject)?.name ?? session?.identity.name ?? '',
                        ...(session === undefined ? {} : { player: String(session.getRuntimeId()) })
                    }
                });
            })
    };
};

/**
 * `serverList` of `@jsprismarine/server` over the status every transport advertises. Each pack's
 * scripts are an owner of their own, and a change shows on every transport at once.
 * @param status - The server's status.
 */
export const scriptServerListMembers = (status: ServerStatus): ScriptServerListMembers => ({
    current: () => {
        const { motd, levelName, onlinePlayers, maxPlayers } = status.current();
        return { motd, levelName, onlinePlayers, maxPlayers };
    },
    update: (owner, fields) => status.override(owner, fields),
    reset: (owner) => status.clear(owner)
});

/**
 * `levels` of `@jsprismarine/server` over the world manager, for the runtime of one level.
 * @param server - The server whose levels they read and change.
 * @param level - The level the runtime's packs run in.
 * @param sessionOf - The session of a player, by the entity id the scripts know them by.
 */
export const scriptLevelMembers = (
    server: Server,
    level: Level,
    sessionOf: (player: string) => PlayerSession | undefined
): ScriptLevelMembers => {
    const manager = () => server.getWorldManager();
    const infoOf = (attached: Level): ScriptLevelInfo => ({
        id: attached.id,
        name: attached.name,
        attached: true,
        entry: attached === manager().getEntryLevel(),
        players: server
            .getSessionManager()
            .getSessions()
            .filter((session) => session.getWorld().getLevel() === attached)
            .map((session) => session.identity.name)
    });
    return {
        current: () => infoOf(level),
        list: () => {
            const attached = manager().getLevels();
            const ids = new Set(attached.map((each) => each.id));
            return [
                ...attached.map(infoOf),
                ...manager()
                    .getRegisteredLevels()
                    .filter((record) => !ids.has(record.id))
                    .map((record) => ({ id: record.id, name: record.name, attached: false, entry: false, players: [] }))
            ];
        },
        levelOf: (player) => {
            const session = sessionOf(player);
            return session === undefined ? undefined : infoOf(session.getWorld().getLevel());
        },
        transfer: async (player, name, toSpawn) => {
            const target = manager().getLevel(name) ?? manager().getLevelById(name);
            if (target === undefined) throw new PrismarineWorldErrors.LevelNotAttached({ name });
            const session = sessionOf(player);
            return session === undefined ? false : transferToLevel(server, session, target, { toSpawn });
        },
        create: async (name, preset, seed) =>
            infoOf(
                await manager().createLevel(name, {
                    preset: preset ?? DEFAULT_CREATED_PRESET,
                    seed: seed ?? SeedGenerator().toString()
                })
            ),
        attach: async (name) => infoOf(await manager().attachLevel(name)),
        detach: (name) => manager().detachLevel(name)
    };
};

/**
 * The members of `@jsprismarine/server` that reach a running server.
 * @param server - The server whose ticker, sessions and transports they read.
 * @param level - The level the runtime's packs run in.
 */
export const scriptServerMembers = (server: Server, level: Level): JsprismarineServerMembers => {
    const sessionOf = (player: string): PlayerSession | undefined =>
        server
            .getSessionManager()
            .getSessions()
            .find((session) => String(session.getRuntimeId()) === player);
    const screens = new ScriptBossBarScreens(sessionOf);
    return {
        permissions: scriptPermissionMembers(server.getPermissionManager(), sessionOf, () =>
            server.getSessionManager().getSessions()
        ),
        levels: scriptLevelMembers(server, level, sessionOf),
        serverList: scriptServerListMembers(server.getServerStatus()),
        performance: () => ({
            tps: server.getTPS(),
            tpsAverages: server.getTPSAverages(),
            lastTickMs: server.getLastTickMs(),
            averageTickMs: server.getTickMs()
        }),
        ping: (player) => sessionOf(player)?.getConnection().getRoundTripTime(),
        showBossBar: (player, id, state) => screens.show(player, id, state),
        updateBossBar: (player, id, state) => screens.update(player, id, state),
        hideBossBar: (player, id) => screens.hide(player, id),
        setPlayerListName: (player, name) => {
            const session = sessionOf(player);
            session?.released(session.setPlayerListName(name));
        },
        resetPlayerListName: (player) => {
            const session = sessionOf(player);
            session?.released(session.setPlayerListName());
        }
    };
};

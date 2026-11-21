/**
 * What `@jsprismarine/server`'s `performance`, `getPing` and `bossBars` reach of the server: its
 * ticker's figures, a player's round trip time from their transport, and boss bars on a player's
 * own screen.
 */
import { BossBarColor } from '@jsprismarine/protocol/bedrock/packet/BossEventPacket';
import type { JsprismarineServerMembers, ScriptBossBarState } from '@jsprismarine/script-host/host/jsprismarineMembers';
import type { JsprismarineBossBarColor } from '@jsprismarine/script-host/host/jsprismarineServer';

import { BossBar } from '../network/BossBar';
import type PlayerSession from '../network/PlayerSession';
import type Server from '../Server';

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
 * The members of `@jsprismarine/server` that reach a running server.
 * @param server - The server whose ticker, sessions and transports they read.
 */
export const scriptServerMembers = (server: Server): JsprismarineServerMembers => {
    const sessionOf = (player: string): PlayerSession | undefined =>
        server
            .getSessionManager()
            .getSessions()
            .find((session) => String(session.getRuntimeId()) === player);
    const screens = new ScriptBossBarScreens(sessionOf);
    return {
        performance: () => ({
            tps: server.getTPS(),
            tpsAverages: server.getTPSAverages(),
            lastTickMs: server.getLastTickMs(),
            averageTickMs: server.getTickMs()
        }),
        ping: (player) => sessionOf(player)?.getConnection().getRoundTripTime(),
        showBossBar: (player, id, state) => screens.show(player, id, state),
        updateBossBar: (player, id, state) => screens.update(player, id, state),
        hideBossBar: (player, id) => screens.hide(player, id)
    };
};

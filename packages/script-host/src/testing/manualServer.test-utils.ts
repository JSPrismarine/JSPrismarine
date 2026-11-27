/**
 * A server double for `@jsprismarine/server`'s live members, for tests that run an addon's pack
 * over a memory world: the test sets its figures and pings before each tick, and reads the bars and
 * the player list names the pack gave each player, and what the server list shows.
 */
import type {
    JsprismarineServerMembers,
    ScriptBossBarState,
    ScriptLevelMembers,
    ScriptPerformance,
    ScriptServerListMembers,
    ScriptServerListStatus
} from '../host/jsprismarineMembers';

/** A server list that shows the last change made to it, or its own values after a reset. */
export class ManualServerList implements ScriptServerListMembers {
    public static readonly OWN: ScriptServerListStatus = {
        motd: 'A JSPrismarine server',
        levelName: 'JSPrismarine',
        onlinePlayers: 2,
        maxPlayers: 20
    };
    /** Every change, as `update <fields>` or `reset`. */
    public readonly calls: string[] = [];
    private shown = ManualServerList.OWN;

    public current(): ScriptServerListStatus {
        return this.shown;
    }
    public update(_owner: object, fields: Partial<ScriptServerListStatus>): void {
        this.calls.push(`update ${JSON.stringify(fields)}`);
        this.shown = { ...this.shown, ...fields };
    }
    public reset(): void {
        this.calls.push('reset');
        this.shown = ManualServerList.OWN;
    }
}

/** A server whose figures the test sets before each tick, and which keeps what each player sees. */
export class ManualServer implements JsprismarineServerMembers {
    public current: ScriptPerformance = { tps: 20, tpsAverages: [20, 20, 20], lastTickMs: 0, averageTickMs: 0 };
    public readonly pings = new Map<string, number>();
    /** Every bar call, as `show`, `update` or `hide` and the player. */
    public readonly calls: string[] = [];
    /** What each player's bar shows, while they have one. */
    public readonly screens = new Map<string, ScriptBossBarState>();
    /** What each player's list entry shows, while a pack has set it. */
    public readonly listNames = new Map<string, string>();
    /** Every player list call, as `name <player> <name>` or `unname <player>`. */
    public readonly listCalls: string[] = [];
    /** The server's levels, when the test gives it some. */
    public levels?: ScriptLevelMembers;
    /** The server list, when the test gives the server one. */
    public serverList?: ManualServerList;

    public performance(): ScriptPerformance {
        return this.current;
    }
    public ping(player: string): number | undefined {
        return this.pings.get(player);
    }
    public showBossBar(player: string, _bar: number, state: ScriptBossBarState): void {
        this.calls.push(`show ${player}`);
        this.screens.set(player, state);
    }
    public updateBossBar(player: string, _bar: number, state: ScriptBossBarState): void {
        this.calls.push(`update ${player}`);
        this.screens.set(player, state);
    }
    public hideBossBar(player: string): void {
        this.calls.push(`hide ${player}`);
        this.screens.delete(player);
    }
    public setPlayerListName(player: string, name: string): void {
        this.listCalls.push(`name ${player} ${name}`);
        this.listNames.set(player, name);
    }
    public resetPlayerListName(player: string): void {
        this.listCalls.push(`unname ${player}`);
        this.listNames.delete(player);
    }
}

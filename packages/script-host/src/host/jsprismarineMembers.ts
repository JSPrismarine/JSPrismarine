/**
 * What the members of `@jsprismarine/server` that reach the running server read and show: the
 * embedder's side of `performance`, `getPing`, `bossBars`, `playerList` and `serverList`, the
 * boss bars the packs show, the player list names and the server list changes they make.
 */
import { ScriptHostErrors } from '@jsprismarine/errors/script-host';

import type { ScriptEngine } from '../ScriptEngine';
import type { ScriptValue } from '../values';
import { ScriptHandle } from '../values';
import type { JsprismarineBossBarColor } from './jsprismarineServer';
import type { JSPRISMARINE_SERVER } from './jsprismarineServer';
import { JSPRISMARINE_TYPES } from './jsprismarineServer';

/** The properties the `performance` member of `@jsprismarine/server` declares. */
export type PerformanceProperties = (typeof JSPRISMARINE_SERVER)['performance']['properties'];

/** How fast the server ticks, with a value for each property `performance` declares. */
export type ScriptPerformance = {
    readonly [Key in keyof PerformanceProperties]: PerformanceProperties[Key]['type'] extends 'numbers'
        ? readonly number[]
        : number;
};

/** What one boss bar shows. */
export interface ScriptBossBarState {
    readonly text: string;
    /** From 0 to 1. */
    readonly progress: number;
    readonly color: JsprismarineBossBarColor;
}

/** What a permission change touched: a group by name, or a user by the name their record shows and their entity id while online. */
export type ScriptPermissionsTarget = { readonly group: string } | { readonly name: string; readonly player?: string };

/** A permission change. `target` is absent after the files were read again, which may have changed anything. */
export interface ScriptPermissionsChange {
    readonly target?: ScriptPermissionsTarget;
}

/**
 * What `permissions` in `@jsprismarine/server` reads and writes of the server's permission files.
 * Players are named by their entity ids and groups by their names. A write persists on the
 * server's own schedule; a bad argument throws before anything is written.
 */
export interface ScriptPermissionMembers {
    has(player: string, node: string): boolean;
    /** The groups the player holds directly, heaviest first. */
    groupsOf(player: string): readonly string[];
    primaryGroupOf(player: string): string;
    metaOf(player: string, key: string): string | undefined;
    /** The weight of the player's primary group. */
    weightOf(player: string): number;
    /** @throws For a malformed node or expiry, or a player who left. */
    grant(player: string, node: string, expires?: string): void;
    revoke(player: string, node: string): void;
    /** @throws For a malformed node or expiry, or a group the file lacks. */
    grantToGroup(group: string, node: string, expires?: string): void;
    revokeFromGroup(group: string, node: string): void;
    /** @throws For a malformed expiry, a group the file lacks, or a player who left. */
    addToGroup(player: string, group: string, expires?: string): void;
    removeFromGroup(player: string, group: string): void;
    /** Hears of every change, however it was made. @returns A function that stops listening. */
    onChange(listener: (change: ScriptPermissionsChange) => void): () => void;
}

/** What a server list shows of the server, as `serverList` in `@jsprismarine/server` reads it. */
export interface ScriptServerListStatus {
    readonly motd: string;
    /** The second name, below the MOTD. */
    readonly levelName: string;
    readonly onlinePlayers: number;
    readonly maxPlayers: number;
}

/**
 * What `serverList` in `@jsprismarine/server` reads and changes of the status every transport
 * advertises. Each change belongs to an owner, one pack's scripts, and the owner that changed a
 * field last shows.
 */
export interface ScriptServerListMembers {
    /** What the list shows now. */
    current(): ScriptServerListStatus;
    /** Layers an owner's changes over the status, merged with its earlier ones. */
    update(owner: object, fields: Partial<ScriptServerListStatus>): void;
    /** Takes every change an owner made back. */
    reset(owner: object): void;
}

/** One level, as `levels` in `@jsprismarine/server` gives it. */
export interface ScriptLevelInfo {
    readonly id: string;
    readonly name: string;
    readonly attached: boolean;
    /** Whether players join the server in it. */
    readonly entry: boolean;
    /** The names of the players in it. */
    readonly players: readonly string[];
}

/**
 * What `levels` in `@jsprismarine/server` reads and changes of the server's levels, for the
 * runtime of one level. A level is named by its name or its UUID, and players by their entity ids.
 * The operations that take a while answer a promise, which rejects with a message for a script.
 */
export interface ScriptLevelMembers {
    /** The level the runtime's packs run in. */
    current(): ScriptLevelInfo;
    /** Every level, the attached ones first. */
    list(): readonly ScriptLevelInfo[];
    /** The level a player is in, or undefined for a player who left. */
    levelOf(player: string): ScriptLevelInfo | undefined;
    /** Moves a player to an attached level. @returns Whether the move landed. */
    transfer(player: string, level: string, toSpawn: boolean): Promise<boolean>;
    create(name: string, preset: string | undefined, seed: string | undefined): Promise<ScriptLevelInfo>;
    attach(level: string): Promise<ScriptLevelInfo>;
    detach(level: string): Promise<void>;
}

/**
 * What `@jsprismarine/server`'s members that reach the running server read and show. Players are
 * named by their entity ids, as `ScriptWorld.players` lists them. Boss bars are named by an id
 * the runtime gives each bar, which no other bar of the runtime has, a reload included.
 */
export interface JsprismarineServerMembers {
    /** The permission files. Without it the module leaves `permissions` out, as an older server would. */
    readonly permissions?: ScriptPermissionMembers;
    /** The server's levels. Without it the module leaves `levels` out. */
    readonly levels?: ScriptLevelMembers;
    /** What a server list shows. Without it the module leaves `serverList` out. */
    readonly serverList?: ScriptServerListMembers;
    /** How fast the server ticks right now. */
    performance(): ScriptPerformance;
    /** A player's round trip time in milliseconds, or undefined while there is no sample. */
    ping(player: string): number | undefined;
    /** Puts a new bar on a player's screen, in front of the bars they already see. */
    showBossBar(player: string, bar: number, state: ScriptBossBarState): void;
    /** Changes what a bar on a player's screen shows, where it is. */
    updateBossBar(player: string, bar: number, state: ScriptBossBarState): void;
    /** Takes a bar off a player's screen. */
    hideBossBar(player: string, bar: number): void;
    /** Changes the name every client's player list shows for a player. */
    setPlayerListName(player: string, name: string): void;
    /** Gives a player's player list entry its login name back. */
    resetPlayerListName(player: string): void;
}

/** The owner of the namespaces the server registers, such as `perms`, which outlive a reload. */
export const SERVER_PLACEHOLDER_OWNER = { name: 'JSPrismarine' };

/** What a bar shows when the pack shows it without a property. */
const DEFAULT_BAR: ScriptBossBarState = { text: '', progress: 1, color: 'pink' };

const BAR_COLORS: readonly string[] = JSPRISMARINE_TYPES.BossBarColor.values;

const isBarColor = (value: unknown): value is JsprismarineBossBarColor =>
    typeof value === 'string' && BAR_COLORS.includes(value);

/** Reads one property of a pack's object, freeing the handle a property that is an object gives. */
const readProperty = (engine: ScriptEngine, object: ScriptHandle, key: string): ScriptValue => {
    const value = engine.get(object, key);
    if (value instanceof ScriptHandle) engine.free(value);
    return value;
};

/**
 * The properties a pack passed as `BossBarOptions`, checked. A property it leaves out is absent.
 * @param member - The member the pack called, which an error names.
 * @throws {TypeError} When the options are not an object, or a property is not of its type.
 */
export const bossBarOptions = (
    engine: ScriptEngine,
    value: ScriptValue,
    member: string
): Partial<ScriptBossBarState> => {
    if (value === undefined) return {};
    if (!(value instanceof ScriptHandle)) {
        throw new ScriptHostErrors.JspModuleArgument({ member, expected: 'an object', argument: 'options' });
    }
    const text = readProperty(engine, value, 'text');
    if (text !== undefined && typeof text !== 'string') {
        throw new ScriptHostErrors.JspModuleArgument({ member, expected: 'a string', argument: 'text' });
    }
    const progress = readProperty(engine, value, 'progress');
    if (progress !== undefined && (typeof progress !== 'number' || !Number.isFinite(progress))) {
        throw new ScriptHostErrors.JspModuleArgument({ member, expected: 'a finite number', argument: 'progress' });
    }
    const color = readProperty(engine, value, 'color');
    if (color !== undefined && !isBarColor(color)) {
        throw new ScriptHostErrors.JspModuleArgument({
            member,
            expected: `one of ${BAR_COLORS.join(', ')}`,
            argument: 'color'
        });
    }
    return {
        ...(text === undefined ? {} : { text }),
        ...(progress === undefined ? {} : { progress: Math.min(1, Math.max(0, progress)) }),
        ...(color === undefined ? {} : { color })
    };
};

/** The largest count a server list carries: Java Edition's status reads the counts as 32-bit integers. */
const MAX_COUNT = 2_147_483_647;

/**
 * The changes a pack's `serverList.update` options ask for, checked.
 * @throws JspModuleArgument for options that are not an object, a name that is not a string or
 *   holds a `;`, or a count that is not a whole number from 0 to {@link MAX_COUNT}.
 */
export const serverListOptions = (
    engine: ScriptEngine,
    value: ScriptValue,
    member: string
): Partial<ScriptServerListStatus> => {
    if (!(value instanceof ScriptHandle)) {
        throw new ScriptHostErrors.JspModuleArgument({ member, expected: 'an object', argument: 'options' });
    }
    const name = (key: 'motd' | 'levelName'): string | undefined => {
        const text = readProperty(engine, value, key);
        if (text === undefined) return undefined;
        // RakNet's pong separates its fields with `;`, so one in a name would shift every field after it.
        if (typeof text !== 'string' || text.includes(';'))
            throw new ScriptHostErrors.JspModuleArgument({ member, expected: 'a string without `;`', argument: key });
        return text;
    };
    const count = (key: 'onlinePlayers' | 'maxPlayers'): number | undefined => {
        const number = readProperty(engine, value, key);
        if (number === undefined) return undefined;
        if (typeof number !== 'number' || !Number.isInteger(number) || number < 0 || number > MAX_COUNT) {
            throw new ScriptHostErrors.JspModuleArgument({
                member,
                expected: `a whole number from 0 to ${MAX_COUNT}`,
                argument: key
            });
        }
        return number;
    };
    const motd = name('motd');
    const levelName = name('levelName');
    const onlinePlayers = count('onlinePlayers');
    const maxPlayers = count('maxPlayers');
    return {
        ...(motd === undefined ? {} : { motd }),
        ...(levelName === undefined ? {} : { levelName }),
        ...(onlinePlayers === undefined ? {} : { onlinePlayers }),
        ...(maxPlayers === undefined ? {} : { maxPlayers })
    };
};

/** One bar a pack showed. */
interface ShownBar {
    readonly player: string;
    state: ScriptBossBarState;
}

/**
 * The boss bars the packs of one runtime show. The packs' scripts stop together, on a reload or a
 * shutdown, so the runtime takes every bar down then, and a player's bars when they leave.
 */
export class ScriptBossBars {
    private readonly members: JsprismarineServerMembers;
    private readonly bars = new Map<number, ShownBar>();
    /** The next bar's id. A bar that never showed has id 0, which no bar is given. */
    private nextId = 1;

    public constructor(members: JsprismarineServerMembers) {
        this.members = members;
    }

    /**
     * Shows a bar to a player.
     * @param present - Whether the player is still in the world. A bar for one who left never shows.
     * @returns The bar's id, or 0 for a bar that did not show.
     */
    public show(player: string, present: boolean, options: Partial<ScriptBossBarState>): number {
        if (!present) return 0;
        const id = this.nextId++;
        const state = { ...DEFAULT_BAR, ...options };
        this.bars.set(id, { player, state });
        this.members.showBossBar(player, id, state);
        return id;
    }

    /** Changes what a bar shows. A bar that is gone is left alone. */
    public update(id: number, options: Partial<ScriptBossBarState>): void {
        const bar = this.bars.get(id);
        if (bar === undefined) return;
        bar.state = { ...bar.state, ...options };
        this.members.updateBossBar(bar.player, id, bar.state);
    }

    /** Takes a bar down. A bar that is gone is left alone. */
    public hide(id: number): void {
        const bar = this.bars.get(id);
        if (bar === undefined) return;
        this.bars.delete(id);
        this.members.hideBossBar(bar.player, id);
    }

    /** Whether a bar is still shown. */
    public isShown(id: number): boolean {
        return this.bars.has(id);
    }

    /** Takes down every bar on a player's screen, as they leave. */
    public playerLeft(player: string): void {
        for (const [id, bar] of this.bars) if (bar.player === player) this.hide(id);
    }

    /** Takes down every bar, as the scripts stop. */
    public hideAll(): void {
        for (const id of [...this.bars.keys()]) this.hide(id);
    }
}

/**
 * The player list names the packs of one runtime set. The packs' scripts stop together, on a
 * reload or a shutdown, so the runtime gives every name back then. A player who leaves takes
 * their entry with them, and a rejoin builds a new one from the login name.
 */
export class ScriptPlayerListNames {
    private readonly members: JsprismarineServerMembers;
    /** The players whose entry shows a name a pack set. */
    private readonly named = new Set<string>();

    public constructor(members: JsprismarineServerMembers) {
        this.members = members;
    }

    /**
     * Shows a name for a player.
     * @param present - Whether the player is still in the world. One who left has no entry to rename.
     */
    public set(player: string, present: boolean, name: string): void {
        if (!present) return;
        this.named.add(player);
        this.members.setPlayerListName(player, name);
    }

    /** Gives a player their login name back. A player whose name no pack set is left alone. */
    public reset(player: string): void {
        if (!this.named.delete(player)) return;
        this.members.resetPlayerListName(player);
    }

    /** Forgets a player's name as they leave, since their entry goes with them. */
    public playerLeft(player: string): void {
        this.named.delete(player);
    }

    /** Gives every player their login name back, as the scripts stop. */
    public resetAll(): void {
        for (const player of [...this.named]) this.reset(player);
    }
}

/**
 * The server list changes the packs of one runtime made, each pack its own owner. The packs'
 * scripts stop together, on a reload or a shutdown, so the runtime takes every change back then.
 */
export class ScriptServerList {
    private readonly members: ScriptServerListMembers;
    /** The packs whose changes the list shows. */
    private readonly owners = new Set<object>();

    public constructor(members: ScriptServerListMembers) {
        this.members = members;
    }

    /** What the list shows now. */
    public current(): ScriptServerListStatus {
        return this.members.current();
    }

    /** Layers a pack's changes over the list. */
    public update(owner: object, fields: Partial<ScriptServerListStatus>): void {
        this.owners.add(owner);
        this.members.update(owner, fields);
    }

    /** Takes a pack's changes back. A pack that changed nothing is left alone. */
    public reset(owner: object): void {
        if (!this.owners.delete(owner)) return;
        this.members.reset(owner);
    }

    /** Takes every pack's changes back, as the scripts stop. */
    public resetAll(): void {
        for (const owner of [...this.owners]) this.reset(owner);
    }
}

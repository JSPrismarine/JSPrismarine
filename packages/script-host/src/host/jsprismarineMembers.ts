/**
 * What the members of `@jsprismarine/server` that reach the running server read and show: the
 * embedder's side of `performance`, `getPing` and `bossBars`, and the boss bars each pack shows.
 */
import { ScriptHostErrors } from '@jsprismarine/errors/script-host';

import type { ScriptEngine } from '../ScriptEngine';
import type { ScriptValue } from '../values';
import { ScriptHandle } from '../values';
import type { JsprismarineBossBarColor } from './jsprismarineServer';
import type { JSPRISMARINE_SERVER } from './jsprismarineServer';
import { JSPRISMARINE_TYPES } from './jsprismarineServer';

type PerformanceProperties = (typeof JSPRISMARINE_SERVER)['performance']['properties'];

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

/** Whose node a permission write is about: an online player by entity id, or a group by name. */
export type ScriptPermissionSubject = { readonly player: string } | { readonly group: string };

/** What a permission change touched: the player by entity id when they are online, and the group. */
export interface ScriptPermissionsChange {
    readonly player?: string;
    readonly group?: string;
}

/**
 * What `permissions` in `@jsprismarine/server` reads and writes of the server's permission files.
 * Players are named by their entity ids. A write persists on the server's own schedule; a bad
 * argument throws before anything is written.
 */
export interface ScriptPermissionMembers {
    has(player: string, node: string): boolean;
    /** The groups the player holds directly, heaviest first. */
    groupsOf(player: string): readonly string[];
    primaryGroupOf(player: string): string;
    metaOf(player: string, key: string): string | undefined;
    /** The weight of the player's primary group. */
    weightOf(player: string): number;
    /** @throws For a malformed node or expiry, a group the file lacks, or a player who left. */
    grant(subject: ScriptPermissionSubject, node: string, expires?: string): void;
    revoke(subject: ScriptPermissionSubject, node: string): void;
    /** @throws For a malformed expiry, a group the file lacks, or a player who left. */
    addToGroup(player: string, group: string, expires?: string): void;
    removeFromGroup(player: string, group: string): void;
    /** Hears of every change, however it was made. @returns A function that stops listening. */
    onChange(listener: (change: ScriptPermissionsChange) => void): () => void;
}

/**
 * What `@jsprismarine/server`'s members that reach the running server read and show. Players are
 * named by their entity ids, as `ScriptWorld.players` lists them. Boss bars are named by an id
 * the runtime gives each bar, which no other bar of the runtime has, a reload included.
 */
export interface JsprismarineServerMembers {
    /** The permission files. Without it the module leaves `permissions` out, as an older server would. */
    readonly permissions?: ScriptPermissionMembers;
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
}

/** The owner of the namespaces the server registers, such as `perms`, which outlive a reload. */
export const SERVER_PLACEHOLDER_OWNER = { name: 'JSPrismarine' };

/**
 * The subject a pack passed to `permissions.grant` or `revoke`: a group by its name, or a player.
 * @param player - Resolves a player value to the entity id, or throws naming the member.
 * @throws {TypeError} When the value is neither.
 */
export const permissionSubjectOf = (
    value: ScriptValue,
    player: (value: ScriptValue) => string,
    member: string
): ScriptPermissionSubject => {
    if (typeof value === 'string') return { group: value };
    if (value instanceof ScriptHandle) return { player: player(value) };
    throw new ScriptHostErrors.JspModuleArgument({ member, expected: 'a Player or a group name', argument: 'subject' });
};

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

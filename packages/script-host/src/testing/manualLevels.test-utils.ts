/**
 * A server double for `levels` of `@jsprismarine/server`, for tests that run an addon's pack over a
 * memory world: it keeps a list of levels the test sets up, records each operation, and settles it
 * at once, the way the server settles one that finishes before the next flush.
 */
import type { ScriptLevelInfo, ScriptLevelMembers } from '../host/jsprismarineMembers';

/** The UUID a level the double creates gets, by the order it was created in. */
const createdId = (index: number): string => `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`;

/** Levels the test lists, of which the first is the one the runtime runs in. */
export class ManualLevels implements ScriptLevelMembers {
    /** Every operation, as `transfer <player> <level> <toSpawn>`, `create <name> <preset> <seed>`, `attach <level>` or `detach <level>`. */
    public readonly calls: string[] = [];
    public levels: ScriptLevelInfo[];

    /** @param levels - The levels, the runtime's first and the entry level the one marked so. */
    public constructor(levels: readonly ScriptLevelInfo[]) {
        this.levels = [...levels];
    }

    private find(name: string): ScriptLevelInfo | undefined {
        const wanted = name.toLowerCase();
        return this.levels.find((level) => level.id === wanted || level.name.toLowerCase() === wanted);
    }

    public current(): ScriptLevelInfo {
        const level = this.levels[0];
        if (level === undefined) throw new RangeError('ManualLevels has no level');
        return level;
    }
    public list(): readonly ScriptLevelInfo[] {
        return [...this.levels.filter((level) => level.attached), ...this.levels.filter((level) => !level.attached)];
    }
    public levelOf(): ScriptLevelInfo {
        return this.current();
    }
    public async transfer(player: string, level: string, toSpawn: boolean): Promise<boolean> {
        this.calls.push(`transfer ${player} ${level} ${toSpawn}`);
        if (this.find(level)?.attached !== true) throw new RangeError(`No attached level is named ${level}`);
        return true;
    }
    public async create(name: string, preset?: string, seed?: string): Promise<ScriptLevelInfo> {
        this.calls.push(`create ${name} ${preset} ${seed}`);
        if (this.find(name) !== undefined) throw new RangeError(`A level is named ${name} already`);
        const level = { id: createdId(this.levels.length), name, attached: true, entry: false, players: [] };
        this.levels.push(level);
        return level;
    }
    public async attach(name: string): Promise<ScriptLevelInfo> {
        this.calls.push(`attach ${name}`);
        const level = this.find(name);
        if (level === undefined || level.attached) throw new RangeError(`No detached level is named ${name}`);
        return this.replace(level, { ...level, attached: true });
    }
    public async detach(name: string): Promise<void> {
        this.calls.push(`detach ${name}`);
        const level = this.find(name);
        if (level === undefined || !level.attached) throw new RangeError(`No attached level is named ${name}`);
        if (level.entry) throw new RangeError(`Level ${level.name} is the level players join first`);
        this.replace(level, { ...level, attached: false, players: [] });
    }

    private replace(level: ScriptLevelInfo, next: ScriptLevelInfo): ScriptLevelInfo {
        this.levels = this.levels.map((each) => (each === level ? next : each));
        return next;
    }
}

/**
 * The `scoreboard` group of the server's `CommandHost`, and the state behind
 * it.
 *
 * Java's scoreboard is server state rather than world state: objectives,
 * scores by holder, and which objective is drawn in each of the three display
 * slots. Nothing else on this server reads it, so it is held here rather than
 * reached for through a manager, and `/scoreboard`, `execute if score` and
 * `execute store result score` are the only three things that touch it.
 *
 * One gap worth stating. Java writes the scoreboard into `scoreboard.dat` and
 * reads it back on the next start; this one lives for as long as the process
 * does. Everything a running server can observe works. The display slots
 * update, a score survives a player relogging, and an operation reads both
 * sides. A restart starts over.
 */
import type { EntityRef, ScoreboardCommandHost } from '@jsprismarine/commands';
import {
    ObjectiveSortOrder,
    RemoveObjectivePacket,
    SetDisplayObjectivePacket,
    SetScorePacket,
    ScorePacketEntryAction
} from '@jsprismarine/protocol';

import type Server from '../../Server';
import { carryOut, refuse } from './support';

/** One objective, as `/scoreboard objectives add` declares it. */
interface Objective {
    readonly name: string;
    /** Java's criterion. Only `dummy` is tracked; nothing on this server increments a score by itself. */
    readonly criterion: string;
    /** What the client draws, which defaults to the objective's own name. */
    readonly displayName: string;
}

/** What one display slot is showing. */
interface Display {
    readonly objective: string;
    readonly sortOrder: 'ascending' | 'descending';
}

/** The nine operators Java's `scoreboard players operation` defines. */
const OPERATIONS: Readonly<Record<string, (target: number, source: number) => number | undefined>> = {
    '=': (_target, source) => source,
    '+=': (target, source) => target + source,
    '-=': (target, source) => target - source,
    '*=': (target, source) => target * source,
    // Java floors the quotient and leaves the target alone on a divide by zero.
    '/=': (target, source) => (source === 0 ? undefined : Math.floor(target / source)),
    '%=': (target, source) => (source === 0 ? undefined : ((target % source) + source) % source),
    '<': (target, source) => Math.min(target, source),
    '>': (target, source) => Math.max(target, source)
};

/** The swap operator, which writes both sides and so cannot be a pure function of two numbers. */
const SWAP = '><';

/**
 * Objectives, scores and display slots.
 *
 * Holders are names rather than entity references: Java scores a name, which
 * is why a "fake player", a name no entity has, is the normal way a
 * datapack keeps a global counter.
 */
export class Scoreboard {
    private readonly objectives = new Map<string, Objective>();

    /** Holder name to objective name to score. */
    private readonly scores = new Map<string, Map<string, number>>();

    private readonly displays = new Map<string, Display>();

    /** The id the wire addresses each holder by, assigned on first sight. */
    private readonly identities = new Map<string, bigint>();

    private nextIdentity = 1n;

    /** Whether an objective of that name exists. */
    public has(objective: string): boolean {
        return this.objectives.has(objective);
    }

    /** Every objective name, in the order the objectives were added. */
    public names(): readonly string[] {
        return [...this.objectives.keys()];
    }

    /** The objective's display name, falling back to its own name, as Java does. */
    public displayNameOf(objective: string): string {
        return this.objectives.get(objective)?.displayName ?? objective;
    }

    /** The objective's criterion, or `dummy` for a name the board does not hold. */
    public criterionOf(objective: string): string {
        return this.objectives.get(objective)?.criterion ?? 'dummy';
    }

    /** @returns False when an objective of that name already exists, as Java refuses. */
    public add(name: string, criterion: string, displayName?: string): boolean {
        if (this.objectives.has(name)) return false;
        this.objectives.set(name, { name, criterion, displayName: displayName ?? name });
        return true;
    }

    /**
     * Drops an objective, its scores and any slot showing it.
     *
     * @returns The slots that were showing it, so the caller can tell the
     *   clients, and undefined when no such objective exists.
     */
    public remove(name: string): readonly string[] | undefined {
        if (!this.objectives.delete(name)) return undefined;

        for (const held of this.scores.values()) held.delete(name);

        const cleared: string[] = [];
        for (const [slot, display] of this.displays) {
            if (display.objective !== name) continue;
            this.displays.delete(slot);
            cleared.push(slot);
        }
        return cleared;
    }

    /** What a display slot is showing, or undefined when the slot is empty. */
    public display(slot: string): Display | undefined {
        return this.displays.get(slot);
    }

    /** @returns Whether a slot changed; clearing a slot nothing was in changes nothing. */
    public setDisplay(slot: string, objective?: string, sortOrder?: 'ascending' | 'descending'): boolean {
        if (objective === undefined) return this.displays.delete(slot);

        this.displays.set(slot, { objective, sortOrder: sortOrder ?? 'ascending' });
        return true;
    }

    /** A holder's score on an objective, or undefined when the holder has none. */
    public score(holder: string, objective: string): number | undefined {
        return this.scores.get(holder)?.get(objective);
    }

    /**
     * Writes a holder's score on an objective.
     *
     * @returns The value as stored, truncated and clamped to a 32-bit int.
     */
    public setScore(holder: string, objective: string, value: number): number {
        // Java clamps a score to a 32-bit int, which is what the packet writes.
        const clamped = Math.max(-2_147_483_648, Math.min(2_147_483_647, Math.trunc(value)));
        const held = this.scores.get(holder) ?? new Map<string, number>();
        held.set(objective, clamped);
        this.scores.set(holder, held);
        return clamped;
    }

    /** @returns Whether anything was reset. */
    public reset(holder: string, objective?: string): boolean {
        const held = this.scores.get(holder);
        if (!held) return false;
        if (objective === undefined) return this.scores.delete(holder);

        const removed = held.delete(objective);
        if (held.size === 0) this.scores.delete(holder);
        return removed;
    }

    /** Every objective the holder has a score on, keyed by objective name. */
    public scoresOf(holder: string): Readonly<Record<string, number>> {
        return Object.fromEntries(this.scores.get(holder) ?? []);
    }

    /**
     * Every holder the board tracks, which is what `*` names.
     *
     * @param objective - Narrows it to the holders with a score in that one.
     */
    public holders(objective?: string): readonly string[] {
        const found: string[] = [];
        for (const [holder, held] of this.scores) {
            if (objective === undefined || held.has(objective)) found.push(holder);
        }
        return found;
    }

    /** Every holder with a score in one objective, for the slot the client draws. */
    public holdersOf(objective: string): readonly { holder: string; value: number }[] {
        const found: { holder: string; value: number }[] = [];
        for (const [holder, held] of this.scores) {
            const value = held.get(objective);
            if (value !== undefined) found.push({ holder, value });
        }
        return found;
    }

    /** The id the wire addresses a holder by, assigned on first sight and stable after. */
    public identityOf(holder: string): bigint {
        const existing = this.identities.get(holder);
        if (existing !== undefined) return existing;

        const assigned = this.nextIdentity;
        this.nextIdentity += 1n;
        this.identities.set(holder, assigned);
        return assigned;
    }
}

/**
 * Builds the `scoreboard` group over one scoreboard.
 *
 * @param server - The live server, for the clients a change is sent to.
 * @param board - The state. Passed in so a test can inspect it and so a
 *   reload could replace it without rebuilding the host.
 */
export const scoreboardCommandHost = (server: Server, board: Scoreboard): ScoreboardCommandHost => {
    /**
     * Tells every client about one holder's score in one objective.
     *
     * Skipped for an objective no slot is drawing: the client refuses a
     * `SetScorePacket` entry naming an objective it was never given a
     * `SetDisplayObjectivePacket` for.
     */
    const sendScore = (holder: string, objective: string, value: number | undefined): void => {
        if (!isDisplayed(board, objective)) return;

        const packet = new SetScorePacket();
        packet.entries = [
            value === undefined
                ? {
                      action: ScorePacketEntryAction.Remove,
                      scoreboardId: board.identityOf(holder),
                      objectiveName: objective
                  }
                : {
                      action: ScorePacketEntryAction.ChangeFakePlayer,
                      scoreboardId: board.identityOf(holder),
                      objectiveName: objective,
                      scoreValue: value,
                      fakePlayerName: holder
                  }
        ];
        carryOut(server.broadcastPacket(packet), undefined);
    };

    /** Draws a slot from scratch: the objective's header, then every score in it. */
    const sendDisplay = (slot: string): void => {
        const display = board.display(slot);
        if (display === undefined) {
            const packet = new SetDisplayObjectivePacket();
            packet.displaySlotName = slot;
            carryOut(server.broadcastPacket(packet), undefined);
            return;
        }

        const header = new SetDisplayObjectivePacket();
        header.displaySlotName = slot;
        header.objectiveName = display.objective;
        header.objectiveDisplayName = board.displayNameOf(display.objective);
        header.criteriaName = board.criterionOf(display.objective);
        header.sortOrder =
            display.sortOrder === 'descending' ? ObjectiveSortOrder.Descending : ObjectiveSortOrder.Ascending;
        carryOut(server.broadcastPacket(header), undefined);

        const lines = board.holdersOf(display.objective);
        if (lines.length === 0) return;

        const scores = new SetScorePacket();
        scores.entries = lines.map((line) => ({
            action: ScorePacketEntryAction.ChangeFakePlayer as const,
            scoreboardId: board.identityOf(line.holder),
            objectiveName: display.objective,
            scoreValue: line.value,
            fakePlayerName: line.holder
        }));
        carryOut(server.broadcastPacket(scores), undefined);
    };

    /** The objective an existing score names, refusing when nobody declared it. */
    const require = (objective: string): string => {
        if (!board.has(objective)) refuse(`There is no scoreboard objective called ${objective}`);
        return objective;
    };

    const write = (holder: string, objective: string, value: number): number => {
        const written = board.setScore(holder, require(objective), value);
        sendScore(holder, objective, written);
        return written;
    };

    return {
        addObjective: (name, criterion, displayName) => board.add(name, criterion, displayName),

        removeObjective: (name) => {
            const cleared = board.remove(name);
            if (cleared === undefined) return false;

            const packet = new RemoveObjectivePacket();
            packet.objectiveName = name;
            carryOut(server.broadcastPacket(packet), undefined);
            for (const slot of cleared) sendDisplay(slot);
            return true;
        },

        listObjectives: () => board.names(),

        holders: (objective) => board.holders(objective),

        setDisplay: (slot, objective, sortOrder) => {
            if (objective !== undefined) require(objective);

            const changed = board.setDisplay(slot, objective, sortOrder);
            if (changed) sendDisplay(slot);
            return changed;
        },

        getScore: (holder, objective) => board.score(holder, require(objective)),
        setScore: (holder, objective, value) => write(holder, objective, value),
        addScore: (holder, objective, value) => write(holder, objective, (board.score(holder, objective) ?? 0) + value),

        resetScore: (holder, objective) => {
            const reset = board.reset(holder, objective);
            if (reset) sendScore(holder, objective ?? '', undefined);
            return reset;
        },

        listScores: (holder) => board.scoresOf(holder),

        operation: (target, targetObjective, operation, source, sourceObjective) => {
            require(targetObjective);
            require(sourceObjective);

            const left = board.score(target, targetObjective) ?? 0;
            const right = board.score(source, sourceObjective) ?? 0;

            if (operation === SWAP) {
                write(source, sourceObjective, left);
                return write(target, targetObjective, right);
            }

            const apply = OPERATIONS[operation];
            if (apply === undefined) refuse(`${operation} is not a scoreboard operation`);

            const result = apply(left, right);
            return result === undefined ? undefined : write(target, targetObjective, result);
        },

        // `scoreboard players enable` marks an objective as one the holder
        // may `/trigger`, and this command set has no `/trigger`: Java renamed
        // nothing here, the command simply is not among the 59. Recording the
        // grant would be a flag nothing ever reads.
        enableTrigger: () => refuse('This server has no /trigger, so enabling an objective grants nothing')
    };
};

/** The three slots Bedrock draws, under the names its `DisplaySlot` enum spells. */
const DISPLAY_SLOTS = ['list', 'sidebar', 'belowname'] as const;

/** Whether any slot is currently drawing an objective. */
const isDisplayed = (board: Scoreboard, objective: string): boolean =>
    DISPLAY_SLOTS.some((slot) => board.display(slot)?.objective === objective);

/** The `scores=` fact a selector reads, which is one holder's score in one objective. */
export const scoreFactOf =
    (board: Scoreboard) =>
    (ref: EntityRef, objective: string): number | undefined =>
        board.score(ref.name, objective);

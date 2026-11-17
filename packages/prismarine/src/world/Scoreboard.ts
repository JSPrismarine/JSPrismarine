/**
 * A level's scoreboard: objectives, the participants that hold scores, their scores and the
 * objective each display slot shows. `/scoreboard`, a selector's `scores=` and the scripts'
 * `world.scoreboard` all read and write this one store, so a score one writes the other reads.
 *
 * It holds plain data and nothing else, and the level's save pass writes it under the LevelDB
 * record `scoreboard` in the form Bedrock Dedicated Server (BDS) writes. A participant is one of
 * BDS's three identity types: a fake player, a name with no entity, which every command holder
 * is; an entity; or a player. Each gets an id from one counter, BDS's `LastUniqueID`, the first
 * time it scores.
 */

import { PrismarineWorldErrors } from '@jsprismarine/errors/prismarine/world';

/** How a participant is known, as BDS's `IdentityType` and the Script API's `ScoreboardIdentityType` name it. */
export type ParticipantType = 'Entity' | 'FakePlayer' | 'Player';

/** One participant. */
export interface Participant {
    /** The id the scoreboard gave it, BDS's `ScoreboardId`. */
    readonly id: number;
    readonly type: ParticipantType;
    /** A fake player's name, a player's name or an entity's id: what a script reads as `displayName`. */
    readonly name: string;
    /** An entity's or a player's saved id, BDS's `EntityID` or `PlayerId`, once it is known. */
    readonly saved?: bigint;
    /** The runtime id of the entity or player while it is in the world, which scripts know it by. */
    readonly live?: string;
}

/** Who a call names: a fake player by name, an entity by runtime id, or a participant by its id. */
export type ParticipantRef = { readonly name: string } | { readonly entity: string } | { readonly participant: number };

/** What the scoreboard knows of a live entity it is asked to score. */
export interface ScoredEntity {
    readonly type: 'Entity' | 'Player';
    /** A player's name, or the entity's runtime id. */
    readonly name: string;
    /** Its saved id, when it has one. */
    readonly saved?: bigint;
}

/** One objective. */
export interface Objective {
    readonly name: string;
    /** Only `dummy` is tracked; nothing on this server raises a score by itself. */
    readonly criterion: string;
    /** What the client draws, which defaults to the objective's own name. */
    readonly displayName: string;
}

/** The three slots Bedrock draws, under the names its `DisplaySlot` enum spells. */
export const DISPLAY_SLOTS = ['list', 'sidebar', 'belowname'] as const;

/** One of {@link DISPLAY_SLOTS}. */
export type DisplaySlot = (typeof DISPLAY_SLOTS)[number];

/** What one display slot is showing. */
export interface Display {
    readonly objective: string;
    readonly sortOrder: 'ascending' | 'descending';
}

/** A scoreboard as a save holds it, in plain data. */
export interface SavedScoreboard {
    readonly objectives: readonly (Objective & {
        readonly scores: readonly { readonly participant: number; readonly score: number }[];
    })[];
    readonly participants: readonly Participant[];
    readonly displays: readonly (Display & { readonly slot: string })[];
    /** The last id given to a participant. */
    readonly lastId: number;
}

const INT32_MIN = -2147483648;
const INT32_MAX = 2147483647;

/** A score as BDS and Java store it: a whole number, clamped to a 32-bit int. */
const clampScore = (value: number): number => Math.max(INT32_MIN, Math.min(INT32_MAX, Math.trunc(value)));

/** One level's scoreboard. */
export class Scoreboard {
    private readonly objectiveList = new Map<string, Objective>();
    /** Objective name to participant id to score. */
    private readonly scoreTable = new Map<string, Map<number, number>>();
    private readonly made = new Map<number, Participant>();
    private readonly displays = new Map<string, Display>();
    private lastId = 0;

    /** Whether an objective of that name exists. */
    public has(objective: string): boolean {
        return this.objectiveList.has(objective);
    }

    /** One objective, or undefined. */
    public objective(name: string): Objective | undefined {
        return this.objectiveList.get(name);
    }

    /** Every objective, in the order they were added. */
    public objectives(): readonly Objective[] {
        return [...this.objectiveList.values()];
    }

    /** Every objective name, in the order the objectives were added. */
    public names(): readonly string[] {
        return [...this.objectiveList.keys()];
    }

    /** The objective's display name, falling back to its own name. */
    public displayNameOf(objective: string): string {
        return this.objectiveList.get(objective)?.displayName ?? objective;
    }

    /** The objective's criterion, or `dummy` for a name the board does not hold. */
    public criterionOf(objective: string): string {
        return this.objectiveList.get(objective)?.criterion ?? 'dummy';
    }

    /** @returns False when an objective of that name already exists, which both games refuse. */
    public add(name: string, criterion: string, displayName?: string): boolean {
        if (this.objectiveList.has(name)) return false;
        this.objectiveList.set(name, { name, criterion, displayName: displayName ?? name });
        this.scoreTable.set(name, new Map());
        return true;
    }

    /**
     * Drops an objective, its scores and any slot showing it.
     * @returns The slots that were showing it, and undefined when no such objective exists.
     */
    public remove(name: string): readonly string[] | undefined {
        if (!this.objectiveList.delete(name)) return undefined;
        this.scoreTable.delete(name);
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

    /** Every participant with a score in some objective, in the order they got their ids. */
    public participants(): readonly Participant[] {
        return [...this.made.values()].filter((participant) => this.scored(participant.id));
    }

    /**
     * Finds the participant a reference names among those with a score, without making one.
     * @param saved - An entity's saved id, which a participant read from a save is known by
     *   until the entity is scored again.
     */
    public participant(ref: ParticipantRef, saved?: bigint): Participant | undefined {
        for (const participant of this.made.values()) {
            if (this.scored(participant.id) && this.matches(participant, ref, saved)) return participant;
        }
        return undefined;
    }

    /** Every score of an objective, by participant, in the order the participants got their ids. */
    public scoresOf(objective: string): readonly { readonly participant: Participant; readonly score: number }[] {
        const scores = this.scoreTable.get(objective);
        if (scores === undefined) return [];
        return [...this.made.values()].flatMap((participant) => {
            const score = scores.get(participant.id);
            return score === undefined ? [] : [{ participant, score }];
        });
    }

    /** A participant's score in an objective, or undefined when it has none. */
    public scoreOf(objective: string, participant: number): number | undefined {
        return this.scoreTable.get(objective)?.get(participant);
    }

    /**
     * Writes a participant's score, making the participant the first time.
     * @param entity - What the entity a `{ entity }` reference names is.
     * @returns The participant, and the score as stored.
     */
    public write(
        objective: string,
        ref: ParticipantRef,
        value: number,
        entity?: ScoredEntity
    ): { readonly participant: Participant; readonly score: number } {
        const participant = this.participantFor(ref, entity);
        const score = clampScore(value);
        this.scoreTable.get(objective)?.set(participant.id, score);
        return { participant, score };
    }

    /** @returns False when the participant had no score in the objective. */
    public erase(objective: string, participant: number): boolean {
        return this.scoreTable.get(objective)?.delete(participant) ?? false;
    }

    /** A fake player's score, or undefined when it has none. */
    public score(holder: string, objective: string): number | undefined {
        const participant = this.participant({ name: holder });
        return participant === undefined ? undefined : this.scoreOf(objective, participant.id);
    }

    /**
     * Writes a fake player's score, as a command does.
     * @returns The value as stored, truncated and clamped to a 32-bit int.
     */
    public setScore(holder: string, objective: string, value: number): number {
        return this.write(objective, { name: holder }, value).score;
    }

    /** Resets a fake player's score in one objective, or in all of them. @returns Whether anything was reset. */
    public reset(holder: string, objective?: string): boolean {
        const participant = this.participant({ name: holder });
        if (participant === undefined) return false;
        if (objective !== undefined) return this.erase(objective, participant.id);
        let reset = false;
        for (const scores of this.scoreTable.values()) reset = scores.delete(participant.id) || reset;
        return reset;
    }

    /** Every objective a fake player has a score in, keyed by objective name. */
    public scoresOfHolder(holder: string): Readonly<Record<string, number>> {
        const participant = this.participant({ name: holder });
        const found: Record<string, number> = {};
        if (participant === undefined) return found;
        for (const [objective, scores] of this.scoreTable) {
            const score = scores.get(participant.id);
            if (score !== undefined) found[objective] = score;
        }
        return found;
    }

    /**
     * The name of every participant with a score, which is what a command's `*` names.
     * @param objective - Narrows it to the participants with a score in that one.
     */
    public holders(objective?: string): readonly string[] {
        if (objective !== undefined) return this.scoresOf(objective).map(({ participant }) => participant.name);
        return this.participants().map((participant) => participant.name);
    }

    /** Every participant's name and score in one objective, for the slot the client draws. */
    public holdersOf(objective: string): readonly { holder: string; value: number; participant: number }[] {
        return this.scoresOf(objective).map(({ participant, score }) => ({
            holder: participant.name,
            value: score,
            participant: participant.id
        }));
    }

    /** The id the wire addresses a fake player by, which is its participant id once it has scored. */
    public identityOf(holder: string): bigint {
        const participant = [...this.made.values()].find((each) => this.matches(each, { name: holder }));
        return BigInt(participant?.id ?? this.lastId + 1);
    }

    /**
     * The scoreboard as a save holds it. Entity and player participants are written with their
     * saved id, from `savedId` while they are in the world; one with neither is left out, since
     * nothing could find it after a restart.
     * @param savedId - The saved id of a live entity or player, by runtime id.
     */
    public saved(savedId: (live: string) => bigint | undefined = () => undefined): SavedScoreboard {
        const participants: Participant[] = [];
        for (const participant of this.participants()) {
            if (participant.type === 'FakePlayer') {
                participants.push(participant);
                continue;
            }
            const id = (participant.live === undefined ? undefined : savedId(participant.live)) ?? participant.saved;
            if (id === undefined) continue;
            participants.push({ id: participant.id, type: participant.type, name: participant.name, saved: id });
        }
        const kept = new Set(participants.map(({ id }) => id));
        return {
            objectives: this.objectives().map((objective) => ({
                ...objective,
                scores: this.scoresOf(objective.name)
                    .filter(({ participant }) => kept.has(participant.id))
                    .map(({ participant, score }) => ({ participant: participant.id, score }))
            })),
            participants,
            displays: [...this.displays].map(([slot, display]) => ({ slot, ...display })),
            lastId: this.lastId
        };
    }

    /** Replaces everything with what a save held. */
    public restore(saved: SavedScoreboard): void {
        this.objectiveList.clear();
        this.scoreTable.clear();
        this.made.clear();
        this.displays.clear();
        for (const participant of saved.participants) this.made.set(participant.id, participant);
        for (const { scores, ...objective } of saved.objectives) {
            this.objectiveList.set(objective.name, objective);
            this.scoreTable.set(
                objective.name,
                new Map(
                    scores
                        .filter(({ participant }) => this.made.has(participant))
                        .map((each) => [each.participant, each.score])
                )
            );
        }
        for (const { slot, objective, sortOrder } of saved.displays) {
            if (this.objectiveList.has(objective)) this.displays.set(slot, { objective, sortOrder });
        }
        this.lastId = Math.max(saved.lastId, ...saved.participants.map(({ id }) => id));
    }

    private scored(participant: number): boolean {
        for (const scores of this.scoreTable.values()) if (scores.has(participant)) return true;
        return false;
    }

    private matches(participant: Participant, ref: ParticipantRef, saved?: bigint): boolean {
        if ('participant' in ref) return participant.id === ref.participant;
        if ('name' in ref) return participant.type === 'FakePlayer' && participant.name === ref.name;
        if (participant.type === 'FakePlayer') return false;
        return (
            participant.live === ref.entity ||
            (participant.live === undefined && saved !== undefined && participant.saved === saved)
        );
    }

    /** The participant a reference names, made when there is none, with any it has made before reused. */
    private participantFor(ref: ParticipantRef, entity?: ScoredEntity): Participant {
        const known = [...this.made.values()].find((each) => this.matches(each, ref, entity?.saved));
        if (known !== undefined) {
            if ('entity' in ref && known.live !== ref.entity) {
                // A participant read from a save, now scored through its entity again.
                const linked: Participant = { ...known, live: ref.entity };
                this.made.set(known.id, linked);
                return linked;
            }
            return known;
        }
        if ('participant' in ref)
            throw new PrismarineWorldErrors.UnknownScoreboardParticipant({ participant: ref.participant });
        this.lastId += 1;
        const made: Participant =
            'name' in ref
                ? { id: this.lastId, type: 'FakePlayer', name: ref.name }
                : {
                      id: this.lastId,
                      type: entity?.type ?? 'Entity',
                      name: entity?.name ?? ref.entity,
                      live: ref.entity,
                      ...(entity?.saved === undefined ? {} : { saved: entity.saved })
                  };
        this.made.set(made.id, made);
        return made;
    }
}

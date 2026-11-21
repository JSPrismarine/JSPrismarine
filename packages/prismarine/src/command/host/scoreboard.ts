/**
 * The `scoreboard` group of the server's `CommandHost`.
 *
 * The state is the default level's {@link Scoreboard}, which the scripts'
 * `world.scoreboard` shares and the level's save writes, as Bedrock keeps one
 * scoreboard per world. A command holder is a name, which the scoreboard
 * keeps as a fake player: a selector names an entity by its name, as Java
 * does, so a score a command gives `@s` is the score of a fake player with
 * the player's name, not of the player's own identity that a script scores.
 */
import type { EntityRef, ScoreboardCommandHost } from '@jsprismarine/commands';
import {
    ObjectiveSortOrder,
    RemoveObjectivePacket,
    SetDisplayObjectivePacket,
    SetScorePacket,
    ScorePacketEntryAction
} from '@jsprismarine/protocol';

import type { NetworkPacket } from '@jsprismarine/protocol';
import type Server from '../../Server';
import type { Level } from '../../world/Level';
import type { Scoreboard } from '../../world/Scoreboard';
import { DISPLAY_SLOTS } from '../../world/Scoreboard';
import { carryOut, refuse } from './support';

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
 * The packets that draw one display slot from scratch: the objective's header, then every score
 * in it, or the slot emptied when nothing is shown there.
 */
export const displayPackets = (scoreboard: Scoreboard, slot: string): NetworkPacket<unknown>[] => {
    const display = scoreboard.display(slot);
    if (display === undefined) {
        const packet = new SetDisplayObjectivePacket();
        packet.displaySlotName = slot;
        return [packet];
    }

    const header = new SetDisplayObjectivePacket();
    header.displaySlotName = slot;
    header.objectiveName = display.objective;
    header.objectiveDisplayName = scoreboard.displayNameOf(display.objective);
    header.criteriaName = scoreboard.criterionOf(display.objective);
    header.sortOrder =
        display.sortOrder === 'descending' ? ObjectiveSortOrder.Descending : ObjectiveSortOrder.Ascending;

    const lines = scoreboard.holdersOf(display.objective);
    if (lines.length === 0) return [header];

    const scores = new SetScorePacket();
    scores.entries = lines.map((line) => ({
        action: ScorePacketEntryAction.ChangeFakePlayer as const,
        scoreboardId: scoreboard.identityOf(line.holder),
        objectiveName: display.objective,
        scoreValue: line.value,
        fakePlayerName: line.holder
    }));
    return [header, scores];
};

/** The packets that draw every display slot of a scoreboard, as a player arriving in its level sees them. */
export const scoreboardPackets = (scoreboard: Scoreboard): NetworkPacket<unknown>[] =>
    DISPLAY_SLOTS.flatMap((slot) => displayPackets(scoreboard, slot));

/**
 * Builds the `scoreboard` group over one scoreboard.
 *
 * @param server - The live server, for the clients a change is sent to.
 * @param scoreboard - The state, read on each command, which exists only once the worlds have
 *   loaded.
 * @param level - The level the scoreboard belongs to, whose players alone see its changes. Left
 *   out, every player does.
 */
export const scoreboardCommandHost = (
    server: Server,
    scoreboard: () => Scoreboard,
    level?: () => Level
): ScoreboardCommandHost => {
    /** Sends a packet to the players of the scoreboard's level. */
    const send = (packet: NetworkPacket<unknown>): void => {
        if (level === undefined) {
            carryOut(server.broadcastPacket(packet), undefined);
            return;
        }
        const here = level();
        for (const session of server.getSessionManager().getSessions()) {
            if (session.getWorld().getLevel() === here) session.released(session.send(packet));
        }
    };

    /**
     * Tells every client about one holder's score in one objective.
     *
     * Skipped for an objective no slot is drawing: the client refuses a
     * `SetScorePacket` entry naming an objective it was never given a
     * `SetDisplayObjectivePacket` for.
     */
    const sendScore = (holder: string, objective: string, value: number | undefined): void => {
        if (!isDisplayed(scoreboard(), objective)) return;

        const packet = new SetScorePacket();
        packet.entries = [
            value === undefined
                ? {
                      action: ScorePacketEntryAction.Remove,
                      scoreboardId: scoreboard().identityOf(holder),
                      objectiveName: objective
                  }
                : {
                      action: ScorePacketEntryAction.ChangeFakePlayer,
                      scoreboardId: scoreboard().identityOf(holder),
                      objectiveName: objective,
                      scoreValue: value,
                      fakePlayerName: holder
                  }
        ];
        send(packet);
    };

    /** Draws a slot from scratch: the objective's header, then every score in it. */
    const sendDisplay = (slot: string): void => {
        for (const packet of displayPackets(scoreboard(), slot)) send(packet);
    };

    /** The objective an existing score names, refusing when nobody declared it. */
    const require = (objective: string): string => {
        if (!scoreboard().has(objective)) refuse(`There is no scoreboard objective called ${objective}`);
        return objective;
    };

    const write = (holder: string, objective: string, value: number): number => {
        const written = scoreboard().setScore(holder, require(objective), value);
        sendScore(holder, objective, written);
        return written;
    };

    return {
        addObjective: (name, criterion, displayName) => scoreboard().add(name, criterion, displayName),

        removeObjective: (name) => {
            const cleared = scoreboard().remove(name);
            if (cleared === undefined) return false;

            const packet = new RemoveObjectivePacket();
            packet.objectiveName = name;
            send(packet);
            for (const slot of cleared) sendDisplay(slot);
            return true;
        },

        listObjectives: () => scoreboard().names(),

        holders: (objective) => scoreboard().holders(objective),

        setDisplay: (slot, objective, sortOrder) => {
            if (objective !== undefined) require(objective);

            const changed = scoreboard().setDisplay(slot, objective, sortOrder);
            if (changed) sendDisplay(slot);
            return changed;
        },

        getScore: (holder, objective) => scoreboard().score(holder, require(objective)),
        setScore: (holder, objective, value) => write(holder, objective, value),
        addScore: (holder, objective, value) =>
            write(holder, objective, (scoreboard().score(holder, objective) ?? 0) + value),

        resetScore: (holder, objective) => {
            const reset = scoreboard().reset(holder, objective);
            if (reset) sendScore(holder, objective ?? '', undefined);
            return reset;
        },

        listScores: (holder) => scoreboard().scoresOfHolder(holder),

        operation: (target, targetObjective, operation, source, sourceObjective) => {
            require(targetObjective);
            require(sourceObjective);

            const left = scoreboard().score(target, targetObjective) ?? 0;
            const right = scoreboard().score(source, sourceObjective) ?? 0;

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

/** Whether any slot is currently drawing an objective. */
const isDisplayed = (board: Scoreboard, objective: string): boolean =>
    DISPLAY_SLOTS.some((slot) => board.display(slot)?.objective === objective);

/** The `scores=` fact a selector reads, which is one holder's score in one objective. */
export const scoreFactOf =
    (scoreboard: () => Scoreboard) =>
    (ref: EntityRef, objective: string): number | undefined =>
        scoreboard().score(ref.name, objective);

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

import type PlayerSession from '../../player/PlayerSession';
import type { ShownObjective } from '../../player/presenter/SessionPresenter';
import type Server from '../../Server';
import type { Level } from '../../world/Level';
import type { Scoreboard } from '../../world/Scoreboard';
import { DISPLAY_SLOTS } from '../../world/Scoreboard';
import { plainText } from '../../item/lootStack';
import { jsonOfSnbt } from './snbtJson';
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
 * What one display slot shows: its objective with every score in it, or undefined when nothing is
 * shown there.
 * @param scoreboard - The scoreboard.
 * @param slot - The slot.
 */
export const shownObjectiveOf = (scoreboard: Scoreboard, slot: string): ShownObjective | undefined => {
    const display = scoreboard.display(slot);
    if (display === undefined) return undefined;
    return {
        name: display.objective,
        displayName: scoreboard.displayNameOf(display.objective),
        criterion: scoreboard.criterionOf(display.objective),
        sortOrder: display.sortOrder,
        scores: scoreboard.holdersOf(display.objective).map(({ holder, value }) => ({
            holder,
            identity: scoreboard.identityOf(holder),
            value
        }))
    };
};

/**
 * Draws every display slot of a scoreboard for one client, as a player arriving in its level sees
 * them.
 * @param session - The player's session.
 * @param scoreboard - The level's scoreboard.
 * @param clearEmpty - Whether a slot that shows nothing is cleared, for a client that may still
 *   show another level's objective there. A joining client shows nothing yet, so its join leaves
 *   the empty slots out, as BDS's does.
 * @returns Once every slot was sent.
 */
export const showScoreboard = (session: PlayerSession, scoreboard: Scoreboard, clearEmpty = true): Promise<void> =>
    Promise.all(
        DISPLAY_SLOTS.flatMap((slot) => {
            const shown = shownObjectiveOf(scoreboard, slot);
            return shown === undefined && !clearEmpty ? [] : [session.presenter.showDisplaySlot(slot, shown)];
        })
    ).then(() => {});

/** Whether any slot is currently drawing an objective. */
const isDisplayed = (board: Scoreboard, objective: string): boolean =>
    DISPLAY_SLOTS.some((slot) => board.display(slot)?.objective === objective);

/**
 * Tells the players of a level about one holder's score in one objective.
 *
 * Skipped for an objective no slot is drawing: a Bedrock client refuses a score naming an
 * objective it was never shown in a slot.
 *
 * @param server - The live server, for its players.
 * @param level - The level the scoreboard belongs to, whose players alone see it. Left out, every
 *   player does.
 * @param board - The scoreboard.
 * @param holder - Whose score changed.
 * @param objective - The objective.
 * @param value - The new score, or undefined for a reset.
 * @returns Each player's send, for the caller to wait on or release.
 */
export const showScoreChange = (
    server: Server,
    level: Level | undefined,
    board: Scoreboard,
    holder: string,
    objective: string,
    value: number | undefined
): Promise<void>[] => {
    if (!isDisplayed(board, objective)) return [];
    const shown = { holder, identity: board.identityOf(holder) };
    return server
        .getSessionManager()
        .getSessions()
        .filter((session) => level === undefined || session.getWorld().getLevel() === level)
        .map((session) => session.presenter.showScore(objective, shown, value));
};

/**
 * The text an objective's display name shows. Java's command takes a text component, which is
 * SNBT such as `"Play time"` or `{text:"Play time"}`; Bedrock's takes plain text, which is kept
 * as typed when it does not read as a component.
 *
 * @param typed - The display name as the command was given it.
 */
export const displayNameText = (typed: string): string => {
    let component: unknown;
    try {
        component = jsonOfSnbt(typed);
    } catch {
        return typed;
    }
    return plainText(component) ?? typed;
};

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
    /** Shows a change to the players of the scoreboard's level, or to every player without one. */
    const show = (change: (session: PlayerSession) => Promise<void>): void => {
        const here = level?.();
        for (const session of server.getSessionManager().getSessions()) {
            if (here === undefined || session.getWorld().getLevel() === here) carryOut(change(session), undefined);
        }
    };

    /** Tells the level's clients about one holder's score in one objective. */
    const sendScore = (holder: string, objective: string, value: number | undefined): void => {
        for (const sent of showScoreChange(server, level?.(), scoreboard(), holder, objective, value))
            carryOut(sent, undefined);
    };

    /** Draws a slot from scratch: the objective's header, then every score in it. */
    const sendDisplay = (slot: string): void => {
        const shown = shownObjectiveOf(scoreboard(), slot);
        show((session) => session.presenter.showDisplaySlot(slot, shown));
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
        addObjective: (name, criterion, displayName) =>
            scoreboard().add(name, criterion, displayName === undefined ? undefined : displayNameText(displayName)),

        criterionOf: (objective) => scoreboard().objective(objective)?.criterion,

        setDisplayName: (objective, displayName) => {
            const board = scoreboard();
            if (!board.setDisplayName(require(objective), displayNameText(displayName))) return false;
            for (const slot of DISPLAY_SLOTS) if (board.display(slot)?.objective === objective) sendDisplay(slot);
            return true;
        },

        removeObjective: (name) => {
            const cleared = scoreboard().remove(name);
            if (cleared === undefined) return false;

            show((session) => session.presenter.removeObjective(name));
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

/** The `scores=` fact a selector reads, which is one holder's score in one objective. */
export const scoreFactOf =
    (scoreboard: () => Scoreboard) =>
    (ref: EntityRef, objective: string): number | undefined =>
        scoreboard().score(ref.name, objective);

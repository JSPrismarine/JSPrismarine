/**
 * The scoreboard in Bedrock packets: a display slot drawn from scratch, one score's change and an
 * objective's removal.
 */
import {
    ObjectiveSortOrder,
    RemoveObjectivePacket,
    SetDisplayObjectivePacket,
    SetScorePacket,
    ScorePacketEntryAction
} from '@jsprismarine/protocol';

import type { ShownObjective, ShownScore } from '../../../player/presenter/SessionPresenter';

/**
 * The packets that draw one display slot from scratch: the objective's header, then every score
 * in it, or the slot emptied when nothing is shown there.
 * @param slot - The slot.
 * @param objective - What it shows, or undefined for nothing.
 * @returns The packets, in the order the client applies them.
 */
export const displaySlotPacketsOf = (
    slot: string,
    objective: ShownObjective | undefined
): (SetDisplayObjectivePacket | SetScorePacket)[] => {
    const header = new SetDisplayObjectivePacket();
    header.displaySlotName = slot;
    if (objective === undefined) return [header];

    header.objectiveName = objective.name;
    header.objectiveDisplayName = objective.displayName;
    header.criteriaName = objective.criterion;
    header.sortOrder =
        objective.sortOrder === 'descending' ? ObjectiveSortOrder.Descending : ObjectiveSortOrder.Ascending;
    if (objective.scores.length === 0) return [header];

    const scores = new SetScorePacket();
    scores.entries = objective.scores.map((score) => ({
        action: ScorePacketEntryAction.ChangeFakePlayer as const,
        scoreboardId: score.identity,
        objectiveName: objective.name,
        scoreValue: score.value,
        fakePlayerName: score.holder
    }));
    return [header, scores];
};

/**
 * One score's change as `SetScore`: a fake player's new score, or its removal.
 * @param objective - The objective.
 * @param holder - Whose score changed.
 * @param value - The new score, or undefined for a reset.
 * @returns The packet.
 */
export const scorePacketOf = (
    objective: string,
    { holder, identity }: Omit<ShownScore, 'value'>,
    value: number | undefined
): SetScorePacket => {
    const packet = new SetScorePacket();
    packet.entries = [
        value === undefined
            ? { action: ScorePacketEntryAction.Remove, scoreboardId: identity, objectiveName: objective }
            : {
                  action: ScorePacketEntryAction.ChangeFakePlayer,
                  scoreboardId: identity,
                  objectiveName: objective,
                  scoreValue: value,
                  fakePlayerName: holder
              }
    ];
    return packet;
};

/**
 * An objective's removal as `RemoveObjective`.
 * @param objective - The objective.
 * @returns The packet.
 */
export const removeObjectivePacketOf = (objective: string): RemoveObjectivePacket => {
    const packet = new RemoveObjectivePacket();
    packet.objectiveName = objective;
    return packet;
};

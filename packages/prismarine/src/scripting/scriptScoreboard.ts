/**
 * A level's {@link Scoreboard} as the script host's world seam reads it: the scripts'
 * `world.scoreboard` and `/scoreboard` share the one store, so either sees what the other wrote.
 */
import type { ScriptDisplaySlot, ScriptParticipant, ScriptScoreboard } from '@jsprismarine/script-host/host/world';

import type { DisplaySlot, Participant, Scoreboard, ScoredEntity } from '../world/Scoreboard';

/** The slot names the store keeps, which are Bedrock's `DisplaySlot` names, by the Script API's names. */
const SLOTS: Readonly<Record<ScriptDisplaySlot, DisplaySlot>> = {
    BelowName: 'belowname',
    List: 'list',
    Sidebar: 'sidebar'
};

/**
 * Builds the seam's scoreboard over a level's.
 * @param scoreboard - The level's scoreboard.
 * @param entity - What a live entity is, by the id scripts know it by, or undefined once it is gone.
 * @param liveEntity - The id scripts know an entity in the world by, from its saved id, for a
 *   participant read from a save that no script has scored since.
 */
export const scriptScoreboard = (
    scoreboard: Scoreboard,
    entity: (id: string) => ScoredEntity | undefined,
    liveEntity: (saved: bigint) => string | undefined
): ScriptScoreboard => {
    const scriptParticipant = ({ id, type, name, live, saved }: Participant): ScriptParticipant => {
        const found = live ?? (saved === undefined ? undefined : liveEntity(saved));
        return {
            id,
            type,
            // An entity's display name is its id, which is its runtime id once it is in the world.
            displayName: type === 'Entity' && found !== undefined ? found : name,
            ...(found === undefined ? {} : { entity: found })
        };
    };
    return {
        objectives: () => scoreboard.objectives().map(({ name, displayName }) => ({ id: name, displayName })),
        objective: (id) => {
            const found = scoreboard.objective(id);
            return found === undefined ? undefined : { id: found.name, displayName: found.displayName };
        },
        addObjective: (id, displayName) => scoreboard.add(id, 'dummy', displayName),
        removeObjective: (id) => scoreboard.remove(id) !== undefined,
        participants: () => scoreboard.participants().map(scriptParticipant),
        participant: (ref) => {
            const found = scoreboard.participant(ref, 'entity' in ref ? entity(ref.entity)?.saved : undefined);
            return found === undefined ? undefined : scriptParticipant(found);
        },
        scores: (objective) =>
            scoreboard.scoresOf(objective).map(({ participant, score }) => ({
                participant: scriptParticipant(participant),
                score
            })),
        score: (objective, participant) => scoreboard.scoreOf(objective, participant),
        setScore: (objective, ref, score) =>
            scriptParticipant(
                scoreboard.write(objective, ref, score, 'entity' in ref ? entity(ref.entity) : undefined).participant
            ),
        removeScore: (objective, participant) => scoreboard.erase(objective, participant),
        display: (slot) => {
            const shown = scoreboard.display(SLOTS[slot]);
            return shown === undefined
                ? undefined
                : { objective: shown.objective, sortOrder: shown.sortOrder === 'descending' ? 1 : 0 };
        },
        setDisplay: (slot, display) => {
            scoreboard.setDisplay(
                SLOTS[slot],
                display?.objective,
                display === undefined ? undefined : display.sortOrder === 1 ? 'descending' : 'ascending'
            );
        }
    };
};

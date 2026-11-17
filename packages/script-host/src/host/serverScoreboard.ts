/**
 * The `@minecraft/server` members of the script scoreboard: `World.scoreboard`, `Scoreboard`,
 * `ScoreboardObjective`, `ScoreboardIdentity`, `ScoreboardScoreInfo` and
 * `Entity.scoreboardIdentity`.
 *
 * The scores live in the world's one scoreboard ({@link ScriptScoreboard}), which `/scoreboard`
 * shares, so a score a command writes is the score a script reads. An objective object carries its
 * id and reads the scoreboard each time, so it stops answering once the objective is removed, as
 * on BDS. Every message follows the pinned BDS, as the `persistence` scenario recorded.
 */
import { ScriptHostErrors } from '@jsprismarine/errors/script-host';

import { isRecord } from '../isRecord';
import type { ScriptEngine } from '../ScriptEngine';
import type { ScriptApiImplementations, ScriptCall } from '../shape/implementations';
import type { ScriptValue } from '../values';
import { ScriptHandle } from '../values';
import type { PackHost } from './minecraftServer';
import { entityKeyOf, plainError, SERVER, TAG } from './serverObjects';
import type { ScriptDisplay, ScriptDisplaySlot, ScriptParticipant, ScriptParticipantRef } from './world';

const INT32_MIN = -2147483648;
const INT32_MAX = 2147483647;

/** The order a slot shows its objective in when the script names none: descending, as on BDS. */
const DEFAULT_SORT_ORDER = 1;

const isDisplaySlot = (value: ScriptValue): value is ScriptDisplaySlot =>
    value === 'BelowName' || value === 'List' || value === 'Sidebar';

/** The state of a `ScoreboardIdentity`: the participant's id. */
const identityState = (participant: number): string => JSON.stringify({ participant });

/** The state of a `ScoreboardScoreInfo`: the participant's id and its score when it was read. */
const scoreInfoState = (participant: number, score: number): string => JSON.stringify({ participant, score });

/** Reads an identity or score info state. */
const parsed = (state: string): Record<string, unknown> => {
    // The host wrote the string with JSON.stringify.
    const value: unknown = state === '' ? undefined : JSON.parse(state);
    if (!isRecord(value)) throw new ScriptHostErrors.ObjectCarriesNoState({ what: 'participant' });
    return value;
};

const participantOfState = (state: string): number => {
    const { participant } = parsed(state);
    if (typeof participant !== 'number') throw new ScriptHostErrors.ObjectCarriesNoState({ what: 'participant' });
    return participant;
};

/**
 * Registers the scoreboard members.
 * @param implementations - The pack's implementations, which this adds to.
 * @param host - The pack's view of the runtime and the world.
 */
export const implementScoreboard = (implementations: ScriptApiImplementations, host: PackHost): void => {
    const { world } = host;
    const board = world.scoreboard;
    // Read when a member runs: registering the members reaches nothing of the runtime.
    const engine = (): ScriptEngine => host.engine;

    const objectiveObject = (id: string): ScriptHandle => host.instance('ScoreboardObjective', TAG.objective, id);
    const identityObject = (participant: ScriptParticipant): ScriptHandle =>
        host.instance('ScoreboardIdentity', TAG.identity, identityState(participant.id));
    const array = (handles: readonly ScriptHandle[]): ScriptHandle => {
        const list = engine().evaluate('[]');
        if (!(list instanceof ScriptHandle)) throw new ScriptHostErrors.LiteralEvaluatedToPrimitive({ kind: 'array' });
        handles.forEach((handle, index) => engine().set(list, String(index), handle));
        return engine().release(list);
    };

    /** The objective an objective object names, or BDS's error once it is gone. */
    const objectiveOf = (call: ScriptCall): string => {
        if (board.objective(call.state) === undefined) throw plainError(`Failed to find objective '${call.state}'.`);
        return call.state;
    };

    /**
     * Reads a participant argument: a fake player's name, an entity, or an identity.
     * @returns The reference, and the name BDS's errors give it.
     */
    const refOf = (call: ScriptCall, value: ScriptValue): { ref: ScriptParticipantRef; label: string } => {
        if (!(value instanceof ScriptHandle)) return { ref: { name: String(value) }, label: String(value) };
        const state = call.stateOf(value);
        const fields = parsed(state);
        if (typeof fields.participant === 'number') {
            const participant = board.participant({ participant: fields.participant });
            return { ref: { participant: fields.participant }, label: participant?.displayName ?? '' };
        }
        const { id } = entityKeyOf(state);
        return { ref: { entity: id }, label: id };
    };
    const find = (call: ScriptCall, value: ScriptValue): ScriptParticipant | undefined =>
        board.participant(refOf(call, value).ref);

    const displayObject = (display: ScriptDisplay): ScriptHandle => {
        const object = engine().evaluate('({})');
        if (!(object instanceof ScriptHandle))
            throw new ScriptHostErrors.LiteralEvaluatedToPrimitive({ kind: 'object' });
        engine().set(object, 'objective', objectiveObject(display.objective));
        engine().set(object, 'sortOrder', display.sortOrder);
        return engine().release(object);
    };
    const slotOf = (call: ScriptCall): ScriptDisplaySlot => {
        const [slot] = call.args;
        // The binding checked it against `DisplaySlotId`.
        if (!isDisplaySlot(slot))
            throw new ScriptHostErrors.ArgumentNotOfType({ argument: 'slot', type: 'DisplaySlotId' });
        return slot;
    };
    const shownIn = (slot: ScriptDisplaySlot): ScriptHandle | undefined => {
        const shown = board.display(slot);
        return shown === undefined ? undefined : objectiveObject(shown.objective);
    };
    const identityOf = (call: ScriptCall): ScriptParticipant | undefined =>
        board.participant({ participant: participantOfState(call.state) });

    implementations
        .implement(SERVER, 'World', 'scoreboard', { get: () => host.instance('Scoreboard', TAG.scoreboard) })
        .implement(SERVER, 'Scoreboard', 'addObjective', (call) => {
            const [id, displayName] = call.args;
            const name = String(id);
            if (!board.addObjective(name, typeof displayName === 'string' ? displayName : name)) {
                throw plainError(`Failed to add objective '${name}' as it is already being tracked.`);
            }
            return objectiveObject(name);
        })
        .implement(SERVER, 'Scoreboard', 'getObjective', (call) => {
            const id = String(call.args[0]);
            return board.objective(id) === undefined ? undefined : objectiveObject(id);
        })
        .implement(SERVER, 'Scoreboard', 'getObjectives', () =>
            array(board.objectives().map((objective) => objectiveObject(objective.id)))
        )
        .implement(SERVER, 'Scoreboard', 'getParticipants', () => array(board.participants().map(identityObject)))
        .implement(SERVER, 'Scoreboard', 'removeObjective', (call) => {
            const [objective] = call.args;
            const id = objective instanceof ScriptHandle ? call.stateOf(objective) : String(objective);
            if (!board.removeObjective(id)) throw plainError('Failed to find the objective specified.');
            return true;
        })
        .implement(SERVER, 'Scoreboard', 'getObjectiveAtDisplaySlot', (call) => {
            const shown = board.display(slotOf(call));
            return shown === undefined ? undefined : displayObject(shown);
        })
        .implement(SERVER, 'Scoreboard', 'setObjectiveAtDisplaySlot', (call) => {
            const slot = slotOf(call);
            const options = call.args[1];
            // The binding checked it is an object.
            if (!(options instanceof ScriptHandle)) throw new ScriptHostErrors.DisplayOptionsNotAnObject();
            const objective = engine().get(options, 'objective');
            const sortOrder = engine().get(options, 'sortOrder');
            const id = call.stateOf(objective);
            if (objective instanceof ScriptHandle) engine().free(objective);
            if (board.objective(id) === undefined) throw plainError(`Failed to find objective '${id}'.`);
            const previous = shownIn(slot);
            board.setDisplay(slot, { objective: id, sortOrder: sortOrder === 0 ? 0 : DEFAULT_SORT_ORDER });
            return previous;
        })
        .implement(SERVER, 'Scoreboard', 'clearObjectiveAtDisplaySlot', (call) => {
            const slot = slotOf(call);
            const previous = shownIn(slot);
            board.setDisplay(slot, undefined);
            return previous;
        })
        .implement(SERVER, 'ScoreboardObjective', 'id', { get: (call) => objectiveOf(call) })
        .implement(SERVER, 'ScoreboardObjective', 'displayName', {
            get: (call) => board.objective(objectiveOf(call))?.displayName
        })
        .implement(SERVER, 'ScoreboardObjective', 'isValid', {
            get: (call) => board.objective(call.state) !== undefined
        })
        .implement(SERVER, 'ScoreboardObjective', 'setScore', (call) => {
            const objective = objectiveOf(call);
            const [participant, score] = call.args;
            // The binding checked the score is in the int32 range; BDS drops a fraction.
            board.setScore(objective, refOf(call, participant).ref, Math.trunc(Number(score)));
            return undefined;
        })
        .implement(SERVER, 'ScoreboardObjective', 'addScore', (call) => {
            const objective = objectiveOf(call);
            const [participant, added] = call.args;
            const { ref, label } = refOf(call, participant);
            const found = board.participant(ref);
            const current = found === undefined ? 0 : (board.score(objective, found.id) ?? 0);
            const sum = current + Math.trunc(Number(added));
            if (sum < INT32_MIN || sum > INT32_MAX) {
                throw plainError(
                    `Encountered an integer overflow when trying to modify objective score for participant '${found?.displayName ?? label}'.`
                );
            }
            board.setScore(objective, ref, sum);
            return sum;
        })
        .implement(SERVER, 'ScoreboardObjective', 'getScore', (call) => {
            const objective = objectiveOf(call);
            const { ref, label } = refOf(call, call.args[0]);
            const found = board.participant(ref);
            if (found === undefined) throw plainError(`Failed to resolve identity for '${label}'.`);
            return board.score(objective, found.id);
        })
        .implement(SERVER, 'ScoreboardObjective', 'getScores', (call) => {
            const scores = board.scores(objectiveOf(call));
            const infos = scores.map(({ participant, score }) =>
                host.create('ScoreboardScoreInfo', TAG.scoreInfo, scoreInfoState(participant.id, score))
            );
            try {
                return array(infos);
            } finally {
                // The array holds each one now.
                for (const info of infos) engine().free(info);
            }
        })
        .implement(SERVER, 'ScoreboardObjective', 'getParticipants', (call) =>
            array(board.scores(objectiveOf(call)).map(({ participant }) => identityObject(participant)))
        )
        .implement(SERVER, 'ScoreboardObjective', 'hasParticipant', (call) => {
            const objective = objectiveOf(call);
            const found = find(call, call.args[0]);
            return found !== undefined && board.score(objective, found.id) !== undefined;
        })
        .implement(SERVER, 'ScoreboardObjective', 'removeParticipant', (call) => {
            const objective = objectiveOf(call);
            const found = find(call, call.args[0]);
            return found !== undefined && board.removeScore(objective, found.id);
        })
        .implement(SERVER, 'ScoreboardIdentity', 'id', { get: (call) => participantOfState(call.state) })
        .implement(SERVER, 'ScoreboardIdentity', 'type', { get: (call) => identityOf(call)?.type })
        .implement(SERVER, 'ScoreboardIdentity', 'displayName', { get: (call) => identityOf(call)?.displayName })
        .implement(SERVER, 'ScoreboardIdentity', 'isValid', {
            get: (call) => board.participants().some(({ id }) => id === participantOfState(call.state))
        })
        .implement(SERVER, 'ScoreboardIdentity', 'getEntity', (call) => {
            const entity = identityOf(call)?.entity;
            const state = entity === undefined ? undefined : world.entity(entity);
            return state === undefined ? undefined : host.entity({ id: state.id, typeId: state.typeId });
        })
        .implement(SERVER, 'ScoreboardScoreInfo', 'participant', {
            get: (call) => {
                const participant = board.participant({ participant: participantOfState(call.state) });
                return participant === undefined ? undefined : identityObject(participant);
            }
        })
        .implement(SERVER, 'ScoreboardScoreInfo', 'score', {
            get: (call) => {
                const { score } = parsed(call.state);
                return typeof score === 'number' ? score : undefined;
            }
        })
        .implement(SERVER, 'Entity', 'scoreboardIdentity', {
            get: (call) => {
                const { id } = entityKeyOf(call.state);
                if (world.entity(id) === undefined) return undefined;
                const participant = board.participant({ entity: id });
                return participant === undefined ? undefined : identityObject(participant);
            }
        });
};

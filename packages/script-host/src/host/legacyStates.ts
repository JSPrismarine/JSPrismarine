/**
 * The states BDS's Script API reports for a block beside the ones a server keeps. A block that
 * was flattened into one type per variant still reports its old variant state, fixed to its own
 * value, such as an oak log's `old_log_type: "oak"`, and some states are reported under an old
 * name beside the new one, such as a slab's `top_slot_bit` beside `minecraft:vertical_half`.
 */
import type { ScriptLegacyStates, ScriptStateValue } from './world';

type States = Readonly<Record<string, ScriptStateValue>>;

/**
 * A permutation's states as a script reads them: the world's, then each state BDS reports that
 * the world does not keep, from the state that decides it or else the type's default.
 */
export const withLegacyStates = (legacy: ScriptLegacyStates | undefined, states: States): States => {
    if (legacy === undefined) return states;
    const all: Record<string, ScriptStateValue> = { ...states };
    for (const [name, fallback] of Object.entries(legacy.defaults)) {
        if (name in all) continue;
        const decided = (legacy.follows[name] ?? [])
            .filter(({ state }) => state in states)
            .map(({ state, values }) => values[String(states[state])])
            .find((value) => value !== undefined);
        all[name] = decided ?? fallback;
    }
    return all;
};

/**
 * The states a script names, as the world keeps them: a state BDS reports under an old name sets
 * the state it stands for when the script did not name that one, and a state the world does not
 * keep is dropped.
 * @param kept - The states the world keeps for the type, with any value.
 */
export const withoutLegacyStates = (legacy: ScriptLegacyStates | undefined, kept: States, states: States): States => {
    if (legacy === undefined) return states;
    const out: Record<string, ScriptStateValue> = {};
    for (const [name, value] of Object.entries(states))
        if (name in kept || !(name in legacy.defaults)) out[name] = value;
    for (const [name, value] of Object.entries(states)) {
        if (name in kept || !(name in legacy.defaults)) continue;
        // The kept state this old name decides, read back through the relation the other way.
        for (const [target, follows] of Object.entries(legacy.follows)) {
            if (!(target in kept) || target in out) continue;
            const decided = follows.find(({ state }) => state === name)?.values[String(value)];
            if (decided !== undefined) out[target] = decided;
        }
    }
    return out;
};

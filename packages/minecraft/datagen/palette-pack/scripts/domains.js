import { system, BlockTypes, BlockPermutation, BlockStates } from '@minecraft/server';

const line = (s) => console.warn(`PALETTE ${s}`);

/** The values a property is declared with, game wide. A starting set, not the answer. */
const candidates = (name, fallback) => {
    try {
        const def = BlockStates.get(name);
        const raw = def?.validValues;
        if (Array.isArray(raw)) return raw;
        if (raw && typeof raw[Symbol.iterator] === 'function') return Array.from(raw);
    } catch {
        /* fall through */
    }
    return [fallback];
};

/**
 * The values *this block* accepts, which is narrower than the declaration for some.
 *
 * `age` is declared 0..15 and cocoa takes 0..2; a palette built from the declaration has
 * thirteen states cocoa does not have, and every one of them hashes to a runtime id no client
 * will ever recognise. Asking the game to resolve each value is the only way to tell.
 */
const accepted = (blockId, property, values) =>
    values.filter((value) => {
        try {
            return BlockPermutation.resolve(blockId, { [property]: value }).getAllStates()[property] === value;
        } catch {
            return false;
        }
    });

system.run(() => {
    const types = BlockTypes.getAll();
    line(`BEGIN types=${types.length}`);

    for (const type of types) {
        try {
            const states = BlockPermutation.resolve(type.id).getAllStates();
            const props = {};
            for (const [name, value] of Object.entries(states)) {
                const domain = accepted(type.id, name, candidates(name, value));
                props[name] = { values: domain.length > 0 ? domain : [value], default: value };
            }
            line(`BLOCK ${JSON.stringify({ name: type.id, props })}`);
        } catch (e) {
            line(`ERR ${type.id} ${e}`);
        }
    }

    line('END');
});

/**
 * What the `@minecraft/server` implementations share: the tags the host gives the objects it
 * makes, the state each kind of object carries, and the errors BDS throws for them.
 *
 * An object stands for something by its state, a string the engine keeps with it
 * (`ScriptApiContext.create`): an entity's id and type, a block's dimension and position, an item
 * stack's contents. A member reads the world through the state each time it runs, so an object
 * never holds a copy of the world that goes stale.
 */
import { engineFunctionSource } from '../engineSource';
import { ScriptApiError } from '../errors';
import type { ScriptEngine } from '../ScriptEngine';
import type { ScriptCall } from '../shape/implementations';
import type { ScriptValue } from '../values';
import { ScriptHandle } from '../values';
import type { ScriptBlockPermutation, ScriptItem, ScriptVector3 } from './world';
import { isRecord } from '../isRecord';

/** The module every implementation here belongs to. */
export const SERVER = '@minecraft/server';

/** The module of the errors `@minecraft/server` shares with the other modules. */
export const COMMON = '@minecraft/common';

/** The type of a player's entity. */
export const PLAYER = 'minecraft:player';

/** The tags of the objects a pack's members return. */
export const TAG = {
    worldAfterEvents: 1,
    worldBeforeEvents: 2,
    systemAfterEvents: 3,
    systemBeforeEvents: 4,
    gameRules: 5,
    /** A dimension; its state is the dimension's id. */
    dimension: 6,
    /** An entity or a player; its state is an {@link EntityKey}. */
    entity: 7,
    /** An entity's inventory component; its state is the entity's {@link EntityKey}. */
    inventory: 8,
    /** An entity's container; its state is the entity's {@link EntityKey}. */
    container: 9,
    /** A block; its state is a {@link BlockKey}. */
    block: 10,
    /** A block permutation; its state is a {@link ScriptBlockPermutation}. */
    permutation: 11,
    /** A block type; its state is the type's id. */
    blockType: 12,
    /** An item stack; its state is a {@link ScriptItem}. */
    itemStack: 13,
    /** A command's result; its state is the success count. */
    commandResult: 14,
    /** A signal's tag is this plus its index in the signal list. */
    signal: 100
} as const;

/** What an entity object carries: its id, and its type, which BDS still reports once it is gone. */
export interface EntityKey {
    readonly id: string;
    readonly typeId: string;
}

/** What a block object carries: its dimension and its position. */
export interface BlockKey extends ScriptVector3 {
    readonly dimension: string;
}

/** Reads a state the host wrote as JSON. The host wrote every state, so a bad one is a host bug. */
const parseState = (state: string, what: string): Record<string, unknown> => {
    // The host wrote the string with JSON.stringify.
    const parsed: unknown = state === '' ? undefined : JSON.parse(state);
    if (!isRecord(parsed)) throw new TypeError(`The object carries no ${what}`);
    return parsed;
};

/** The entity an object stands for. */
export const entityKeyOf = (state: string): EntityKey => {
    const { id, typeId } = parseState(state, 'entity');
    if (typeof id !== 'string' || typeof typeId !== 'string') throw new TypeError('The object carries no entity');
    return { id, typeId };
};

/** The block an object stands for. */
export const blockKeyOf = (state: string): BlockKey => {
    const { dimension, x, y, z } = parseState(state, 'block');
    if (typeof dimension !== 'string' || typeof x !== 'number' || typeof y !== 'number' || typeof z !== 'number') {
        throw new TypeError('The object carries no block');
    }
    return { dimension, x, y, z };
};

/** The permutation an object stands for. */
export const permutationOf = (state: string): ScriptBlockPermutation => {
    const { typeId, states } = parseState(state, 'block permutation');
    if (typeof typeId !== 'string' || !isRecord(states)) throw new TypeError('The object carries no permutation');
    const values: Record<string, string | number | boolean> = {};
    for (const [name, value] of Object.entries(states)) {
        if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') values[name] = value;
    }
    return { typeId, states: values };
};

/** The item stack an object stands for. */
export const itemOf = (state: string): ScriptItem => {
    const { typeId, amount, nameTag, lore } = parseState(state, 'item stack');
    if (typeof typeId !== 'string' || typeof amount !== 'number') throw new TypeError('The object carries no item');
    return {
        typeId,
        amount,
        ...(typeof nameTag === 'string' ? { nameTag } : {}),
        ...(Array.isArray(lore) ? { lore: lore.filter((line) => typeof line === 'string') } : {})
    };
};

/** Adds `minecraft:` to an id given without a namespace, as BDS reads one. */
export const withNamespace = (id: string): string => (id.includes(':') ? id : `minecraft:${id}`);

/** A dimension's id without `minecraft:`, which `getDimension` also accepts. */
export const shortName = (id: string): string => (id.startsWith('minecraft:') ? id.slice('minecraft:'.length) : id);

/** A whole-block position, floored as BDS floors a location. */
export const blockPosition = ({ x, y, z }: ScriptVector3): ScriptVector3 => ({
    x: Math.floor(x),
    y: Math.floor(y),
    z: Math.floor(z)
});

/** A location as BDS's location errors write it, such as `(0.0, -60.0, 0.0)`, after flooring. */
const locationText = (location: ScriptVector3): string => {
    const { x, y, z } = blockPosition(location);
    return `(${x.toFixed(1)}, ${y.toFixed(1)}, ${z.toFixed(1)})`;
};

/** BDS's error for a location whose chunk is not loaded. */
export const unloadedChunk = (location: ScriptVector3): ScriptApiError =>
    new ScriptApiError(
        SERVER,
        'LocationInUnloadedChunkError',
        `Trying to access location ${locationText(location)} which is not in a chunk currently loaded and ticking.`
    );

/** BDS's error for a location above or below its dimension. */
export const outsideWorld = (location: ScriptVector3): ScriptApiError =>
    new ScriptApiError(
        SERVER,
        'LocationOutOfWorldBoundariesError',
        `Trying to access location ${locationText(location)} which is outside of the world boundaries.`
    );

/** How a member reaches an entity that is gone, as BDS words its error. */
export type EntityAccess = 'get' | 'set' | 'call';

/**
 * BDS's error for a member of an entity that is dead or gone.
 * @param entity - The entity, whose id and type the error's `id` and `type` then carry.
 */
export const invalidEntity = (access: EntityAccess, member: string, entity?: EntityKey): ScriptApiError => {
    const verb = access === 'call' ? 'call function' : `${access} property`;
    return new ScriptApiError(
        SERVER,
        'InvalidEntityError',
        `Failed to ${verb} '${member}' due to Entity being invalid (has the Entity been removed?).`,
        entity === undefined ? undefined : { id: entity.id, type: entity.typeId }
    );
};

/** BDS's plain `Error`, which it throws where the API names no error class. */
export const plainError = (message: string): ScriptApiError => new ScriptApiError(SERVER, 'Error', message);

/**
 * A location argument as plain data: the binding checked it is an object, and the engine copies
 * it as JSON, so a getter on it runs in the script and not in the host.
 */
export const vectorArgument = (call: ScriptCall, index: number): ScriptVector3 => {
    const json = call.stringify(call.args[index]);
    // The engine wrote the string with JSON.stringify.
    const parsed: unknown = json === undefined ? undefined : JSON.parse(json);
    const read = (key: string): number => {
        const value = isRecord(parsed) ? parsed[key] : undefined;
        if (typeof value !== 'number' || !Number.isFinite(value)) {
            throw new TypeError(`Native type conversion failed. Function argument [${index}] expected type: Vector3`);
        }
        return value;
    };
    return { x: read('x'), y: read('y'), z: read('z') };
};

/**
 * The text of a `sendMessage` argument: a string, a `RawMessage` or a list of either. It runs
 * inside the pack's engine, never in Node.js, so the watchdog counts each element it visits and a
 * list whose `length` never ends stops at the step budget. It must not refer to anything outside
 * its own body.
 */
function messageText(value: unknown): string {
    // biome-ignore lint/suspicious/noRedundantUseStrict: the engine runs this source as a script, which is sloppy unless it says otherwise.
    'use strict';
    const text = (part: unknown): string => {
        if (typeof part === 'string') return part;
        if (typeof part !== 'object' || part === null) return '';
        // Any object a script passed; the binding checked only that it is one.
        const message = part as Readonly<Record<PropertyKey, unknown>>;
        const { length } = message;
        if (typeof length === 'number') {
            let joined = '';
            for (let index = 0; index < length; index++) joined += text(message[index]);
            return joined;
        }
        if (typeof message.text === 'string') return message.text;
        if (typeof message.translate === 'string') return message.translate;
        return text(message.rawtext);
    };
    return text(value);
}

/** Reads a `sendMessage` argument's text inside the engine, with {@link messageText}. */
export const readMessage = (engine: ScriptEngine, value: ScriptValue): string => {
    const walk = engine.evaluate(engineFunctionSource(messageText.toString()), '<jsp sendMessage>');
    if (!(walk instanceof ScriptHandle)) throw new TypeError('The message walk is not a function');
    try {
        const text = engine.call(walk, undefined, value);
        return typeof text === 'string' ? text : '';
    } finally {
        engine.free(walk);
    }
};

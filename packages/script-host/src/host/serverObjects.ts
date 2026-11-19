/**
 * What the `@minecraft/server` implementations share: the tags the host gives the objects it
 * makes, the state each kind of object carries, and the errors BDS throws for them.
 *
 * An object stands for something by its state, a string the engine keeps with it
 * (`ScriptApiContext.create`): an entity's id and type, a block's dimension and position, an item
 * stack's contents. A member reads the world through the state each time it runs, so an object
 * never holds a copy of the world that goes stale.
 */
import { ScriptHostErrors } from '@jsprismarine/errors/script-host';

import { engineFunctionSource } from '../engineSource';
import { ScriptApiError } from '../errors';
import type { ScriptEngine } from '../ScriptEngine';
import type { ScriptCall } from '../shape/implementations';
import type { ScriptValue } from '../values';
import { ScriptHandle } from '../values';
import type {
    ScriptBlockPermutation,
    ScriptGameMode,
    ScriptItem,
    ScriptProperties,
    ScriptPropertyValue,
    ScriptVector3
} from './world';
import { isRecord } from '../isRecord';
import { blockPropertiesState, itemExtrasOf } from './blocksItems/itemExtras';

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
    /** An entity's or a block's container; its state is the entity's {@link EntityKey} or the block's {@link BlockKey}. */
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
    /** The world's scoreboard. */
    scoreboard: 15,
    /** A scoreboard objective; its state is the objective's id. */
    objective: 16,
    /** A scoreboard identity; its state names the participant's id. */
    identity: 17,
    /** A score as `getScores` read it; its state names the participant and the score. */
    scoreInfo: 18,
    /** `StartupEvent.customCommandRegistry`. */
    customCommandRegistry: 19,
    /** The block component registry of `startup` or `worldInitialize`. */
    blockComponentRegistry: 20,
    /** The item component registry of `startup` or `worldInitialize`. */
    itemComponentRegistry: 21,
    /** Who ran a custom command; its state is a `ScriptCommandOrigin`. */
    commandOrigin: 22,
    /** An entity type; its state is the type's id. */
    entityType: 23,
    /** An item type; its state is the type's id. */
    itemType: 24,
    /** A custom component hook's event; its state is the event the world raised. */
    componentEvent: 25,
    /** The parameters a block or item gives a custom component; its state is their JSON, empty for none. */
    componentParameters: 26,
    /** A player's screen display; its state is the player's {@link EntityKey}. */
    screenDisplay: 27,
    /** A sound a script played; its state names the sound and its listener. */
    soundInstance: 28,
    /** A `MolangVariableMap`; its state is the JSON of its variables. */
    molangVariables: 29,
    /** A status effect as it was read; its state is a `ScriptEffect` and its entity's id. */
    effect: 30,
    /** A block's inventory component; its state is the block's {@link BlockKey}. */
    blockInventory: 31,
    /** An item stack's durability component; its state is empty, and the stack it reads is linked to it. */
    durability: 32,
    /** An entity's equippable component; its state is the entity's {@link EntityKey}. */
    equippable: 33,
    /** An entity's attribute component; its state is the entity's {@link EntityKey} and the attribute's id. */
    attribute: 34,
    /** A `ContainerSlot`; its state names its container, or its entity's equipment, and the slot. */
    containerSlot: 35,
    /** `world.structureManager`. */
    structureManager: 36,
    /** A structure; its state is the structure's id. */
    structure: 37,
    /** A dimension type; its state is the dimension's id. */
    dimensionType: 38,
    /** A status effect type; its state is the effect's id. */
    effectType: 39,
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
    if (!isRecord(parsed)) throw new ScriptHostErrors.ObjectCarriesNoState({ what });
    return parsed;
};

/** The entity an object stands for. */
export const entityKeyOf = (state: string): EntityKey => {
    const { id, typeId } = parseState(state, 'entity');
    if (typeof id !== 'string' || typeof typeId !== 'string')
        throw new ScriptHostErrors.ObjectCarriesNoState({ what: 'entity' });
    return { id, typeId };
};

/** The block an object stands for. */
export const blockKeyOf = (state: string): BlockKey => {
    const { dimension, x, y, z } = parseState(state, 'block');
    if (typeof dimension !== 'string' || typeof x !== 'number' || typeof y !== 'number' || typeof z !== 'number') {
        throw new ScriptHostErrors.ObjectCarriesNoState({ what: 'block' });
    }
    return { dimension, x, y, z };
};

/** Whether an object's state names a block, as a container's state does for a block's container. */
export const namesBlock = (state: string): boolean => 'dimension' in parseState(state, 'container');

/** The permutation an object stands for. */
export const permutationOf = (state: string): ScriptBlockPermutation => {
    const { typeId, states } = parseState(state, 'block permutation');
    if (typeof typeId !== 'string' || !isRecord(states))
        throw new ScriptHostErrors.ObjectCarriesNoState({ what: 'permutation' });
    const values: Record<string, string | number | boolean> = {};
    for (const [name, value] of Object.entries(states)) {
        if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') values[name] = value;
    }
    return { typeId, states: values };
};

/**
 * A number as an item state's JSON holds it: as it is, or as text for the ones JSON has no form
 * for, negative zero and the infinities a vector part can hold.
 */
const stateNumber = (value: number): number | string =>
    Object.is(value, -0) ? '-0' : Number.isFinite(value) ? value : String(value);

const numberOfState = (value: unknown): number | undefined =>
    typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : undefined;

/** One dynamic property as an item state holds it: its id, a kind letter and the value. */
type StateProperty = readonly [string, 'n' | 'b' | 's' | 'v', unknown];

const stateProperty = (id: string, value: ScriptPropertyValue): StateProperty => {
    if (typeof value === 'number') return [id, 'n', stateNumber(value)];
    if (typeof value === 'boolean') return [id, 'b', value];
    if (typeof value === 'string') return [id, 's', value];
    return [id, 'v', [value.x, value.y, value.z].map(stateNumber)];
};

const propertyOfState = (entry: unknown): readonly [string, ScriptPropertyValue] | undefined => {
    if (!Array.isArray(entry)) return undefined;
    const [id, kind, value] = entry;
    if (typeof id !== 'string') return undefined;
    if (kind === 'n') {
        const number = numberOfState(value);
        return number === undefined ? undefined : [id, number];
    }
    if (kind === 'b' && typeof value === 'boolean') return [id, value];
    if (kind === 's' && typeof value === 'string') return [id, value];
    if (kind === 'v' && Array.isArray(value)) {
        const [x, y, z] = value.map(numberOfState);
        return x === undefined || y === undefined || z === undefined ? undefined : [id, { x, y, z }];
    }
    return undefined;
};

/** The item stack an object stands for. */
export const itemOf = (state: string): ScriptItem => {
    const parsed = parseState(state, 'item stack');
    const { typeId, amount, nameTag, lore, damage, properties } = parsed;
    if (typeof typeId !== 'string' || typeof amount !== 'number')
        throw new ScriptHostErrors.ObjectCarriesNoState({ what: 'item' });
    const dynamicProperties = new Map<string, ScriptProperties>();
    for (const pack of Array.isArray(properties) ? properties : []) {
        if (!Array.isArray(pack) || typeof pack[0] !== 'string' || !Array.isArray(pack[1])) continue;
        const values = new Map<string, ScriptPropertyValue>();
        for (const entry of pack[1]) {
            const read = propertyOfState(entry);
            if (read !== undefined) values.set(read[0], read[1]);
        }
        if (values.size > 0) dynamicProperties.set(pack[0], values);
    }
    return {
        typeId,
        amount,
        ...(typeof nameTag === 'string' ? { nameTag } : {}),
        ...(Array.isArray(lore) ? { lore: lore.filter((line) => typeof line === 'string') } : {}),
        ...(typeof damage === 'number' && damage > 0 ? { damage } : {}),
        ...(dynamicProperties.size > 0 ? { dynamicProperties } : {}),
        ...itemExtrasOf(parsed)
    };
};

/**
 * A `GameMode` argument as version 2 names it: a name in any case, as version 1 writes it in
 * lower case, or Bedrock's number, which `spawnSimulatedPlayer`'s metadata defaults to.
 */
export const gameModeOf = (value: ScriptValue): ScriptGameMode => {
    if (typeof value === 'string') {
        const lower = value.toLowerCase();
        if (lower === 'creative') return 'Creative';
        if (lower === 'adventure') return 'Adventure';
        if (lower === 'spectator') return 'Spectator';
        return 'Survival';
    }
    // Bedrock's numbering: 0 survival, 1 creative, 2 adventure, 6 spectator.
    return value === 1 ? 'Creative' : value === 2 ? 'Adventure' : value === 6 ? 'Spectator' : 'Survival';
};
/** The state an item stack object carries, which {@link itemOf} reads. */
export const itemState = ({ dynamicProperties, blockProperties, ...item }: ScriptItem): string =>
    JSON.stringify({
        ...item,
        ...(dynamicProperties === undefined || dynamicProperties.size === 0
            ? {}
            : {
                  properties: [...dynamicProperties].map(([pack, values]) => [
                      pack,
                      [...values].map(([id, value]) => stateProperty(id, value))
                  ])
              }),
        ...(blockProperties === undefined || blockProperties.size === 0
            ? {}
            : { blockProperties: blockPropertiesState(blockProperties) })
    });

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
            throw new ScriptHostErrors.ArgumentConversionFailed({ index, expected: 'Vector3' });
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
    if (!(walk instanceof ScriptHandle)) throw new ScriptHostErrors.NotAFunction({ what: 'The message walk' });
    try {
        const text = engine.call(walk, undefined, value);
        return typeof text === 'string' ? text : '';
    } finally {
        engine.free(walk);
    }
};

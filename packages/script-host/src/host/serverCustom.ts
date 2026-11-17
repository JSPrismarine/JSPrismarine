/**
 * The `@minecraft/server` members of custom commands and custom components: the registries
 * `startup` hands a pack, the origin a command's callback receives, and the events and parameters
 * a component's hooks receive.
 *
 * Registration goes through {@link PackCustomContent}, which checks it as BDS does. A hook's event
 * object carries the event the world raised as its state, so its members read what the world saw
 * and the block or entity as it is when they run.
 */
import type { ScriptApiImplementations, ScriptCall } from '../shape/implementations';
import { isRecord } from '../isRecord';
import type { ScriptValue } from '../values';
import { ScriptHandle } from '../values';
import type { PackHost } from './minecraftServer';
import { SERVER, TAG } from './serverObjects';
import type {
    ScriptBlockHookEvent,
    ScriptBlockPermutation,
    ScriptCommandOrigin,
    ScriptCommandParamType,
    ScriptCommandParameter,
    ScriptCustomCommand,
    ScriptEntityRef,
    ScriptItemHookEvent
} from './world';

/** A hook's event as its object carries it, with the cancel a before-hook's script sets. */
export type HookEventState = (ScriptBlockHookEvent | ScriptItemHookEvent) & { readonly cancel?: boolean };

/** The parameter types `CustomCommandParamType` lists. */
const PARAM_TYPES: ReadonlySet<string> = new Set<ScriptCommandParamType>([
    'BlockType',
    'Boolean',
    'EntitySelector',
    'EntityType',
    'Enum',
    'Float',
    'Integer',
    'ItemType',
    'Location',
    'PlayerSelector',
    'String'
]);

const isParamType = (value: unknown): value is ScriptCommandParamType =>
    typeof value === 'string' && PARAM_TYPES.has(value);

/** Reads a `CustomCommandParameter` list the engine copied as JSON. */
const parametersOf = (value: unknown): ScriptCommandParameter[] =>
    (Array.isArray(value) ? value : []).flatMap((parameter: unknown) => {
        if (!isRecord(parameter) || typeof parameter.name !== 'string' || !isParamType(parameter.type)) return [];
        return [
            {
                name: parameter.name,
                type: parameter.type,
                ...(typeof parameter.enumName === 'string' ? { enumName: parameter.enumName } : {})
            }
        ];
    });

/** Reads a `CustomCommand` argument, which the binding checked is an object. */
const commandOf = (call: ScriptCall): ScriptCustomCommand => {
    const json = call.stringify(call.args[0]);
    // The engine wrote the string with JSON.stringify.
    const parsed: unknown = json === undefined ? undefined : JSON.parse(json);
    const read = isRecord(parsed) ? parsed : {};
    const level = read.permissionLevel;
    return {
        name: typeof read.name === 'string' ? read.name : '',
        description: typeof read.description === 'string' ? read.description : '',
        permissionLevel: typeof level === 'number' && Number.isInteger(level) ? level : 0,
        cheatsRequired: read.cheatsRequired === true,
        mandatoryParameters: parametersOf(read.mandatoryParameters),
        optionalParameters: parametersOf(read.optionalParameters)
    };
};

/** The event a hook's object carries. The host wrote every state, so a bad one is a host bug. */
export const hookEventOf = (state: string): HookEventState => {
    const parsed: unknown = JSON.parse(state);
    if (!isRecord(parsed) || typeof parsed.hook !== 'string') throw new TypeError('The object carries no hook event');
    // Written by the runtime from a ScriptBlockHookEvent or ScriptItemHookEvent.
    return parsed as unknown as HookEventState;
};

/** The origin a command's object carries. */
const originOf = (state: string): ScriptCommandOrigin => {
    const parsed: unknown = JSON.parse(state);
    if (!isRecord(parsed) || typeof parsed.sourceType !== 'string') throw new TypeError('The object carries no origin');
    // Written by the runtime from a ScriptCommandOrigin.
    return parsed as unknown as ScriptCommandOrigin;
};

/** The value of one field of a hook's event, or undefined when the hook has none. */
const field = (call: ScriptCall, name: string): unknown => {
    const event: Readonly<Record<string, unknown>> = hookEventOf(call.state);
    return event[name];
};

/**
 * Registers the custom command and custom component members.
 * @param implementations - The pack's implementations, which this adds to.
 * @param host - The pack's view of the runtime and the world.
 */
export const implementCustom = (implementations: ScriptApiImplementations, host: PackHost): void => {
    const release = (handle: ScriptHandle): ScriptHandle => host.engine.release(handle);
    const permutation = (value: unknown): ScriptValue => {
        if (!isRecord(value) || typeof value.typeId !== 'string') return undefined;
        const states = isRecord(value.states) ? value.states : {};
        const made: ScriptBlockPermutation = { typeId: value.typeId, states: statesOf(states) };
        return release(host.create('BlockPermutation', TAG.permutation, JSON.stringify(made)));
    };
    const entity = (value: unknown): ScriptValue => {
        if (!isRecord(value) || typeof value.id !== 'string' || typeof value.typeId !== 'string') return undefined;
        const ref: ScriptEntityRef = { id: value.id, typeId: value.typeId };
        return host.entity(ref);
    };
    const block = (value: unknown): ScriptValue => {
        if (!isRecord(value)) return undefined;
        return release(host.create('Block', TAG.block, JSON.stringify(value)));
    };
    const item = (value: unknown): ScriptValue =>
        isRecord(value) ? release(host.create('ItemStack', TAG.itemStack, JSON.stringify(value))) : undefined;
    const vector = (value: unknown): ScriptValue => (isRecord(value) ? JSON.stringify(value) : undefined);
    const registry = (className: string, tag: number) => ({ get: () => host.instance(className, tag) });
    const register = (kind: 'block' | 'item') => (call: ScriptCall) => {
        const [name, component] = call.args;
        // The binding checked the name is a string and the component an object.
        if (typeof name !== 'string' || !(component instanceof ScriptHandle)) {
            throw new TypeError('The component is not an object');
        }
        host.custom.registerComponent(kind, name, component);
        return undefined;
    };

    implementations
        .implement(
            SERVER,
            'StartupEvent',
            'customCommandRegistry',
            registry('CustomCommandRegistry', TAG.customCommandRegistry)
        )
        .implement(
            SERVER,
            'StartupEvent',
            'blockComponentRegistry',
            registry('BlockComponentRegistry', TAG.blockComponentRegistry)
        )
        .implement(
            SERVER,
            'StartupEvent',
            'itemComponentRegistry',
            registry('ItemComponentRegistry', TAG.itemComponentRegistry)
        )
        .implement(
            SERVER,
            'WorldInitializeBeforeEvent',
            'blockComponentRegistry',
            registry('BlockComponentRegistry', TAG.blockComponentRegistry)
        )
        .implement(
            SERVER,
            'WorldInitializeBeforeEvent',
            'itemComponentRegistry',
            registry('ItemComponentRegistry', TAG.itemComponentRegistry)
        )
        .implement(SERVER, 'CustomCommandRegistry', 'registerEnum', (call) => {
            const [name, values] = call.args;
            const json = call.stringify(values);
            // The engine wrote the string with JSON.stringify, and the binding checked it is a string array.
            const list: unknown = json === undefined ? [] : JSON.parse(json);
            host.custom.registerEnum(
                String(name),
                Array.isArray(list) ? list.filter((value) => typeof value === 'string') : []
            );
            return undefined;
        })
        .implement(SERVER, 'CustomCommandRegistry', 'registerCommand', (call) => {
            const callback = call.args[1];
            // The binding checked the argument against its closure type.
            if (!(callback instanceof ScriptHandle)) throw new TypeError('The callback is not a function');
            host.custom.registerCommand(commandOf(call), callback);
            return undefined;
        })
        .implement(SERVER, 'BlockComponentRegistry', 'registerCustomComponent', register('block'))
        .implement(SERVER, 'ItemComponentRegistry', 'registerCustomComponent', register('item'))
        .implement(SERVER, 'CustomCommandOrigin', 'sourceType', { get: (call) => originOf(call.state).sourceType })
        .implement(SERVER, 'CustomCommandOrigin', 'sourceEntity', {
            get: (call) => entity(originOf(call.state).sourceEntity)
        })
        .implement(SERVER, 'CustomCommandOrigin', 'initiator', {
            get: (call) => entity(originOf(call.state).initiator)
        })
        // No block runs a command on JSPrismarine yet.
        .implement(SERVER, 'CustomCommandOrigin', 'sourceBlock', { get: () => undefined })
        .implement(SERVER, 'EntityType', 'id', { get: (call) => call.state })
        .implement(SERVER, 'ItemType', 'id', { get: (call) => call.state })
        .implement(SERVER, 'CustomComponentParameters', 'params', {
            // A block of the formats before version 2 gives its components no parameters.
            get: (call) => (call.state === '' ? undefined : parseInEngine(call, call.state))
        })
        .implement(SERVER, 'BlockEvent', 'block', { get: (call) => block(field(call, 'block')) })
        .implement(SERVER, 'BlockEvent', 'dimension', {
            get: (call) => {
                const at = field(call, 'block');
                const dimension = isRecord(at) && typeof at.dimension === 'string' ? at.dimension : undefined;
                return dimension === undefined ? undefined : host.instance('Dimension', TAG.dimension, dimension);
            }
        })
        .implement(SERVER, 'BlockComponentOnPlaceEvent', 'previousBlock', {
            get: (call) => permutation(field(call, 'previousBlock'))
        })
        .implement(SERVER, 'BlockComponentBlockBreakEvent', 'brokenBlockPermutation', {
            get: (call) => permutation(field(call, 'brokenBlockPermutation'))
        })
        .implement(SERVER, 'BlockComponentBlockBreakEvent', 'entitySource', {
            get: (call) => entity(field(call, 'entitySource'))
        })
        // No block destroys another through this hook on JSPrismarine yet.
        .implement(SERVER, 'BlockComponentBlockBreakEvent', 'blockDestructionSource', { get: () => undefined })
        .implement(SERVER, 'BlockComponentPlayerBreakEvent', 'brokenBlockPermutation', {
            get: (call) => permutation(field(call, 'brokenBlockPermutation'))
        })
        .implement(SERVER, 'BlockComponentPlayerBreakEvent', 'player', { get: (call) => entity(field(call, 'player')) })
        .implement(SERVER, 'BlockComponentPlayerInteractEvent', 'player', {
            get: (call) => entity(field(call, 'player'))
        })
        .implement(SERVER, 'BlockComponentPlayerInteractEvent', 'face', {
            get: (call) => stringOf(field(call, 'face'))
        })
        .implement(SERVER, 'BlockComponentPlayerInteractEvent', 'faceLocation', {
            get: (call) => vector(field(call, 'faceLocation'))
        })
        .implement(SERVER, 'BlockComponentPlayerPlaceBeforeEvent', 'player', {
            get: (call) => entity(field(call, 'player'))
        })
        .implement(SERVER, 'BlockComponentPlayerPlaceBeforeEvent', 'face', {
            get: (call) => stringOf(field(call, 'face'))
        })
        .implement(SERVER, 'BlockComponentPlayerPlaceBeforeEvent', 'permutationToPlace', {
            get: (call) => permutation(field(call, 'permutationToPlace'))
        })
        .implement(SERVER, 'BlockComponentPlayerPlaceBeforeEvent', 'cancel', {
            get: (call) => hookEventOf(call.state).cancel === true,
            set: (call) => call.setState(JSON.stringify({ ...hookEventOf(call.state), cancel: call.args[0] === true }))
        })
        .implement(SERVER, 'ItemComponentUseEvent', 'source', { get: (call) => entity(field(call, 'source')) })
        .implement(SERVER, 'ItemComponentUseEvent', 'itemStack', { get: (call) => item(field(call, 'item')) })
        .implement(SERVER, 'ItemCompleteUseEvent', 'source', { get: (call) => entity(field(call, 'source')) })
        .implement(SERVER, 'ItemCompleteUseEvent', 'itemStack', { get: (call) => item(field(call, 'item')) })
        .implement(SERVER, 'ItemComponentConsumeEvent', 'source', { get: (call) => entity(field(call, 'source')) })
        .implement(SERVER, 'ItemComponentConsumeEvent', 'itemStack', { get: (call) => item(field(call, 'item')) })
        .implement(SERVER, 'ItemUseOnEvent', 'itemStack', { get: (call) => item(field(call, 'item')) })
        .implement(SERVER, 'ItemUseOnEvent', 'block', { get: (call) => block(field(call, 'block')) })
        .implement(SERVER, 'ItemUseOnEvent', 'blockFace', { get: (call) => stringOf(field(call, 'blockFace')) })
        .implement(SERVER, 'ItemUseOnEvent', 'faceLocation', { get: (call) => vector(field(call, 'faceLocation')) })
        .implement(SERVER, 'ItemComponentUseOnEvent', 'source', { get: (call) => entity(field(call, 'source')) })
        .implement(SERVER, 'ItemComponentUseOnEvent', 'usedOnBlockPermutation', {
            get: (call) => permutation(field(call, 'usedOnBlockPermutation'))
        })
        .implement(SERVER, 'ItemComponentHitEntityEvent', 'attackingEntity', {
            get: (call) => entity(field(call, 'source'))
        })
        .implement(SERVER, 'ItemComponentHitEntityEvent', 'hitEntity', {
            get: (call) => entity(field(call, 'hitEntity'))
        })
        .implement(SERVER, 'ItemComponentHitEntityEvent', 'hadEffect', {
            get: (call) => field(call, 'hadEffect') === true
        })
        .implement(SERVER, 'ItemComponentHitEntityEvent', 'itemStack', { get: (call) => item(field(call, 'item')) })
        .implement(SERVER, 'ItemComponentMineBlockEvent', 'source', { get: (call) => entity(field(call, 'source')) })
        .implement(SERVER, 'ItemComponentMineBlockEvent', 'block', { get: (call) => block(field(call, 'block')) })
        .implement(SERVER, 'ItemComponentMineBlockEvent', 'itemStack', { get: (call) => item(field(call, 'item')) })
        .implement(SERVER, 'ItemComponentMineBlockEvent', 'minedBlockPermutation', {
            get: (call) => permutation(field(call, 'minedBlockPermutation'))
        });
};

/**
 * Parses JSON into a value of the calling pack's realm, for a member whose metadata types its
 * value as `unknown`, which the binding passes through as it is.
 */
const parseInEngine = (call: ScriptCall, json: string): ScriptValue => {
    const parse = call.engine.evaluate('JSON.parse');
    if (!(parse instanceof ScriptHandle)) throw new TypeError('JSON.parse is not a function');
    try {
        const parsed = call.engine.call(parse, undefined, json);
        return parsed instanceof ScriptHandle ? call.engine.release(parsed) : parsed;
    } finally {
        call.engine.free(parse);
    }
};

const stringOf = (value: unknown): string | undefined => (typeof value === 'string' ? value : undefined);

/** A permutation's states as JSON gave them back, with any value a state cannot hold left out. */
const statesOf = (states: Readonly<Record<string, unknown>>): Record<string, string | number | boolean> => {
    const kept: Record<string, string | number | boolean> = {};
    for (const [name, value] of Object.entries(states)) {
        if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') kept[name] = value;
    }
    return kept;
};

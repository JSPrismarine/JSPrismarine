/**
 * The `@minecraft/server` members that show a player something or change how an entity is:
 * `Player.onScreenDisplay` and its titles, `Player.playSound` and `Dimension.playSound`,
 * `Dimension.spawnParticle` with a `MolangVariableMap`, and an entity's status effects.
 *
 * Each write goes through the world's own verb, the one `/title`, `/playsound`, `/particle` and
 * `/effect` use. The values and errors follow the `entity-effects` and `player-feedback`
 * scenarios recorded on the pinned Bedrock Dedicated Server.
 */
import { ScriptHostErrors } from '@jsprismarine/errors/script-host';

import { ScriptApiError } from '../errors';
import type { ScriptApiImplementations, ScriptCall } from '../shape/implementations';
import type { ScriptValue } from '../values';
import { ScriptHandle } from '../values';
import { isRecord } from '../isRecord';
import type { PackHost } from './minecraftServer';
import {
    blockPosition,
    COMMON,
    entityKeyOf,
    invalidEntity,
    readMessage,
    SERVER,
    TAG,
    unloadedChunk,
    vectorArgument,
    withNamespace
} from './serverObjects';
import type { ScriptEffect, ScriptEntityState, ScriptTitle, ScriptVector3 } from './world';

/** The bounds of `EntityEffectOptions.amplifier`, as BDS checks them. */
const AMPLIFIER = { min: 0, max: 255 } as const;

/** Effect ids whose English name is not their id in title case. */
const EFFECT_NAMES: Readonly<Record<string, string>> = { 'minecraft:village_hero': 'Hero of the Village' };

const ROMAN: readonly (readonly [number, string])[] = [
    [1000, 'M'],
    [900, 'CM'],
    [500, 'D'],
    [400, 'CD'],
    [100, 'C'],
    [90, 'XC'],
    [50, 'L'],
    [40, 'XL'],
    [10, 'X'],
    [9, 'IX'],
    [5, 'V'],
    [4, 'IV'],
    [1, 'I']
];

const roman = (value: number): string => {
    let left = value;
    let text = '';
    for (const [size, letters] of ROMAN) {
        while (left >= size) {
            text += letters;
            left -= size;
        }
    }
    return text;
};

/**
 * An effect's `displayName` as BDS writes it in English: its name, and the potency in Roman
 * numerals from II up, such as `Slowness III` for amplifier 2.
 */
export const effectDisplayName = ({ typeId, amplifier }: Pick<ScriptEffect, 'typeId' | 'amplifier'>): string => {
    const name =
        EFFECT_NAMES[typeId] ??
        (typeId.slice(typeId.indexOf(':') + 1) || typeId)
            .split('_')
            .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ');
    return amplifier > 0 ? `${name} ${roman(amplifier + 1)}` : name;
};

/** One MoLang variable as `SpawnParticleEffectPacket` carries it. */
interface MolangVariable {
    readonly name: string;
    readonly value: MolangValue;
}

type MolangValue =
    | { readonly type: 'float'; readonly value: number }
    | { readonly type: 'member_array'; readonly value: readonly MolangVariable[] };

const float = (value: number): MolangValue => ({ type: 'float', value });

const members = (parts: Readonly<Record<string, number>>): MolangValue => ({
    type: 'member_array',
    value: Object.entries(parts).map(([name, value]) => ({ name: `.${name}`, value: float(value) }))
});

/** The variables a `MolangVariableMap` object holds. */
const molangOf = (state: string): MolangVariable[] => {
    // The host wrote the state with JSON.stringify.
    const parsed: unknown = state === '' ? [] : JSON.parse(state);
    return Array.isArray(parsed) ? parsed.filter((each): each is MolangVariable => isRecord(each)) : [];
};

/**
 * Reads an interface argument whose properties are all numbers, such as an `RGB`, checking them
 * in BDS's order, which is alphabetical.
 */
const numbersArgument = <Key extends string>(
    call: ScriptCall,
    index: number,
    keys: readonly Key[]
): Record<Key, number> => {
    const json = call.stringify(call.args[index]);
    // The engine wrote the string with JSON.stringify.
    const parsed: unknown = json === undefined ? undefined : JSON.parse(json);
    const read: Partial<Record<Key, number>> = {};
    for (const key of [...keys].sort()) {
        const value = isRecord(parsed) ? parsed[key] : undefined;
        if (typeof value !== 'number') {
            throw new ScriptHostErrors.InterfacePropertyMissing({
                property: key,
                expected: 'number',
                target: `Function argument [${index}]`
            });
        }
        read[key] = value;
    }
    // Every key was read above.
    return read as Record<Key, number>;
};

/** A title's text: a string, a `RawMessage` or a list of them, read as the chat reads one. */
const textOf = (call: ScriptCall, value: ScriptValue): string => readMessage(call.engine, value);

/** An argument that is a number, or the default. */
const numberOr = (value: ScriptValue | undefined, fallback: number): number =>
    typeof value === 'number' ? value : fallback;

/**
 * Registers the screen display, sound, particle and effect members.
 * @param implementations - The pack's implementations, which this adds to.
 * @param host - The pack's view of the runtime and the world.
 */
export const implementFeedback = (implementations: ScriptApiImplementations, host: PackHost): void => {
    const { world } = host;
    /** The entity an object names, now, or BDS's error for one that is gone. */
    const live = (state: string, access: 'get' | 'call', member: string): ScriptEntityState => {
        const entity = world.entity(entityKeyOf(state).id);
        if (entity === undefined) throw invalidEntity(access, member);
        return entity;
    };
    const show = (call: ScriptCall, titles: readonly ScriptTitle[]): void => {
        // BDS names the class rather than the method here, as the `player-feedback` scenario recorded.
        const player = live(call.state, 'call', 'Player');
        for (const title of titles) world.showTitle?.(player.id, title);
    };
    let sounds = 0;
    /** A `SoundInstance` for a sound a script played. */
    const soundInstance = (soundEventId: string, recipient?: string): ScriptHandle =>
        host.engine.release(
            host.create(
                'SoundInstance',
                TAG.soundInstance,
                JSON.stringify({
                    id: String(++sounds),
                    soundEventId,
                    ...(recipient === undefined ? {} : { recipient })
                })
            )
        );
    const soundState = (call: ScriptCall): { id: string; soundEventId: string; recipient?: string } => {
        // The host wrote the state with JSON.stringify.
        const parsed: unknown = JSON.parse(call.state);
        if (!isRecord(parsed) || typeof parsed.id !== 'string' || typeof parsed.soundEventId !== 'string') {
            throw new ScriptHostErrors.ObjectCarriesNoState({ what: 'sound' });
        }
        return {
            id: parsed.id,
            soundEventId: parsed.soundEventId,
            ...(typeof parsed.recipient === 'string' ? { recipient: parsed.recipient } : {})
        };
    };
    /** The volume and pitch of a sound's options, with BDS's error for a negative volume. */
    const soundOptions = (call: ScriptCall, index: number): { volume: number; pitch: number } => {
        const options = call.args[index];
        if (!(options instanceof ScriptHandle)) return { volume: 1, pitch: 1 };
        const read = (key: string): ScriptValue | undefined => {
            const value = call.engine.get(options, key);
            if (value instanceof ScriptHandle) call.engine.free(value);
            return value;
        };
        const volume = numberOr(read('volume'), 1);
        const pitch = numberOr(read('pitch'), 1);
        for (const [name, value] of [
            ['volume', volume],
            ['pitch', pitch]
        ] as const) {
            if (value < 0) {
                throw new ScriptApiError(
                    COMMON,
                    'PropertyOutOfBoundsError',
                    `Unsupported or out of bounds value set on Property: ${name}, Value: ${value}, Property min: 0`,
                    { value, minValue: 0 }
                );
            }
        }
        return { volume, pitch };
    };
    /** The location a sound's options name, when they name one. */
    const optionLocation = (call: ScriptCall, index: number): ScriptVector3 | undefined => {
        const options = call.args[index];
        if (!(options instanceof ScriptHandle)) return undefined;
        const location = call.engine.get(options, 'location');
        if (location === undefined) return undefined;
        if (location instanceof ScriptHandle) call.engine.free(location);
        const json = call.stringify(options);
        // The engine wrote the string with JSON.stringify.
        const parsed: unknown = json === undefined ? undefined : JSON.parse(json);
        const found = isRecord(parsed) ? parsed.location : undefined;
        if (!isRecord(found)) return undefined;
        const { x, y, z } = found;
        return typeof x === 'number' && typeof y === 'number' && typeof z === 'number' ? { x, y, z } : undefined;
    };
    /** An effect type argument, a name or an `EffectType`, with BDS's error for one the world lacks. */
    const effectType = (call: ScriptCall): string => {
        const [type] = call.args;
        const typeId = withNamespace(type instanceof ScriptHandle ? call.stateOf(type) : String(type));
        if (world.isEffectType?.(typeId) !== true) {
            throw new ScriptApiError(
                COMMON,
                'InvalidArgumentError',
                'Invalid type passed to argument [0]. Expected type: effectType',
                { index: 0 }
            );
        }
        return typeId;
    };
    const effectObject = (entity: string, effect: ScriptEffect): ScriptHandle =>
        host.engine.release(host.create('Effect', TAG.effect, JSON.stringify({ entity, ...effect })));
    const effectState = (call: ScriptCall): ScriptEffect => {
        // The host wrote the state with JSON.stringify.
        const parsed: unknown = JSON.parse(call.state);
        if (
            !isRecord(parsed) ||
            typeof parsed.typeId !== 'string' ||
            typeof parsed.amplifier !== 'number' ||
            typeof parsed.duration !== 'number'
        ) {
            throw new ScriptHostErrors.ObjectCarriesNoState({ what: 'effect' });
        }
        return { typeId: parsed.typeId, amplifier: parsed.amplifier, duration: parsed.duration };
    };
    const effectsOf = (call: ScriptCall, member: string): { id: string; effects: readonly ScriptEffect[] } => {
        const entity = live(call.state, 'call', member);
        return { id: entity.id, effects: world.effects?.(entity.id) ?? [] };
    };

    implementations
        .implement(SERVER, 'Player', 'onScreenDisplay', {
            get: (call) => host.instance('ScreenDisplay', TAG.screenDisplay, call.state)
        })
        .implement(SERVER, 'ScreenDisplay', 'isValid', {
            get: (call) => world.entity(entityKeyOf(call.state).id) !== undefined
        })
        .implement(SERVER, 'ScreenDisplay', 'setTitle', (call) => {
            const [title, options] = call.args;
            const titles: ScriptTitle[] = [];
            if (options instanceof ScriptHandle) {
                const read = (key: string): ScriptValue | undefined => {
                    const value = call.engine.get(options, key);
                    if (value instanceof ScriptHandle && key !== 'subtitle') call.engine.free(value);
                    return value;
                };
                const durations = {
                    fadeInDuration: numberOr(read('fadeInDuration'), 10),
                    stayDuration: numberOr(read('stayDuration'), 70),
                    fadeOutDuration: numberOr(read('fadeOutDuration'), 20)
                };
                for (const [name, value] of Object.entries(durations)) {
                    if (value < 0) {
                        throw new ScriptApiError(
                            COMMON,
                            'ArgumentOutOfBoundsError',
                            `Unsupported or out of bounds value passed to function argument [0]: ${name}, Value: ${value}, Argument min: 0`,
                            { index: 0, value, minValue: 0 }
                        );
                    }
                }
                titles.push({
                    kind: 'times',
                    fadeIn: Math.trunc(durations.fadeInDuration),
                    stay: Math.trunc(durations.stayDuration),
                    fadeOut: Math.trunc(durations.fadeOutDuration)
                });
                const subtitle = read('subtitle');
                if (subtitle !== undefined) {
                    titles.push({ kind: 'subtitle', text: textOf(call, subtitle) });
                    if (subtitle instanceof ScriptHandle) call.engine.free(subtitle);
                }
            }
            titles.push({ kind: 'title', text: textOf(call, title ?? '') });
            show(call, titles);
            return undefined;
        })
        .implement(SERVER, 'ScreenDisplay', 'updateSubtitle', (call) => {
            show(call, [{ kind: 'subtitle', text: textOf(call, call.args[0] ?? '') }]);
            return undefined;
        })
        .implement(SERVER, 'ScreenDisplay', 'setActionBar', (call) => {
            show(call, [{ kind: 'actionbar', text: textOf(call, call.args[0] ?? '') }]);
            return undefined;
        })
        .implement(SERVER, 'Player', 'playSound', (call) => {
            const player = live(call.state, 'call', 'playSound');
            const sound = String(call.args[0]);
            const { volume, pitch } = soundOptions(call, 1);
            world.playSound?.({
                sound,
                dimension: player.dimension,
                location: optionLocation(call, 1) ?? player.location,
                volume,
                pitch,
                player: player.id
            });
            return soundInstance(sound, call.state);
        })
        .implement(SERVER, 'Dimension', 'playSound', (call) => {
            const sound = String(call.args[0]);
            const location = vectorArgument(call, 1);
            const { volume, pitch } = soundOptions(call, 2);
            world.playSound?.({ sound, dimension: call.state, location, volume, pitch });
            return soundInstance(sound);
        })
        .implement(SERVER, 'SoundInstance', 'id', { get: (call) => soundState(call).id })
        .implement(SERVER, 'SoundInstance', 'soundEventId', { get: (call) => soundState(call).soundEventId })
        .implement(SERVER, 'SoundInstance', 'recipient', {
            get: (call) => {
                const { recipient } = soundState(call);
                return recipient === undefined ? undefined : host.entity(entityKeyOf(recipient));
            }
        })
        .implement(SERVER, 'MolangVariableMap', 'constructor', () => '[]')
        .implement(SERVER, 'MolangVariableMap', 'setFloat', (call) => {
            setVariable(call, float(numberOr(call.args[1], 0)));
            return undefined;
        })
        .implement(SERVER, 'MolangVariableMap', 'setVector3', (call) => {
            const { x, y, z } = vectorArgument(call, 1);
            setVariable(call, members({ x, y, z }));
            return undefined;
        })
        .implement(SERVER, 'MolangVariableMap', 'setColorRGB', (call) => {
            const { red, green, blue } = numbersArgument(call, 1, ['red', 'green', 'blue']);
            setVariable(call, members({ r: red, g: green, b: blue }));
            return undefined;
        })
        .implement(SERVER, 'MolangVariableMap', 'setColorRGBA', (call) => {
            const { red, green, blue, alpha } = numbersArgument(call, 1, ['red', 'green', 'blue', 'alpha']);
            setVariable(call, members({ r: red, g: green, b: blue, a: alpha }));
            return undefined;
        })
        .implement(SERVER, 'MolangVariableMap', 'setSpeedAndDirection', (call) => {
            const direction = vectorArgument(call, 2);
            setVariable(call, members({ speed: numberOr(call.args[1], 0), ...direction }));
            return undefined;
        })
        .implement(SERVER, 'Dimension', 'spawnParticle', (call) => {
            const effect = String(call.args[0]);
            const location = vectorArgument(call, 1);
            if (world.block(call.state, blockPosition(location)) === undefined) throw unloadedChunk(location);
            const map = call.args[2];
            const variables = map instanceof ScriptHandle ? molangOf(call.stateOf(map)) : [];
            world.spawnParticle?.(
                call.state,
                effect,
                location,
                variables.length === 0 ? undefined : JSON.stringify(variables)
            );
            return undefined;
        })
        .implement(SERVER, 'Entity', 'addEffect', (call) => {
            const typeId = effectType(call);
            const entity = live(call.state, 'call', 'addEffect');
            const [, duration, options] = call.args;
            let amplifier = 0;
            let showParticles = true;
            if (options instanceof ScriptHandle) {
                const read = (key: string): ScriptValue | undefined => {
                    const value = call.engine.get(options, key);
                    if (value instanceof ScriptHandle) call.engine.free(value);
                    return value;
                };
                amplifier = Math.trunc(numberOr(read('amplifier'), 0));
                showParticles = read('showParticles') !== false;
            }
            if (amplifier < AMPLIFIER.min || amplifier > AMPLIFIER.max) {
                throw new ScriptApiError(
                    COMMON,
                    'ArgumentOutOfBoundsError',
                    `Unsupported or out of bounds value passed to function argument [2]: amplifier, Value: ${amplifier}, ` +
                        `Argument bounds: [${AMPLIFIER.min}, ${AMPLIFIER.max}]`,
                    { index: 2, value: amplifier, minValue: AMPLIFIER.min, maxValue: AMPLIFIER.max }
                );
            }
            world.addEffect?.(entity.id, {
                typeId,
                amplifier,
                duration: Math.trunc(numberOr(duration, 1)),
                showParticles
            });
            const now = world.effects?.(entity.id)?.find((each) => each.typeId === typeId);
            return now === undefined ? undefined : effectObject(entity.id, now);
        })
        .implement(SERVER, 'Entity', 'getEffect', (call) => {
            const typeId = effectType(call);
            const { id, effects } = effectsOf(call, 'getEffect');
            const found = effects.find((each) => each.typeId === typeId);
            return found === undefined ? undefined : effectObject(id, found);
        })
        .implement(SERVER, 'Entity', 'getEffects', (call) => {
            const { id, effects } = effectsOf(call, 'getEffects');
            const array = host.engine.evaluate('[]');
            if (!(array instanceof ScriptHandle))
                throw new ScriptHostErrors.LiteralEvaluatedToPrimitive({ kind: 'array' });
            effects.forEach((effect, index) => {
                const made = host.create('Effect', TAG.effect, JSON.stringify({ entity: id, ...effect }));
                host.engine.set(array, String(index), made);
                host.engine.free(made);
            });
            return host.engine.release(array);
        })
        .implement(SERVER, 'Entity', 'removeEffect', (call) => {
            const typeId = effectType(call);
            const entity = live(call.state, 'call', 'removeEffect');
            return world.removeEffect?.(entity.id, typeId) ?? false;
        })
        .implement(SERVER, 'Effect', 'typeId', { get: (call) => effectState(call).typeId })
        .implement(SERVER, 'Effect', 'amplifier', { get: (call) => effectState(call).amplifier })
        .implement(SERVER, 'Effect', 'duration', { get: (call) => effectState(call).duration })
        .implement(SERVER, 'Effect', 'displayName', { get: (call) => effectDisplayName(effectState(call)) })
        .implement(SERVER, 'Effect', 'isValid', {
            get: (call) => {
                // The host wrote the state with JSON.stringify.
                const parsed: unknown = JSON.parse(call.state);
                const entity = isRecord(parsed) && typeof parsed.entity === 'string' ? parsed.entity : '';
                const { typeId } = effectState(call);
                return world.effects?.(entity)?.some((each) => each.typeId === typeId) === true;
            }
        })
        .implement(SERVER, 'EffectTypes', 'get', (call) => {
            const typeId = withNamespace(String(call.args[0]));
            if (world.isEffectType?.(typeId) !== true) return undefined;
            return host.engine.release(host.create('EffectType', TAG.effectType, typeId));
        })
        .implement(SERVER, 'EffectTypes', 'getAll', () => {
            const array = host.engine.evaluate('[]');
            if (!(array instanceof ScriptHandle))
                throw new ScriptHostErrors.LiteralEvaluatedToPrimitive({ kind: 'array' });
            (world.effectTypes?.() ?? []).forEach((typeId, index) => {
                const made = host.create('EffectType', TAG.effectType, typeId);
                host.engine.set(array, String(index), made);
                host.engine.free(made);
            });
            return host.engine.release(array);
        })
        .implement(SERVER, 'EffectType', 'getName', (call) => call.state)
        .implement(SERVER, 'Player', 'spawnParticle', (call) => {
            const player = live(call.state, 'call', 'spawnParticle');
            const effect = String(call.args[0]);
            const location = vectorArgument(call, 1);
            const map = call.args[2];
            const variables = map instanceof ScriptHandle ? molangOf(call.stateOf(map)) : [];
            world.spawnParticle?.(
                player.dimension,
                effect,
                location,
                variables.length === 0 ? undefined : JSON.stringify(variables),
                player.id
            );
            return undefined;
        });
};

/** Sets one variable of a `MolangVariableMap`, replacing one of the same name in its place. */
const setVariable = (call: ScriptCall, value: MolangValue): void => {
    const name = String(call.args[0]);
    const variables = molangOf(call.state);
    const at = variables.findIndex((each) => each.name === name);
    if (at >= 0) variables[at] = { name, value };
    else variables.push({ name, value });
    call.setState(JSON.stringify(variables));
};

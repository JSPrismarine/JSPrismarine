/**
 * The world and system members of `@minecraft/server` that read and write the world's own state:
 * the time of day, the default spawn, the difficulty, cheats and hardcore, music, every game rule,
 * `system`'s script events, `waitTicks`, editor flag and memory tier, and the members of a
 * dimension that describe it rather than its blocks.
 *
 * They reach the world through {@link ScriptWorldSystem}. The values and errors follow the
 * `world-settings` scenario recorded on the pinned Bedrock Dedicated Server.
 *
 * The world and system members still without behavior wait on systems JSPrismarine does not have
 * yet: a playing sound's controls need sound handles (issue #3314), a pack's structures and
 * jigsaw placement need Bedrock's placement (issue #3315), the locator bar and waypoints their
 * packets (issue #3313), the point-of-interest classes an index (issue #3312), and
 * `registerCustomDimension` the level's custom dimensions (issue #3624).
 */
import { ScriptHostErrors } from '@jsprismarine/errors/script-host';

import { ScriptApiError } from '../../errors';
import type { ScriptApiImplementations, ScriptCall } from '../../shape/implementations';
import type { ScriptValue } from '../../values';
import { ScriptHandle } from '../../values';
import type { PackHost } from '../minecraftServer';
import { blockPosition, COMMON, outsideWorld, plainError, SERVER, vectorArgument } from '../serverObjects';
import type { ScriptGameRuleValue } from './gameRules';
import { gameRuleWrite, isScriptGameRule, SCRIPT_GAME_RULES } from './gameRules';
import { memoryWorldSystem } from './memoryWorldSystem';
import type { ScriptDifficulty, ScriptWorldSystem } from './seam';
import { WORLD_TAG } from './tags';

/** The ticks in one Minecraft day. */
export const DAY_TICKS = 24_000;

/** The phases of the moon, one a night, before they repeat. */
const MOON_PHASES = 8;

/** The world's tier as `MemoryTier` numbers it. A dedicated server answers its highest. */
const SERVER_MEMORY_TIER = 4;

/** The remainder of a division that is never negative, as BDS reads a day and a phase. */
const modulo = (value: number, divisor: number): number => ((value % divisor) + divisor) % divisor;

const isGameRuleValue = (value: ScriptValue | undefined): value is ScriptGameRuleValue =>
    typeof value === 'boolean' || typeof value === 'number' || value === 'Everyone' || value === 'Off';

const isDifficulty = (value: ScriptValue | undefined): value is ScriptDifficulty =>
    value === 'Easy' || value === 'Hard' || value === 'Normal' || value === 'Peaceful';

/** The localization key BDS gives each of its own dimensions, by the order it numbers them. */
const DIMENSION_NUMBERS: Readonly<Record<string, number>> = {
    'minecraft:overworld': 0,
    'minecraft:nether': 1,
    'minecraft:the_end': 2
};

/** The id `/scriptevent` and `sendScriptEvent` take: a namespace other than `minecraft`, a colon and a name. */
const namespaceError = (id: string): ScriptApiError | undefined => {
    const colon = id.indexOf(':');
    if (colon <= 0) {
        return new ScriptApiError(
            SERVER,
            'NamespaceNameError',
            `There was an error with name '${id}': string must be prefixed with a namespace (eg. namespace:value).`
        );
    }
    const namespace = id.slice(0, colon);
    if (namespace === 'minecraft') {
        return new ScriptApiError(
            SERVER,
            'NamespaceNameError',
            `There was an error with name '${id}': string has invalid namespace (${namespace}).`
        );
    }
    return undefined;
};

/** Reads a number option of an options argument the binding checked is an object. */
/**
 * The `fade` of a `MusicOptions` argument, 0 when it has none. BDS refuses a negative fade, for
 * `World`'s music and `Player`'s alike.
 * @throws {ScriptApiError} `PropertyOutOfBoundsError` for a fade below 0.
 */
export const musicFadeOf = (call: ScriptCall, index: number): number => {
    const fade = numberOption(call, index, 'fade') ?? 0;
    if (fade < 0) {
        throw new ScriptApiError(
            COMMON,
            'PropertyOutOfBoundsError',
            `Unsupported or out of bounds value set on Property: fade, Value: ${fade}, Property min: 0`,
            { value: fade, minValue: 0 }
        );
    }
    return fade;
};

const numberOption = (call: ScriptCall, index: number, key: string): number | undefined => {
    const options = call.args[index];
    if (!(options instanceof ScriptHandle)) return undefined;
    const value = call.engine.get(options, key);
    if (value instanceof ScriptHandle) call.engine.free(value);
    return typeof value === 'number' ? value : undefined;
};

/** Reads a boolean option of an options argument the binding checked is an object. */
const booleanOption = (call: ScriptCall, index: number, key: string): boolean | undefined => {
    const options = call.args[index];
    if (!(options instanceof ScriptHandle)) return undefined;
    const value = call.engine.get(options, key);
    if (value instanceof ScriptHandle) call.engine.free(value);
    return typeof value === 'boolean' ? value : undefined;
};

/**
 * Makes a pending promise in the calling pack's realm.
 * @returns The promise and its resolve function. The caller frees both.
 */
const pendingPromise = (call: ScriptCall): { promise: ScriptHandle; resolve: ScriptHandle } => {
    const make = call.engine.evaluate(
        '(() => { let resolve; const promise = new Promise((done) => { resolve = () => done(); }); return [promise, resolve]; })()',
        '<jsp waitTicks>'
    );
    if (!(make instanceof ScriptHandle)) throw new ScriptHostErrors.LiteralEvaluatedToPrimitive({ kind: 'array' });
    try {
        const promise = call.engine.get(make, '0');
        const resolve = call.engine.get(make, '1');
        if (!(promise instanceof ScriptHandle) || !(resolve instanceof ScriptHandle)) {
            throw new ScriptHostErrors.LiteralEvaluatedToPrimitive({ kind: 'array' });
        }
        return { promise, resolve };
    } finally {
        call.engine.free(make);
    }
};

/**
 * The world system a pack's members use: the world's own, or one in memory for a world without.
 * The memory one is made once per pack, so the state a pack writes reads back.
 */
export const worldSystemOf = (host: Pick<PackHost, 'world'>): ScriptWorldSystem =>
    host.world.worldSystem ?? fallbackOf(host);

const fallbacks = new WeakMap<PackHost['world'], ScriptWorldSystem>();
const fallbackOf = (host: Pick<PackHost, 'world'>): ScriptWorldSystem => {
    let found = fallbacks.get(host.world);
    if (found === undefined) {
        found = memoryWorldSystem('0', host.world);
        fallbacks.set(host.world, found);
    }
    return found;
};

/**
 * Registers the world's time, spawn, difficulty, music and game rules, `system`'s members, and a
 * dimension's descriptive members.
 * @param implementations - The pack's implementations, which this adds to.
 * @param host - The pack's view of the runtime and the world.
 */
export const implementWorldSettings = (implementations: ScriptApiImplementations, host: PackHost): void => {
    const system = (): ScriptWorldSystem => worldSystemOf(host);
    const time = () => system().absoluteTime();
    const day = () => Math.floor(time() / DAY_TICKS);

    implementations
        .implement(SERVER, 'World', 'getAbsoluteTime', () => time())
        .implement(SERVER, 'World', 'setAbsoluteTime', (call) => {
            system().setAbsoluteTime(Number(call.args[0]));
            return undefined;
        })
        .implement(SERVER, 'World', 'getTimeOfDay', () => modulo(time(), DAY_TICKS))
        .implement(SERVER, 'World', 'setTimeOfDay', (call) => {
            const timeOfDay = Number(call.args[0]);
            if (timeOfDay < 0 || timeOfDay >= DAY_TICKS) {
                throw plainError(`timeOfDay must be between 0 and ${DAY_TICKS - 1} (inclusive).`);
            }
            system().setAbsoluteTime(day() * DAY_TICKS + timeOfDay);
            return undefined;
        })
        .implement(SERVER, 'World', 'getDay', () => day())
        .implement(SERVER, 'World', 'getMoonPhase', () => modulo(day(), MOON_PHASES))
        .implement(SERVER, 'World', 'getDefaultSpawnLocation', () => JSON.stringify(system().defaultSpawn()))
        .implement(SERVER, 'World', 'setDefaultSpawnLocation', (call) => {
            const location = blockPosition(vectorArgument(call, 0));
            const overworld = host.world.dimensions().find((id) => id === 'minecraft:overworld');
            const { min, max } = host.world.heightRange(overworld ?? host.world.dimensions()[0] ?? '');
            if (location.y < min || location.y >= max) {
                const error = outsideWorld(vectorArgument(call, 0));
                throw new ScriptApiError(
                    error.errorModule,
                    error.errorClass,
                    `Failed to set the default spawn location. ${error.message}`
                );
            }
            system().setDefaultSpawn(location);
            return undefined;
        })
        .implement(SERVER, 'World', 'getDifficulty', () => system().difficulty())
        .implement(SERVER, 'World', 'setDifficulty', (call) => {
            const [difficulty] = call.args;
            if (!isDifficulty(difficulty)) {
                throw new ScriptHostErrors.ArgumentConversionFailed({ index: 0, expected: 'Difficulty' });
            }
            system().setDifficulty(difficulty);
            return undefined;
        })
        .implement(SERVER, 'World', 'isHardcore', { get: () => system().isHardcore() })
        .implement(SERVER, 'World', 'seed', { get: () => system().seed() })
        .implement(SERVER, 'World', 'allowCheats', {
            get: () => system().allowCheats(),
            set: (call) => system().setAllowCheats(call.args[0] === true)
        })
        // JSPrismarine has no pack settings screen, so every pack reads none set.
        .implement(SERVER, 'World', 'getPackSettings', () => '{}')
        // A client message goes to the clients' scripts, which a Bedrock client runs only in the editor.
        .implement(SERVER, 'World', 'broadcastClientMessage', () => undefined);

    for (const [member, queue] of [
        ['playMusic', false],
        ['queueMusic', true]
    ] as const) {
        implementations.implement(SERVER, 'World', member, (call) => {
            const fade = musicFadeOf(call, 1);
            system().playMusic({
                track: String(call.args[0]),
                volume: numberOption(call, 1, 'volume') ?? 1,
                fade,
                loop: booleanOption(call, 1, 'loop') ?? false,
                queue
            });
            return undefined;
        });
    }
    implementations.implement(SERVER, 'World', 'stopMusic', () => {
        system().stopMusic();
        return undefined;
    });

    for (const name of Object.keys(SCRIPT_GAME_RULES).filter(isScriptGameRule)) {
        implementations.implement(SERVER, 'GameRules', name, {
            get: () => system().gameRule(name),
            set: (call) => {
                const [value] = call.args;
                // The binding checked the value against the rule's type.
                if (!isGameRuleValue(value)) return;
                const kept = gameRuleWrite(name, value);
                if (kept !== undefined) system().setGameRule(name, kept);
            }
        });
    }

    implementations
        .implement(SERVER, 'System', 'isEditorWorld', { get: () => false })
        .implement(SERVER, 'System', 'serverSystemInfo', {
            get: () => host.instance('SystemInfo', WORLD_TAG.systemInfo)
        })
        .implement(SERVER, 'SystemInfo', 'memoryTier', { get: () => SERVER_MEMORY_TIER })
        .implement(SERVER, 'System', 'sendScriptEvent', (call) => {
            const id = String(call.args[0]);
            const refused = namespaceError(id);
            if (refused !== undefined) throw refused;
            const source = host.world.dimensions()[0] ?? 'minecraft:overworld';
            host.world.runCommand(`scriptevent ${id} ${String(call.args[1])}`, { dimension: source });
            return undefined;
        })
        .implement(SERVER, 'System', 'waitTicks', (call) => {
            const ticks = Number(call.args[0]);
            const { promise, resolve } = pendingPromise(call);
            try {
                if (ticks <= 0) call.engine.call(resolve, undefined);
                else host.schedule('timeout', resolve, ticks);
            } finally {
                call.engine.free(resolve);
            }
            return call.engine.release(promise);
        });

    implementations
        .implement(SERVER, 'Dimension', 'heightRange', {
            get: (call) => {
                const { min, max } = host.world.heightRange(call.state);
                return JSON.stringify({ max, min });
            }
        })
        .implement(SERVER, 'Dimension', 'localizationKey', {
            get: (call) =>
                `dimension.dimensionName${DIMENSION_NUMBERS[call.state] ?? host.world.dimensions().indexOf(call.state)}`
        })
        .implement(SERVER, 'Dimension', 'getWeather', (call) => host.world.weather(call.state))
        // Points of interest sit behind a runtime condition the pinned BDS leaves off, so the
        // manager and its classes are out of reach there too, as the `world-pending` scenario
        // recorded. JSPrismarine keeps no index of them yet (issue #3312).
        .implement(SERVER, 'Dimension', 'poiManager', {
            get: () => {
                throw new ScriptApiError(
                    COMMON,
                    'RuntimeConditionError',
                    'Dimension::poiManager is missing these runtime conditions: Poi'
                );
            }
        })
        .implement(SERVER, 'Dimension', 'isChunkLoaded', (call) => {
            const { x, z } = vectorArgument(call, 0);
            const { min } = host.world.heightRange(call.state);
            return host.world.block(call.state, { x: Math.floor(x), y: min, z: Math.floor(z) }) !== undefined;
        })
        .implement(SERVER, 'Dimension', 'stopSound', (call) => {
            system().stopSound(call.state, String(call.args[0]));
            return undefined;
        })
        .implement(SERVER, 'Dimension', 'stopAllSounds', (call) => {
            system().stopSound(call.state);
            return undefined;
        });
};

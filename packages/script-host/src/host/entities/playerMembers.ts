/**
 * The `@minecraft/server` members of `Player` beyond `serverEntities.ts`'s and
 * `serverFeedback.ts`'s: experience, the spawn point, permission levels, the camera, the HUD's
 * elements, input permissions and input, the client's system info, aim assist, item cooldowns,
 * the control scheme, chat name decorations, music, sounds and property overrides; and the plain
 * classes beside them, `EntityHealSource`, the entity loot conditions and the entity waypoints.
 *
 * What a script sets that only its own reads and the player's client see, such as the hidden HUD
 * elements or the input locks, lives here per world, so every pack of a world reads the same, and
 * goes to the client through {@link ScriptEntitySystems.sendClient}. The values and errors follow
 * the `entity-values` scenario recorded on the pinned Bedrock Dedicated Server.
 */
import { ScriptHostErrors } from '@jsprismarine/errors/script-host';

import { ScriptApiError } from '../../errors';
import { isRecord } from '../../isRecord';
import type { ScriptApiImplementations, ScriptCall } from '../../shape/implementations';
import type { ScriptValue } from '../../values';
import { ScriptHandle } from '../../values';
import type { PackHost } from '../minecraftServer';
import { COMMON, entityKeyOf, invalidEntity, itemOf, plainError, SERVER, TAG } from '../serverObjects';
import type { ScriptVector3 } from '../world';
import { musicFadeOf } from '../worldsystem/serverWorld';
import { aimAssistPresetExists } from './aimAssist';
import { ENTITY_AREA_TAG } from './components';
import { entityArgument, optionsOf } from './entityMembers';
import type {
    ScriptCameraInstruction,
    ScriptClientMessage,
    ScriptEntitySystems,
    ScriptExperience,
    ScriptSplineKeyFrame
} from './world';

/** Points one more level costs at a level: Bedrock's curve, which BDS's `addExperience` follows. */
export const pointsForNextLevel = (level: number): number => {
    if (level >= 30) return 9 * level - 158;
    if (level >= 15) return 5 * level - 38;
    return 2 * level + 7;
};

/** The points a player has earned to reach a level from 0. */
export const pointsToReach = (level: number): number => {
    let total = 0;
    for (let each = 0; each < level; each++) total += pointsForNextLevel(each);
    return total;
};

/** The points earned toward the next level, as a whole number. */
export const pointsAtLevel = ({ level, progress }: ScriptExperience): number =>
    Math.round(progress * pointsForNextLevel(level));

/** Experience after adding points, carrying into and out of levels, never below 0. */
export const addPoints = (experience: ScriptExperience, points: number): ScriptExperience => {
    let level = experience.level;
    let carried = pointsAtLevel(experience) + points;
    while (carried < 0 && level > 0) {
        level -= 1;
        carried += pointsForNextLevel(level);
    }
    if (carried < 0) return { level: 0, progress: 0 };
    while (carried >= pointsForNextLevel(level)) {
        carried -= pointsForNextLevel(level);
        level += 1;
    }
    return { level, progress: carried / pointsForNextLevel(level) };
};

/**
 * Experience after adding levels: the bar keeps its share of the way to the next level, and a
 * level below 0 is 0 with an empty bar, as the `entity-values` scenario recorded.
 */
export const addLevels = (experience: ScriptExperience, levels: number): ScriptExperience => {
    const level = experience.level + levels;
    return level <= 0 && levels < 0
        ? { level: 0, progress: 0 }
        : { level: Math.max(0, level), progress: experience.progress };
};

/** The camera presets Bedrock ships, which `setCamera` takes by id. */
const CAMERA_PRESETS: ReadonlySet<string> = new Set([
    'minecraft:first_person',
    'minecraft:third_person',
    'minecraft:third_person_front',
    'minecraft:free',
    'minecraft:follow_orbit',
    'minecraft:fixed_boom',
    'minecraft:control_scheme_camera'
]);

/** The control scheme a player has until a script sets one. */
const DEFAULT_CONTROL_SCHEME = 'LockedPlayerRelativeStrafe';

/** Every `HudElement`, by its number. */
const HUD_ELEMENTS = Array.from({ length: 13 }, (_, index) => index);

/** The largest camera shake intensity BDS takes. */
const MAX_SHAKE = 4;

/** What a script set on a player that its reads and the client see. */
interface PlayerScriptState {
    readonly hidden: Set<number>;
    readonly locked: Set<number>;
    /** Each cooldown category's last tick. */
    readonly cooldowns: Map<string, number>;
    camera: string;
    controlScheme: string;
    namePrefix?: string;
    nameSuffix?: string;
    messagePrefix?: string;
    aimAssist?: Readonly<Record<string, unknown>>;
}

const playerStates = new WeakMap<object, Map<string, PlayerScriptState>>();

/**
 * Registers the player members.
 * @param implementations - The pack's implementations, which this adds to.
 * @param host - The pack's view of the runtime and the world.
 */
export const implementPlayerMembers = (implementations: ScriptApiImplementations, host: PackHost): void => {
    const { world } = host;
    const systems = (): ScriptEntitySystems | undefined => world.entitySystems;
    const stateOf = (id: string): PlayerScriptState => {
        const all = playerStates.get(world) ?? new Map<string, PlayerScriptState>();
        playerStates.set(world, all);
        const found = all.get(id) ?? {
            hidden: new Set<number>(),
            locked: new Set<number>(),
            cooldowns: new Map<string, number>(),
            camera: 'minecraft:first_person',
            controlScheme: DEFAULT_CONTROL_SCHEME
        };
        all.set(id, found);
        return found;
    };
    /** The player's id, or BDS's error once they are gone. */
    const live = (call: ScriptCall, access: 'get' | 'set' | 'call', member: string): string => {
        const key = entityKeyOf(call.state);
        if (world.entity(key.id) === undefined) throw invalidEntity(access, member, key);
        return key.id;
    };
    /** The player's id, or BDS's plain error for a member of a player who is gone. */
    const present = (call: ScriptCall, access: 'get' | 'call', member: string): string => {
        const { id } = entityKeyOf(call.state);
        if (world.entity(id) === undefined) {
            throw plainError(`Failed to ${access === 'get' ? 'get property' : 'call function'} '${member}'.`);
        }
        return id;
    };
    const send = (id: string, message: ScriptClientMessage): void => systems()?.sendClient(id, message);
    const experienceOf = (
        call: ScriptCall,
        access: 'get' | 'call',
        member: string
    ): { id: string; experience: ScriptExperience } => {
        const id = present(call, access, member);
        return { id, experience: systems()?.experience(id) ?? { level: 0, progress: 0 } };
    };
    const writeExperience = (id: string, experience: ScriptExperience): void =>
        systems()?.setExperience(id, experience);
    const sub = (className: string, tag: number) => ({
        get: (call: ScriptCall) => {
            present(call, 'get', className);
            return host.instance(className, tag, call.state);
        }
    });

    implementations
        .implement(SERVER, 'Player', 'level', { get: (call) => experienceOf(call, 'get', 'level').experience.level })
        .implement(SERVER, 'Player', 'xpEarnedAtCurrentLevel', {
            get: (call) => pointsAtLevel(experienceOf(call, 'get', 'xpEarnedAtCurrentLevel').experience)
        })
        .implement(SERVER, 'Player', 'totalXpNeededForNextLevel', {
            get: (call) => pointsForNextLevel(experienceOf(call, 'get', 'totalXpNeededForNextLevel').experience.level)
        })
        .implement(SERVER, 'Player', 'getTotalXp', (call) => {
            const { experience } = experienceOf(call, 'call', 'getTotalXp');
            return pointsToReach(experience.level) + pointsAtLevel(experience);
        })
        .implement(SERVER, 'Player', 'addExperience', (call) => {
            const { id, experience } = experienceOf(call, 'call', 'addExperience');
            const after = addPoints(experience, Math.trunc(Number(call.args[0])));
            writeExperience(id, after);
            return pointsToReach(after.level) + pointsAtLevel(after);
        })
        .implement(SERVER, 'Player', 'addLevels', (call) => {
            const { id, experience } = experienceOf(call, 'call', 'addLevels');
            const after = addLevels(experience, Math.trunc(Number(call.args[0])));
            writeExperience(id, after);
            return after.level;
        })
        .implement(SERVER, 'Player', 'resetLevel', (call) => {
            writeExperience(present(call, 'call', 'resetLevel'), { level: 0, progress: 0 });
            return undefined;
        })
        .implement(SERVER, 'Player', 'getSpawnPoint', (call) => {
            const point = systems()?.spawnPoint(present(call, 'call', 'getSpawnPoint'));
            if (point === undefined) return undefined;
            const result = host.engine.evaluate(`(${JSON.stringify({ x: point.x, y: point.y, z: point.z })})`);
            if (!(result instanceof ScriptHandle))
                throw new ScriptHostErrors.LiteralEvaluatedToPrimitive({ kind: 'object' });
            host.engine.set(result, 'dimension', host.instance('Dimension', TAG.dimension, point.dimension));
            return host.engine.release(result);
        })
        .implement(SERVER, 'Player', 'setSpawnPoint', (call) => {
            const id = present(call, 'call', 'setSpawnPoint');
            const point = call.args[0];
            if (!(point instanceof ScriptHandle)) {
                systems()?.setSpawnPoint(id, undefined);
                return undefined;
            }
            const dimensionValue = call.engine.get(point, 'dimension');
            const dimension = call.stateOf(dimensionValue ?? null);
            if (dimensionValue instanceof ScriptHandle) call.engine.free(dimensionValue);
            const read = (axis: string) => Number(call.engine.get(point, axis));
            const location: ScriptVector3 = { x: read('x'), y: read('y'), z: read('z') };
            const range = world.heightRange(dimension);
            if (location.y < range.min || location.y >= range.max) {
                const text = `(${location.x.toFixed(1)}, ${location.y.toFixed(1)}, ${location.z.toFixed(1)})`;
                throw new ScriptApiError(
                    SERVER,
                    'LocationOutOfWorldBoundariesError',
                    `Failed to set the player spawn location. Trying to access location ${text} which is outside of the world boundaries.`
                );
            }
            systems()?.setSpawnPoint(id, { dimension, ...location });
            return undefined;
        })
        .implement(SERVER, 'Player', 'commandPermissionLevel', {
            get: (call) => systems()?.permissions(present(call, 'get', 'commandPermissionLevel'))?.command ?? 0,
            set: (call) => {
                const id = present(call, 'get', 'commandPermissionLevel');
                systems()?.setCommandPermissionLevel(id, Math.trunc(Number(call.args[0])));
            }
        })
        .implement(SERVER, 'Player', 'playerPermissionLevel', {
            get: (call) => systems()?.permissions(present(call, 'get', 'playerPermissionLevel'))?.player ?? 1
        });

    const status = (call: ScriptCall, member: string) => {
        const key = entityKeyOf(call.state);
        const found = systems()?.status(key.id);
        if (found === undefined) throw invalidEntity('get', member, key);
        return found;
    };
    implementations
        .implement(SERVER, 'Player', 'isFlying', { get: (call) => status(call, 'isFlying').flying === true })
        .implement(SERVER, 'Player', 'isGliding', { get: (call) => status(call, 'isGliding').gliding === true })
        .implement(SERVER, 'Player', 'isJumping', { get: (call) => status(call, 'isJumping').jumping === true })
        .implement(SERVER, 'Player', 'isEmoting', { get: (call) => status(call, 'isEmoting').emoting === true });

    const client = (call: ScriptCall, access: 'get' | 'call', member: string) => {
        const id = present(call, access, member);
        const info = systems()?.clientInfo(id);
        if (info === undefined)
            throw plainError(`Failed to ${access === 'get' ? 'get property' : 'call function'} '${member}'.`);
        return { id, info };
    };
    implementations
        .implement(SERVER, 'Player', 'clientSystemInfo', sub('ClientSystemInfo', ENTITY_AREA_TAG.clientSystemInfo))
        .implement(SERVER, 'ClientSystemInfo', 'locale', { get: (call) => client(call, 'get', 'locale').info.locale })
        .implement(SERVER, 'ClientSystemInfo', 'maxRenderDistance', {
            get: (call) => client(call, 'get', 'maxRenderDistance').info.maxRenderDistance
        })
        .implement(SERVER, 'ClientSystemInfo', 'platformType', {
            get: (call) => client(call, 'get', 'platformType').info.platformType
        })
        .implement(SERVER, 'Player', 'graphicsMode', {
            get: (call) => client(call, 'get', 'graphicsMode').info.graphicsMode
        })
        .implement(SERVER, 'Player', 'persistentId', {
            get: (call) => client(call, 'get', 'persistentId').info.persistentId
        })
        .implement(SERVER, 'Player', 'getPing', (call) => {
            const { info } = client(call, 'call', 'getPing');
            // A player with no client has no round trip; BDS throws its engine error, as the `entity-values` scenario recorded.
            if (info.ping === undefined)
                throw new ScriptApiError(COMMON, 'EngineError', 'An internal engine error occurred.');
            return info.ping;
        })
        .implement(
            SERVER,
            'Player',
            'getSplitScreenSlot',
            (call) => client(call, 'call', 'getSplitScreenSlot').info.splitScreenSlot
        )
        .implement(SERVER, 'Player', 'inputInfo', sub('InputInfo', ENTITY_AREA_TAG.inputInfo))
        .implement(SERVER, 'InputInfo', 'lastInputModeUsed', {
            get: (call) => client(call, 'get', 'lastInputModeUsed').info.inputMode
        })
        .implement(SERVER, 'InputInfo', 'touchOnlyAffectsHotbar', {
            get: (call) => client(call, 'get', 'touchOnlyAffectsHotbar').info.touchOnlyAffectsHotbar
        })
        .implement(SERVER, 'InputInfo', 'getMovementVector', (call) => {
            const key = entityKeyOf(call.state);
            const info = systems()?.clientInfo(key.id);
            if (info === undefined) throw invalidEntity('call', 'getMovementVector', key);
            return JSON.stringify(info.movement);
        })
        .implement(SERVER, 'InputInfo', 'getButtonState', (call) => {
            const key = entityKeyOf(call.state);
            const info = systems()?.clientInfo(key.id);
            if (info === undefined) throw invalidEntity('call', 'getButtonState', key);
            const pressed = call.args[0] === 'Jump' ? info.jump : info.sneak;
            return pressed ? 'Pressed' : 'Released';
        });

    implementations
        .implement(
            SERVER,
            'Player',
            'inputPermissions',
            sub('PlayerInputPermissions', ENTITY_AREA_TAG.inputPermissions)
        )
        .implement(SERVER, 'PlayerInputPermissions', 'isPermissionCategoryEnabled', (call) => {
            const id = present(call, 'call', 'isPermissionCategoryEnabled');
            return !stateOf(id).locked.has(Number(call.args[0]));
        })
        .implement(SERVER, 'PlayerInputPermissions', 'setPermissionCategory', (call) => {
            const id = present(call, 'call', 'setPermissionCategory');
            const { locked } = stateOf(id);
            const category = Number(call.args[0]);
            if (call.args[1] === true) locked.delete(category);
            else locked.add(category);
            send(id, { kind: 'inputLocks', locked: [...locked].sort((a, b) => a - b) });
            return undefined;
        });

    const hud = (call: ScriptCall, member: string) => {
        const id = live(call, 'call', member);
        return { id, hidden: stateOf(id).hidden };
    };
    const sendHud = (id: string, hidden: ReadonlySet<number>): void =>
        send(id, {
            kind: 'hud',
            hidden: HUD_ELEMENTS.filter((element) => hidden.has(element)),
            visible: HUD_ELEMENTS.filter((element) => !hidden.has(element))
        });
    const elementsOf = (call: ScriptCall, index: number): readonly number[] => {
        const value = call.args[index];
        if (value === undefined || value === null) return HUD_ELEMENTS;
        const json = call.stringify(value);
        // The engine wrote the string with JSON.stringify, and the binding checked it is a list of numbers.
        const parsed: unknown = json === undefined ? [] : JSON.parse(json);
        return Array.isArray(parsed) ? parsed.filter((each) => typeof each === 'number') : [];
    };
    implementations
        .implement(SERVER, 'ScreenDisplay', 'getHiddenHudElements', (call) =>
            JSON.stringify([...hud(call, 'getHiddenHudElements').hidden].sort((a, b) => a - b))
        )
        .implement(SERVER, 'ScreenDisplay', 'isForcedHidden', (call) =>
            hud(call, 'isForcedHidden').hidden.has(Number(call.args[0]))
        )
        .implement(SERVER, 'ScreenDisplay', 'setHudVisibility', (call) => {
            const { id, hidden } = hud(call, 'setHudVisibility');
            const hide = call.args[0] === 0;
            for (const element of elementsOf(call, 1)) {
                if (hide) hidden.add(element);
                else hidden.delete(element);
            }
            sendHud(id, hidden);
            return undefined;
        })
        .implement(SERVER, 'ScreenDisplay', 'hideAllExcept', (call) => {
            const { id, hidden } = hud(call, 'hideAllExcept');
            const kept = call.args[0] === undefined || call.args[0] === null ? [] : elementsOf(call, 0);
            hidden.clear();
            for (const element of HUD_ELEMENTS) if (!kept.includes(element)) hidden.add(element);
            sendHud(id, hidden);
            return undefined;
        })
        .implement(SERVER, 'ScreenDisplay', 'resetHudElementsVisibility', (call) => {
            const { id, hidden } = hud(call, 'resetHudElementsVisibility');
            hidden.clear();
            sendHud(id, hidden);
            return undefined;
        });

    implementCamera(implementations, host, { stateOf, send, present });
    implementSplines(implementations);

    implementations
        .implement(SERVER, 'Player', 'getItemCooldown', (call) => {
            const id = present(call, 'call', 'getItemCooldown');
            const end = stateOf(id).cooldowns.get(String(call.args[0]));
            return end === undefined ? 0 : Math.max(0, end - host.currentTick());
        })
        .implement(SERVER, 'Player', 'startItemCooldown', (call) => {
            const id = present(call, 'call', 'startItemCooldown');
            const category = String(call.args[0]);
            const ticks = Math.max(0, Math.trunc(Number(call.args[1])));
            stateOf(id).cooldowns.set(category, host.currentTick() + ticks);
            send(id, { kind: 'cooldown', category, ticks });
            return undefined;
        })
        .implement(
            SERVER,
            'Player',
            'getControlScheme',
            (call) => stateOf(live(call, 'call', 'getControlScheme')).controlScheme
        )
        .implement(SERVER, 'Player', 'setControlScheme', (call) => {
            const id = live(call, 'call', 'setControlScheme');
            const state = stateOf(id);
            const scheme = typeof call.args[0] === 'string' ? call.args[0] : DEFAULT_CONTROL_SCHEME;
            // A first-person camera allows only the locked scheme, as the `entity-values` scenario recorded.
            if (state.camera === 'minecraft:first_person' && scheme !== DEFAULT_CONTROL_SCHEME) {
                throw new ScriptApiError(
                    COMMON,
                    'InvalidArgumentError',
                    `Invalid value passed to argument [0]. Control Scheme '${scheme}' is not allowed for current camera: [${state.camera}]`,
                    { index: 0 }
                );
            }
            state.controlScheme = scheme;
            send(id, { kind: 'controlScheme', scheme });
            return undefined;
        });

    const chat = (
        member: 'namePrefix' | 'nameSuffix' | 'messagePrefix',
        name: 'chatNamePrefix' | 'chatNameSuffix' | 'chatMessagePrefix'
    ) =>
        implementations.implement(SERVER, 'Player', name, {
            get: (call) => stateOf(present(call, 'get', name))[member],
            set: (call) => {
                const value = call.args[0];
                const state = stateOf(present(call, 'get', name));
                if (typeof value === 'string') state[member] = value;
                else delete state[member];
            }
        });
    chat('namePrefix', 'chatNamePrefix');
    chat('nameSuffix', 'chatNameSuffix');
    chat('messagePrefix', 'chatMessagePrefix');
    implementations.implement(SERVER, 'Player', 'chatDisplayName', {
        get: (call) => {
            const id = present(call, 'get', 'chatDisplayName');
            const player = world.entity(id);
            const state = stateOf(id);
            return `${state.namePrefix ?? ''}${player?.name ?? player?.nameTag ?? ''}${state.nameSuffix ?? ''}`;
        }
    });

    const music = (action: 'play' | 'queue') => (call: ScriptCall) => {
        const id = present(call, 'call', action === 'play' ? 'playMusic' : 'queueMusic');
        const options = optionsOf(call, 1);
        send(id, {
            kind: 'music',
            action,
            track: String(call.args[0]),
            volume: typeof options.volume === 'number' ? options.volume : 1,
            fade: musicFadeOf(call, 1),
            loop: options.loop === true
        });
        return undefined;
    };
    implementations
        .implement(SERVER, 'Player', 'playMusic', music('play'))
        .implement(SERVER, 'Player', 'queueMusic', music('queue'))
        .implement(SERVER, 'Player', 'stopMusic', (call) => {
            send(present(call, 'call', 'stopMusic'), { kind: 'music', action: 'stop' });
            return undefined;
        })
        .implement(SERVER, 'Player', 'stopSound', (call) => {
            send(live(call, 'call', 'stopSound'), { kind: 'stopSound', sound: String(call.args[0]) });
            return undefined;
        })
        .implement(SERVER, 'Player', 'stopAllSounds', (call) => {
            send(live(call, 'call', 'stopAllSounds'), { kind: 'stopSound' });
            return undefined;
        })
        .implement(SERVER, 'Player', 'postClientMessage', (call) => {
            send(present(call, 'call', 'postClientMessage'), {
                kind: 'scriptMessage',
                id: String(call.args[0]),
                value: String(call.args[1])
            });
            return undefined;
        })
        .implement(SERVER, 'Player', 'eatItem', (call) => {
            const id = present(call, 'call', 'eatItem');
            const stack = call.args[0];
            if (stack instanceof ScriptHandle) systems()?.eat(id, itemOf(call.stateOf(stack)).typeId);
            return undefined;
        });

    const override = (call: ScriptCall, member: string, property?: string, value?: ScriptValue) => {
        const id = present(call, 'call', member);
        const target = call.args[0];
        const entity =
            typeof target === 'string'
                ? target
                : target instanceof ScriptHandle
                  ? entityKeyOf(call.stateOf(target)).id
                  : '';
        send(id, {
            kind: 'propertyOverride',
            entity,
            property: property ?? '',
            ...(typeof value === 'number' || typeof value === 'boolean' || typeof value === 'string' ? { value } : {})
        });
        return undefined;
    };
    implementations
        .implement(SERVER, 'Player', 'setPropertyOverrideForEntity', (call) =>
            override(call, 'setPropertyOverrideForEntity', String(call.args[1]), call.args[2])
        )
        .implement(SERVER, 'Player', 'removePropertyOverrideForEntity', (call) =>
            override(call, 'removePropertyOverrideForEntity', String(call.args[1]))
        )
        .implement(SERVER, 'Player', 'clearPropertyOverridesForEntity', (call) =>
            override(call, 'clearPropertyOverridesForEntity')
        );

    implementations
        .implement(SERVER, 'Player', 'getAimAssist', (call) => {
            present(call, 'call', 'getAimAssist');
            return host.engine.release(host.create('PlayerAimAssist', ENTITY_AREA_TAG.playerAimAssist, call.state));
        })
        .implement(SERVER, 'PlayerAimAssist', 'settings', {
            get: (call) => {
                const settings = stateOf(present(call, 'get', 'settings')).aimAssist;
                return settings === undefined ? undefined : JSON.stringify(settings);
            }
        })
        .implement(SERVER, 'PlayerAimAssist', 'set', (call) => {
            const id = live(call, 'call', 'set');
            const state = stateOf(id);
            const options = call.args[0] === undefined || call.args[0] === null ? undefined : optionsOf(call, 0);
            if (options === undefined) {
                delete state.aimAssist;
                send(id, { kind: 'aimAssist', targetMode: 'Angle', viewAngle: { x: 50, y: 50 }, distance: 8 });
                return undefined;
            }
            const presetId = String(options.presetId);
            if (!aimAssistPresetExists(host, presetId)) {
                throw new ScriptApiError(
                    COMMON,
                    'InvalidArgumentError',
                    `Invalid value passed to argument [0]. Invalid provided value to argument '${presetId}'.`,
                    { index: 0 }
                );
            }
            const viewAngle = isRecord(options.viewAngle) ? options.viewAngle : { x: 50, y: 50 };
            const settings = {
                distance: typeof options.distance === 'number' ? options.distance : 8,
                presetId,
                targetMode: options.targetMode === 'Distance' ? 'Distance' : 'Angle',
                viewAngle: { x: Number(viewAngle.x ?? 50), y: Number(viewAngle.y ?? 50) }
            } as const;
            state.aimAssist = settings;
            send(id, { kind: 'aimAssist', preset: presetId, ...settings });
            return undefined;
        });

    implementations
        .implement(SERVER, 'Player', 'fogSettings', sub('FogSettings', ENTITY_AREA_TAG.fogSettings))
        .implement(SERVER, 'Player', 'locatorBar', sub('LocatorBar', ENTITY_AREA_TAG.locatorBar));

    implementReferences(implementations, host);
};

/** The camera's members, which send the player's client camera instructions. */
/** The fewest control points BDS plays each spline type with. */
const SPLINE_POINTS = { linear: 2, catmullRom: 3 } as const;

/** A `LinearSpline` or `CatmullRomSpline` as its state holds it. */
interface SplineState {
    readonly type: keyof typeof SPLINE_POINTS;
    readonly points: readonly ScriptVector3[];
}

const isVector = (value: unknown): value is ScriptVector3 =>
    isRecord(value) && typeof value.x === 'number' && typeof value.y === 'number' && typeof value.z === 'number';

/** A spline's state, read back; a value that is not a spline reads as a linear one with no points. */
const splineOf = (state: string): SplineState => {
    // The spline's own members wrote the state with JSON.stringify.
    const parsed: unknown = state === '' ? undefined : JSON.parse(state);
    if (!isRecord(parsed)) return { type: 'linear', points: [] };
    return {
        type: parsed.type === 'catmullRom' ? 'catmullRom' : 'linear',
        points: Array.isArray(parsed.points) ? parsed.points.filter(isVector) : []
    };
};

/** `LinearSpline` and `CatmullRomSpline`: a list of control points `Camera.playAnimation` reads. */
const implementSplines = (implementations: ScriptApiImplementations): void => {
    for (const [owner, type] of [
        ['LinearSpline', 'linear'],
        ['CatmullRomSpline', 'catmullRom']
    ] as const) {
        implementations
            .implement(SERVER, owner, 'constructor', () => JSON.stringify({ type, points: [] }))
            .implement(SERVER, owner, 'controlPoints', {
                // A spline keeps the points a camera animation reads, though BDS reads back none.
                get: () => '[]',
                set: (call) => {
                    const json = call.stringify(call.args[0]);
                    // The engine wrote the string with JSON.stringify.
                    const parsed: unknown = json === undefined ? [] : JSON.parse(json);
                    const points = Array.isArray(parsed)
                        ? parsed.filter(isVector).map(({ x, y, z }) => ({ x, y, z }))
                        : [];
                    call.setState(JSON.stringify({ type, points }));
                }
            });
    }
};

const implementCamera = (
    implementations: ScriptApiImplementations,
    host: PackHost,
    {
        stateOf,
        send,
        present
    }: {
        readonly stateOf: (id: string) => PlayerScriptState;
        readonly send: (id: string, message: ScriptClientMessage) => void;
        readonly present: (call: ScriptCall, access: 'get' | 'call', member: string) => string;
    }
): void => {
    const { world } = host;
    const camera = (id: string, instruction: ScriptCameraInstruction) => send(id, { kind: 'camera', instruction });
    const vector = (value: unknown): ScriptVector3 | undefined =>
        isVector(value) ? { x: value.x, y: value.y, z: value.z } : undefined;
    const ease = (value: unknown) =>
        isRecord(value)
            ? {
                  time: typeof value.easeTime === 'number' ? value.easeTime : 1,
                  type: typeof value.easeType === 'string' ? value.easeType : 'Linear'
              }
            : undefined;
    /** A `progressKeyFrames` or `rotationKeyFrames` list, keeping the frames whose value reads. */
    const keyFrames = <Value>(
        frames: unknown,
        key: string,
        read: (value: unknown) => Value | undefined
    ): ScriptSplineKeyFrame<Value>[] =>
        (Array.isArray(frames) ? frames : []).flatMap((frame) => {
            if (!isRecord(frame)) return [];
            const value = read(frame[key]);
            if (value === undefined) return [];
            return [
                {
                    value,
                    time: typeof frame.timeSeconds === 'number' ? frame.timeSeconds : 0,
                    ...(typeof frame.easingFunc === 'string' ? { easing: frame.easingFunc } : {})
                }
            ];
        });
    const presetArgument = (call: ScriptCall): string => {
        const preset = String(call.args[0]);
        if (!CAMERA_PRESETS.has(preset)) throw plainError('Invalid camera preset.');
        return preset;
    };
    const setCamera = (call: ScriptCall, member: string, isDefault: boolean, easeOptions?: unknown) => {
        const id = present(call, 'call', member);
        const preset = presetArgument(call);
        const options = optionsOf(call, 1);
        const facing = options.facingEntity !== undefined ? entityArgumentOf(call, 1, 'facingEntity') : undefined;
        const location = vector(options.location);
        const rotation = isRecord(options.rotation)
            ? { x: Number(options.rotation.x), y: Number(options.rotation.y) }
            : undefined;
        const facingLocation = vector(options.facingLocation);
        const eased = ease(easeOptions ?? options.easeOptions);
        stateOf(id).camera = preset;
        camera(id, {
            kind: 'set',
            preset,
            ...(location === undefined ? {} : { location }),
            ...(rotation === undefined ? {} : { rotation }),
            ...(facingLocation === undefined ? {} : { facing: facingLocation }),
            ...(facing === undefined ? {} : { facingEntity: facing }),
            ...(eased === undefined ? {} : { ease: eased }),
            ...(isDefault ? { isDefault } : {})
        });
        return undefined;
    };
    const entityArgumentOf = (call: ScriptCall, index: number, key: string): string | undefined => {
        const options = call.args[index];
        if (!(options instanceof ScriptHandle)) return undefined;
        const value = call.engine.get(options, key);
        const state = call.stateOf(value ?? null);
        if (value instanceof ScriptHandle) call.engine.free(value);
        return state === '' ? undefined : entityKeyOf(state).id;
    };
    const playerOf = (call: ScriptCall, member: string): string => {
        const key = entityKeyOf(call.state);
        if (world.entity(key.id) === undefined) throw invalidEntity('call', member, key);
        return key.id;
    };

    implementations
        .implement(SERVER, 'Player', 'camera', {
            get: (call) => {
                present(call, 'get', 'camera');
                return host.instance('Camera', ENTITY_AREA_TAG.camera, call.state);
            }
        })
        .implement(SERVER, 'Camera', 'isValid', {
            get: (call) => world.entity(entityKeyOf(call.state).id) !== undefined
        })
        .implement(SERVER, 'Camera', 'setCamera', (call) => setCamera(call, 'setCamera', false))
        .implement(SERVER, 'Camera', 'setCameraWithEase', (call) =>
            setCamera(call, 'setCameraWithEase', false, optionsOf(call, 1))
        )
        .implement(SERVER, 'Camera', 'setDefaultCamera', (call) =>
            setCamera(call, 'setDefaultCamera', true, optionsOf(call, 1))
        )
        .implement(SERVER, 'Camera', 'clear', (call) => {
            const id = present(call, 'call', 'clear');
            stateOf(id).camera = 'minecraft:first_person';
            camera(id, { kind: 'clear' });
            return undefined;
        })
        .implement(SERVER, 'Camera', 'fade', (call) => {
            const id = present(call, 'call', 'fade');
            const options = optionsOf(call, 0);
            const time = isRecord(options.fadeTime) ? options.fadeTime : undefined;
            const color = isRecord(options.fadeColor) ? options.fadeColor : undefined;
            camera(id, {
                kind: 'fade',
                ...(time === undefined
                    ? {}
                    : {
                          time: {
                              fadeIn: Number(time.fadeInTime ?? 0),
                              hold: Number(time.holdTime ?? 0),
                              fadeOut: Number(time.fadeOutTime ?? 0)
                          }
                      }),
                ...(color === undefined
                    ? {}
                    : {
                          color: {
                              red: Number(color.red ?? 0),
                              green: Number(color.green ?? 0),
                              blue: Number(color.blue ?? 0)
                          }
                      })
            });
            return undefined;
        })
        .implement(SERVER, 'Camera', 'setFov', (call) => {
            const id = present(call, 'call', 'setFov');
            const options = optionsOf(call, 0);
            const eased = ease(options.easeOptions);
            camera(id, {
                kind: 'fov',
                fov: typeof options.fov === 'number' ? options.fov : 70,
                ...(eased === undefined ? {} : { ease: eased })
            });
            return undefined;
        })
        .implement(SERVER, 'Camera', 'attachToEntity', (call) => {
            const id = present(call, 'call', 'attachToEntity');
            const entity = entityArgumentOf(call, 0, 'entity');
            camera(id, entity === undefined ? { kind: 'detach' } : { kind: 'attach', entity });
            return undefined;
        })
        .implement(SERVER, 'Camera', 'playAnimation', (call) => {
            const id = present(call, 'call', 'playAnimation');
            const spline = call.args[0];
            const { type, points } = splineOf(spline instanceof ScriptHandle ? call.stateOf(spline) : '');
            const options = optionsOf(call, 1);
            const animation = isRecord(options.animation) ? options.animation : {};
            const progressKeyFrames = keyFrames(animation.progressKeyFrames, 'alpha', (value) =>
                typeof value === 'number' ? value : undefined
            );
            const rotationKeyFrames = keyFrames(animation.rotationKeyFrames, 'rotation', vector);
            // BDS checks the rotation key frames, then the progress ones, then the control points.
            if ((rotationKeyFrames[0]?.time ?? 0) !== 0)
                throw plainError('First rotation key frame must be at time 0.0');
            if ((progressKeyFrames[0]?.time ?? 0) !== 0)
                throw plainError('First progress key frame must be at time 0.0');
            if (points.length < SPLINE_POINTS[type]) {
                throw plainError(
                    `${type === 'linear' ? 'Linear' : 'CatmullRom'} needs at least ${SPLINE_POINTS[type]} control points`
                );
            }
            camera(id, {
                kind: 'spline',
                type,
                controlPoints: points,
                totalTime: typeof options.totalTimeSeconds === 'number' ? options.totalTimeSeconds : 0,
                progressKeyFrames,
                rotationKeyFrames
            });
            return undefined;
        })
        .implement(SERVER, 'Camera', 'addShake', (call) => {
            const id = playerOf(call, 'addShake');
            const options = optionsOf(call, 0);
            const intensity = Number(options.intensity);
            if (!(intensity >= 0 && intensity <= MAX_SHAKE)) {
                const bound = intensity > MAX_SHAKE ? `Argument max: ${MAX_SHAKE}` : 'Argument min: 0';
                throw new ScriptApiError(
                    COMMON,
                    'ArgumentOutOfBoundsError',
                    `Unsupported or out of bounds value passed to function argument [0]: shakeCameraOptions.intensity, Value: ${intensity}, ${bound}`,
                    {
                        index: 0,
                        value: intensity,
                        ...(intensity > MAX_SHAKE ? { maxValue: MAX_SHAKE } : { minValue: 0 })
                    }
                );
            }
            send(id, {
                kind: 'shake',
                intensity,
                seconds: Number(options.duration),
                type: options.type === 'Rotational' ? 'rotational' : 'positional'
            });
            return undefined;
        })
        .implement(SERVER, 'Camera', 'stopShaking', (call) => {
            send(playerOf(call, 'stopShaking'), { kind: 'stopShake' });
            return undefined;
        });
};

/** The plain classes beside an entity: `EntityHealSource` and the entity waypoints. The entity loot conditions are the loot tables'. */
const implementReferences = (implementations: ScriptApiImplementations, host: PackHost): void => {
    const fields = (call: ScriptCall): Readonly<Record<string, unknown>> => {
        // The host wrote the state with JSON.stringify.
        const parsed: unknown = call.state === '' ? undefined : JSON.parse(call.state);
        return isRecord(parsed) ? parsed : {};
    };
    const text = (call: ScriptCall, key: string): string => String(fields(call)[key] ?? '');
    implementations.implement(SERVER, 'EntityHealSource', 'cause', { get: (call) => text(call, 'cause') });

    const waypoint = (kind: 'entity' | 'player') => (call: ScriptCall) => {
        const entity = entityArgument(call, 0);
        if (entity === undefined)
            throw new ScriptHostErrors.ArgumentNotOfType({
                argument: kind,
                type: kind === 'entity' ? 'Entity' : 'Player'
            });
        const [, textureSelector, rules, color] = call.args;
        const plain = (value: ScriptValue | undefined): unknown => {
            const json = value === undefined ? undefined : call.stringify(value);
            // The engine wrote the string with JSON.stringify.
            return json === undefined ? undefined : JSON.parse(json);
        };
        return JSON.stringify({
            kind,
            entity,
            textureSelector: plain(textureSelector),
            rules: plain(rules),
            ...(color === undefined ? {} : { color: plain(color) })
        });
    };
    implementations
        .implement(SERVER, 'EntityWaypoint', 'constructor', waypoint('entity'))
        .implement(SERVER, 'PlayerWaypoint', 'constructor', waypoint('player'))
        .implement(SERVER, 'EntityWaypoint', 'entity', {
            get: (call) => {
                const entity = fields(call).entity;
                if (!isRecord(entity) || typeof entity.id !== 'string' || typeof entity.typeId !== 'string')
                    throw new ScriptHostErrors.ObjectCarriesNoState({ what: 'waypoint' });
                return host.entity({ id: entity.id, typeId: entity.typeId });
            }
        })
        .implement(SERVER, 'EntityWaypoint', 'entityRules', { get: (call) => JSON.stringify(fields(call).rules ?? {}) })
        .implement(SERVER, 'PlayerWaypoint', 'playerRules', {
            get: (call) => JSON.stringify(fields(call).rules ?? {})
        });
};

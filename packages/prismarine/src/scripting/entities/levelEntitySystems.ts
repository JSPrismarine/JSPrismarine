/**
 * The level side of the script host's entity systems: `ScriptEntitySystems` over one level's
 * store entities and players. An entity's components are its definition's JSON, base components
 * then each active component group's; its motion, fire, riders, leash and owner are its store
 * body's and the entity runtime's; a player's experience, spawn point and client are its
 * session's. A message to a player's client becomes the packet a Bedrock Dedicated Server sends
 * for the same call.
 */
import type {
    ScriptAimAssistCategory,
    ScriptAimAssistPreset,
    ScriptAimAssistRegistry,
    ScriptCameraInstruction,
    ScriptClientInfo,
    ScriptClientMessage,
    ScriptEntityProperty,
    ScriptEntityStatus,
    ScriptEntitySystems
} from '@jsprismarine/script-host/host/entities/world';
import { isRecord } from '@jsprismarine/entities';
import { normalizedItemIdentifier } from '@jsprismarine/entities/components/shared';
import { BuildPlatform } from '@jsprismarine/minecraft';
import CameraAimAssistPacket from '@jsprismarine/protocol/bedrock/packet/CameraAimAssistPacket';
import CameraAimAssistPresetsPacket, {
    CameraAimAssistPresetsOperation
} from '@jsprismarine/protocol/bedrock/packet/CameraAimAssistPresetsPacket';
import CameraInstructionPacket from '@jsprismarine/protocol/bedrock/packet/CameraInstructionPacket';
import CameraShakePacket, {
    CameraShakeAction,
    CameraShakeType
} from '@jsprismarine/protocol/bedrock/packet/CameraShakePacket';
import ClientboundControlSchemeSetPacket from '@jsprismarine/protocol/bedrock/packet/ClientboundControlSchemeSetPacket';
import ScriptMessagePacket from '@jsprismarine/protocol/bedrock/packet/ScriptMessagePacket';
import PlayerStartItemCooldownPacket from '@jsprismarine/protocol/bedrock/packet/PlayerStartItemCooldownPacket';
import SetHudPacket from '@jsprismarine/protocol/bedrock/packet/SetHudPacket';
import StopSoundPacket from '@jsprismarine/protocol/bedrock/packet/StopSoundPacket';
import UpdateClientInputLocksPacket from '@jsprismarine/protocol/bedrock/packet/UpdateClientInputLocksPacket';
import type NetworkPacket from '@jsprismarine/protocol/NetworkPacket';
import type {
    CameraInstructionData,
    CameraSplineInstruction,
    EasingFunction
} from '@jsprismarine/protocol/bedrock/structure/CameraInstruction';
import { isEasingFunction } from '@jsprismarine/protocol/bedrock/structure/CameraInstruction';
import CameraAimAssistCategoryDefinition from '@jsprismarine/protocol/bedrock/structure/CameraAimAssistCategoryDefinition';
import CameraAimAssistCategoryPriorities from '@jsprismarine/protocol/bedrock/structure/CameraAimAssistCategoryPriorities';
import CameraAimAssistPresetDefinition from '@jsprismarine/protocol/bedrock/structure/CameraAimAssistPresetDefinition';
import { ControlScheme } from '@jsprismarine/protocol/bedrock/structure/CameraPreset';
import Vec2 from '@jsprismarine/protocol/bedrock/structure/Vec2';
import Vec3 from '@jsprismarine/protocol/bedrock/structure/Vec3';
import type { CameraAimAssistPresets } from '@jsprismarine/protocol/bedrock/packet/CameraAimAssistPresetsPacket';

import type { StoreActor } from '../../entity/data/storeActors';
import { consumeItem } from '../../item/interaction';
import { itemFromContent } from '../../item/itemFromContent';
import { itemViewOf } from '../../entity/data/droppedItems';
import { propertyOverridePacket } from '../../network/actorProperties';
import { customMusicPacket } from '../../network/customMusic';
import type PlayerSession from '../../network/PlayerSession';
import { cameraPresetNames, vanillaAimAssist } from '../../network/cameraJoinPackets';
import type Server from '../../Server';
import type { Level } from '../../world/Level';
import { itemOfScriptItem, levelActors } from '../levelActors';
import { scriptItemOf } from '../levelScriptAccess';
import { playerInputOf } from './playerInputs';

const record = (value: unknown): Readonly<Record<string, unknown>> => (isRecord(value) ? value : {});

/** The script-set fields of each entity's components, by entity id, then component. */
type ComponentFields = Map<string, Map<string, Record<string, unknown>>>;

/** BDS's input modes, by the number a login and an input packet carry. */
const INPUT_MODES = { 1: 'KeyboardAndMouse', 2: 'Touch', 3: 'Gamepad', 4: 'MotionController' } as const;

/** The control schemes by the name the Script API gives each. */
const CONTROL_SCHEMES: Readonly<Record<string, ControlScheme>> = {
    LockedPlayerRelativeStrafe: ControlScheme.LOCKED_PLAYER_RELATIVE_STRAFE,
    CameraRelative: ControlScheme.CAMERA_RELATIVE,
    CameraRelativeStrafe: ControlScheme.CAMERA_RELATIVE_STRAFE,
    PlayerRelative: ControlScheme.PLAYER_RELATIVE,
    PlayerRelativeStrafe: ControlScheme.PLAYER_RELATIVE_STRAFE
};

/** The platform type a login's device OS belongs to. */
const platformOf = (os: number | undefined): ScriptClientInfo['platformType'] => {
    if (os === BuildPlatform.GOOGLE || os === BuildPlatform.IOS || os === BuildPlatform.AMAZON) return 'Mobile';
    if (os === BuildPlatform.XBOX || os === BuildPlatform.NINTENDO || os === BuildPlatform.SONY) return 'Console';
    return 'Desktop';
};

/** An easing type as the camera packets name it: the Script API's `InOutQuad` is `in_out_quad`. */
const easingOf = (type: string): EasingFunction => {
    const name = type.replace(/([a-z])([A-Z])/g, '$1_$2').toLowerCase();
    return isEasingFunction(name) ? name : 'linear';
};

/** The `type` byte of a camera spline instruction, as BDS 1.26.60.6 sends each spline class. */
const SPLINE_TYPES = { catmullRom: 0, linear: 1 } as const;

/** The spline instruction BDS sends for `Camera.playAnimation`: linear easing where the script names none. */
export const splineInstructionOf = (
    spline: Extract<ScriptCameraInstruction, { kind: 'spline' }>
): CameraSplineInstruction => ({
    totalTime: spline.totalTime,
    type: SPLINE_TYPES[spline.type],
    curve: spline.controlPoints.map(({ x, y, z }) => new Vec3(x, y, z)),
    progressKeyFrames: spline.progressKeyFrames.map((frame) => ({
        value: frame.value,
        time: frame.time,
        easing: easingOf(frame.easing ?? 'Linear')
    })),
    rotationKeyFrames: spline.rotationKeyFrames.map((frame) => ({
        value: new Vec3(frame.value.x, frame.value.y, frame.value.z),
        time: frame.time,
        easing: easingOf(frame.easing ?? 'Linear')
    })),
    splineIdentifier: '',
    loadFromJson: false
});

/** The input lock bits of the `InputPermissionCategory` numbers a script locked, each its own bit. */
const inputLockBits = (locked: readonly number[]): number =>
    locked.reduce((bits, category) => bits | (1 << category), 0);

/** The registry the packets carry, as plain data. */
const registryOf = (presets: CameraAimAssistPresets): ScriptAimAssistRegistry => ({
    categories: presets.categories.map((category): ScriptAimAssistCategory => ({
        identifier: category.name,
        defaultBlockPriority: category.priorities.blockDefault ?? 1,
        defaultEntityPriority: category.priorities.entityDefault ?? 1,
        blocks: Object.fromEntries(category.priorities.blocks.map((each) => [each.identifier, each.priority])),
        entities: Object.fromEntries(category.priorities.entities.map((each) => [each.identifier, each.priority])),
        blockTags: Object.fromEntries(category.priorities.blockTags.map((each) => [each.identifier, each.priority])),
        entityTypeFamilies: Object.fromEntries(
            category.priorities.entityTypeFamilies.map((each) => [each.identifier, each.priority])
        )
    })),
    presets: presets.presets.map((preset): ScriptAimAssistPreset => ({
        identifier: preset.identifier,
        ...(preset.defaultItemSettings === undefined ? {} : { defaultItemSettings: preset.defaultItemSettings }),
        ...(preset.handSettings === undefined ? {} : { handSettings: preset.handSettings }),
        excludedBlocks: preset.exclusions.blocks,
        excludedEntities: preset.exclusions.entities,
        excludedBlockTags: preset.exclusions.blockTags,
        excludedEntityTypeFamilies: preset.exclusions.entityTypeFamilies,
        itemSettings: Object.fromEntries(preset.itemSettings.map((each) => [each.item, each.category])),
        liquidTargetingItems: preset.liquidTargetingList
    }))
});

/** A script's registry additions as the packet carries them. */
const presetsPacketOf = (added: ScriptAimAssistRegistry): CameraAimAssistPresetsPacket => {
    const priorities = (record: Readonly<Record<string, number>>) =>
        Object.entries(record).map(([identifier, priority]) => ({ identifier, priority }));
    return new CameraAimAssistPresetsPacket({
        categories: added.categories.map(
            (category) =>
                new CameraAimAssistCategoryDefinition(
                    category.identifier,
                    new CameraAimAssistCategoryPriorities(
                        priorities(category.entities),
                        priorities(category.blocks),
                        priorities(category.blockTags),
                        priorities(category.entityTypeFamilies),
                        category.defaultEntityPriority,
                        category.defaultBlockPriority
                    )
                )
        ),
        presets: added.presets.map(
            (preset) =>
                new CameraAimAssistPresetDefinition(
                    preset.identifier,
                    {
                        blocks: [...preset.excludedBlocks],
                        entities: [...preset.excludedEntities],
                        blockTags: [...preset.excludedBlockTags],
                        entityTypeFamilies: [...preset.excludedEntityTypeFamilies]
                    },
                    [...preset.liquidTargetingItems],
                    Object.entries(preset.itemSettings).map(([item, category]) => ({ item, category })),
                    preset.defaultItemSettings,
                    preset.handSettings
                )
        ),
        operation: CameraAimAssistPresetsOperation.ADD_TO_EXISTING
    });
};

/**
 * Builds the entity systems of one level's scripts.
 * @param server - The server whose content, sessions and commands the scripts reach.
 * @param level - The level the scripts run in.
 */
export const levelEntitySystems = (server: Server, level: Level): ScriptEntitySystems => {
    const { worldOf, actorOf, sessionOf } = levelActors(server, level);
    const fields: ComponentFields = new Map();
    const commandLevels = new Map<string, number>();
    const added: { categories: ScriptAimAssistCategory[]; presets: ScriptAimAssistPreset[] } = {
        categories: [],
        presets: []
    };
    const runtimeOf = (actor: StoreActor) => actor.getWorld().dataEntities().runtime;
    const host = () => server.getCommandManager().getHost();
    const send = (session: PlayerSession, packet: NetworkPacket<unknown>): void =>
        session.released(session.getConnection().sendDataPacket(packet));
    const refOf = (actor: StoreActor) => ({
        id: String(actor.getRuntimeId()),
        type: actor.getType(),
        name: actor.getName(),
        isPlayer: actor.getType() === 'minecraft:player',
        position: { x: actor.getPosition().getX(), y: actor.getFeetY(), z: actor.getPosition().getZ() },
        rotation: { yaw: actor.yaw, pitch: actor.pitch },
        dimension: actor.getWorld().getDimension().id
    });

    /** What a script did this tick that BDS shows only once the tick is over, by entity id. */
    const thisTick = {
        extinguished: new Map<string, number>(),
        ejected: new Map<string, { vehicle: string; tick: number }>()
    };
    const tickOf = (actor: StoreActor): number => actor.getWorld().getTicks();

    const componentsOf = (actor: StoreActor): Map<string, unknown> => {
        const { instance, body } = actor.entity;
        // The pack's own file, as BDS reads it, rather than the one the Java overlays rewrote.
        const file = record(record(server.getContent().entities.packData?.get(actor.getType()))['minecraft:entity']);
        const found = new Map<string, unknown>(Object.entries(record(file.components)));
        const groups = record(file.component_groups);
        for (const group of instance.activeComponentGroups()) {
            for (const [name, value] of Object.entries(record(groups[group]))) found.set(name, value);
        }
        const id = String(actor.getRuntimeId());
        for (const [component, set] of fields.get(id) ?? []) {
            const json = found.get(component);
            if (json !== undefined) found.set(component, { ...record(json), ...set });
        }
        if (body.fireTicks > 0 || thisTick.extinguished.get(id) === tickOf(actor)) found.set('minecraft:onfire', {});
        if (runtimeOf(actor).vehicleOf(body) !== undefined) found.set('minecraft:riding', {});
        const dropped = itemViewOf(actor.entity);
        if (dropped !== undefined) {
            found.set('minecraft:item', {
                item: {
                    typeId: dropped.stack.name,
                    amount: dropped.stack.count,
                    ...(dropped.stack.customName === undefined ? {} : { nameTag: dropped.stack.customName })
                }
            });
        }
        const session = sessionOf(id);
        if (session !== undefined) {
            const cursor = session.getPlayer().getInventory().container('cursor').get(0);
            found.set('minecraft:cursor_inventory', {
                ...(cursor === null ? {} : { item: scriptItemOf(cursor) }),
                ...(fields.get(id)?.get('minecraft:cursor_inventory') ?? {})
            });
            found.set('minecraft:ender_inventory', {});
        }
        return found;
    };

    const statusOf = (actor: StoreActor): ScriptEntityStatus => {
        const { body } = actor.entity;
        const runtime = runtimeOf(actor);
        const id = String(actor.getRuntimeId());
        const session = sessionOf(id);
        const position = actor.getPosition();
        const { width, height } = actor.getBox();
        const vehicle = runtime.vehicleOf(body);
        const holder = runtime.leashHolderIdOf(body.id);
        const input = session === undefined ? undefined : playerInputOf(session);
        const tick = tickOf(actor);
        // A rider thrown off this tick still counts among the vehicle's riders until the tick ends, as on BDS.
        const leaving = [...thisTick.ejected].flatMap(([rider, ejected]) =>
            ejected.vehicle === id && ejected.tick === tick ? [rider] : []
        );
        return {
            velocity: { x: body.velocity.x, y: body.velocity.y, z: body.velocity.z },
            onGround: actor.isOnGround(),
            inWater: body.conditions.has('in_water'),
            climbing: body.conditions.has('climbing'),
            sleeping: body.sleeping,
            sprinting: session?.isSprinting() ?? false,
            swimming: body.conditions.has('swimming'),
            fireTicks: thisTick.extinguished.get(id) === tick ? -1 : body.fireTicks,
            box: {
                min: { x: position.getX() - width / 2, y: actor.getFeetY(), z: position.getZ() - width / 2 },
                max: { x: position.getX() + width / 2, y: actor.getFeetY() + height, z: position.getZ() + width / 2 }
            },
            ...(body.target === undefined ? {} : { target: String(body.target) }),
            ...(vehicle === undefined || typeof vehicle.id !== 'number' ? {} : { vehicle: String(vehicle.id) }),
            riders: [
                ...runtime.ridersOf(body).flatMap((rider) => (typeof rider.id === 'number' ? [String(rider.id)] : [])),
                ...leaving
            ],
            ...(holder === undefined ? {} : { leashHolder: String(holder) }),
            ...(body.owner === undefined ? {} : { owner: String(body.owner) }),
            tamed: body.owner !== undefined || body.conditions.has('is_tamed'),
            ...(session === undefined
                ? {}
                : {
                      flying: session.isFlying(),
                      gliding: input?.gliding ?? false,
                      jumping: input?.jump ?? false,
                      emoting: input?.emoting ?? false
                  })
        };
    };

    const sendCamera = (session: PlayerSession, instruction: ScriptCameraInstruction): void => {
        const presets = cameraPresetNames(session.getConnection().codec.context.protocolVersion);
        const ease = (value: { readonly time: number; readonly type: string } | undefined) =>
            value === undefined ? undefined : { type: 0, time: value.time };
        const data: CameraInstructionData = {};
        if (instruction.kind === 'set') {
            const index = presets.indexOf(instruction.preset);
            if (index < 0) return;
            data.set = {
                preset: index,
                ...(instruction.ease === undefined ? {} : { ease: ease(instruction.ease) }),
                ...(instruction.location === undefined
                    ? {}
                    : { position: new Vec3(instruction.location.x, instruction.location.y, instruction.location.z) }),
                ...(instruction.rotation === undefined
                    ? {}
                    : { rotation: new Vec2(instruction.rotation.x, instruction.rotation.y) }),
                ...(instruction.facing === undefined
                    ? {}
                    : { facing: new Vec3(instruction.facing.x, instruction.facing.y, instruction.facing.z) }),
                ...(instruction.isDefault === true ? { default: true } : {}),
                removeIgnoreStartingValuesComponent: false
            };
        } else if (instruction.kind === 'clear') data.clear = true;
        else if (instruction.kind === 'fade') {
            data.fade = {
                ...(instruction.time === undefined
                    ? {}
                    : {
                          time: {
                              fadeInTime: instruction.time.fadeIn,
                              holdTime: instruction.time.hold,
                              fadeOutTime: instruction.time.fadeOut
                          }
                      }),
                ...(instruction.color === undefined ? {} : { color: { ...instruction.color } })
            };
        } else if (instruction.kind === 'fov') {
            data.fieldOfView = {
                fieldOfView: instruction.fov,
                easeTime: instruction.ease?.time ?? 0,
                easeType: easingOf(instruction.ease?.type ?? 'Linear'),
                clear: false
            };
        } else if (instruction.kind === 'spline') {
            data.spline = splineInstructionOf(instruction);
        } else if (instruction.kind === 'attach') {
            if (instruction.entity === undefined) return;
            data.attachToEntity = BigInt(instruction.entity);
        } else data.detachFromEntity = true;
        send(session, new CameraInstructionPacket({ cameraInstruction: data }));
    };

    const sendClient = (id: string, message: ScriptClientMessage): void => {
        const session = sessionOf(id);
        if (session === undefined) return;
        switch (message.kind) {
            case 'camera':
                return sendCamera(session, message.instruction);
            case 'shake': {
                const packet = new CameraShakePacket();
                packet.intensity = message.intensity;
                packet.seconds = message.seconds;
                packet.shakeType =
                    message.type === 'rotational' ? CameraShakeType.Rotational : CameraShakeType.Positional;
                packet.shakeAction = CameraShakeAction.Add;
                return send(session, packet);
            }
            case 'stopShake': {
                const packet = new CameraShakePacket();
                packet.shakeAction = CameraShakeAction.Stop;
                return send(session, packet);
            }
            case 'hud':
                // The visible elements are reset to the player's own settings, then the hidden ones hidden.
                send(session, new SetHudPacket({ elements: [...message.visible], visibility: 1 }));
                if (message.hidden.length > 0)
                    send(session, new SetHudPacket({ elements: [...message.hidden], visibility: 0 }));
                return;
            case 'inputLocks':
                return send(session, new UpdateClientInputLocksPacket({ locks: inputLockBits(message.locked) }));
            case 'cooldown':
                return send(
                    session,
                    new PlayerStartItemCooldownPacket({ itemCategory: message.category, durationTicks: message.ticks })
                );
            case 'controlScheme':
                return send(
                    session,
                    new ClientboundControlSchemeSetPacket({
                        controlScheme: CONTROL_SCHEMES[message.scheme] ?? ControlScheme.LOCKED_PLAYER_RELATIVE_STRAFE
                    })
                );
            case 'stopSound': {
                const packet = new StopSoundPacket();
                packet.soundName = message.sound ?? '';
                packet.stopAllSounds = message.sound === undefined;
                return send(session, packet);
            }
            case 'aimAssist':
                return send(
                    session,
                    new CameraAimAssistPacket({
                        presetId: message.preset ?? '',
                        viewAngle: new Vec2(message.viewAngle.x, message.viewAngle.y),
                        distance: message.distance,
                        targetMode: message.targetMode === 'Distance' ? 1 : 0,
                        action: message.preset === undefined ? 1 : 0,
                        showDebugRender: false
                    })
                );
            case 'music':
                return send(
                    session,
                    message.action === 'stop'
                        ? customMusicPacket({ action: 'stop' })
                        : customMusicPacket({
                              action: message.action,
                              track: message.track ?? '',
                              volume: message.volume ?? 1,
                              fade: message.fade ?? 0,
                              loop: message.loop ?? false
                          })
                );
            case 'propertyOverride': {
                const actor = actorOf(message.entity);
                if (actor === undefined) return;
                const packet = propertyOverridePacket(
                    actor.getRuntimeId(),
                    actor.entity.instance.properties,
                    message.property === ''
                        ? { action: 'clear' }
                        : message.value === undefined
                          ? { action: 'remove', name: message.property }
                          : { action: 'set', name: message.property, value: message.value }
                );
                if (packet !== undefined) send(session, packet);
                return;
            }
            case 'scriptMessage':
                return send(session, new ScriptMessagePacket({ messageId: message.id, messageValue: message.value }));
        }
    };

    const player = (id: string) => sessionOf(id)?.getPlayer();

    return {
        components: (id) => {
            const actor = actorOf(id);
            return actor === undefined ? undefined : componentsOf(actor);
        },
        formatVersion: (id) => {
            const actor = actorOf(id);
            const file = actor === undefined ? undefined : server.getContent().entities.packData?.get(actor.getType());
            const version = isRecord(file) ? file.format_version : undefined;
            return typeof version === 'string' ? version : undefined;
        },
        status: (id) => {
            const actor = actorOf(id);
            return actor === undefined ? undefined : statusOf(actor);
        },
        triggerEvent: (id, event) => {
            const actor = actorOf(id);
            if (actor === undefined || !actor.entity.instance.type.entity.events.has(event)) return false;
            actor.entity.instance.fire(event);
            return true;
        },
        properties: (id) => {
            const actor = actorOf(id);
            if (actor === undefined) return undefined;
            const values = actor.entity.instance.properties;
            const found = new Map<string, ScriptEntityProperty>();
            for (const name of values.names()) {
                const definition = values.definition(name);
                const value = values.get(name);
                if (definition === undefined || value === undefined) continue;
                const declared = definition.default.kind === 'literal' ? definition.default.value : value;
                found.set(name, {
                    type: definition.type,
                    value,
                    defaultValue: declared,
                    ...(definition.range === undefined ? {} : { range: definition.range }),
                    ...(definition.values === undefined ? {} : { values: definition.values })
                });
            }
            return found;
        },
        setProperty: (id, name, value) => {
            actorOf(id)?.entity.instance.queuePropertyWrite(name, value);
        },
        applyImpulse: (id, impulse) => actorOf(id)?.applyImpulse(impulse),
        clearVelocity: (id) => {
            const body = actorOf(id)?.entity.body;
            if (body !== undefined) body.velocity = { x: 0, y: 0, z: 0 };
        },
        applyKnockback: (id, horizontal, vertical) => {
            const body = actorOf(id)?.entity.body;
            if (body === undefined) return;
            body.velocity = { x: 0, y: 0, z: 0 };
            body.push({ x: horizontal.x, y: vertical, z: horizontal.z });
        },
        setRotation: (id, rotation) => {
            const actor = actorOf(id);
            if (actor === undefined) return;
            host().entities.teleport(
                refOf(actor),
                refOf(actor).position,
                { yaw: rotation.y, pitch: rotation.x },
                refOf(actor).dimension
            );
        },
        setOnFire: (id, ticks) => {
            const actor = actorOf(id);
            if (actor === undefined || actor.entity.instance.hasComponent('minecraft:fire_immune')) return false;
            actor.entity.body.fireTicks = Math.max(actor.entity.body.fireTicks, ticks);
            return true;
        },
        extinguishFire: (id) => {
            const actor = actorOf(id);
            if (actor === undefined || actor.entity.body.fireTicks <= 0) return false;
            actor.entity.body.fireTicks = 0;
            thisTick.extinguished.set(id, tickOf(actor));
            return true;
        },
        ride: (riderId, vehicleId) => {
            const rider = actorOf(riderId);
            const vehicle = actorOf(vehicleId);
            if (rider === undefined || vehicle === undefined) return false;
            const runtime = runtimeOf(vehicle);
            const mob = runtime.mobById(vehicle.entity.id);
            if (mob === undefined) return false;
            runtime.mount(rider.entity.body, mob);
            return runtime.vehicleOf(rider.entity.body)?.id === vehicle.entity.id;
        },
        dismount: (riderId) => {
            const rider = actorOf(riderId);
            if (rider === undefined) return;
            const runtime = runtimeOf(rider);
            const vehicle = runtime.vehicleOf(rider.entity.body);
            if (typeof vehicle?.id === 'number')
                thisTick.ejected.set(riderId, { vehicle: String(vehicle.id), tick: tickOf(rider) });
            runtime.dismount(rider.entity.body);
        },
        leash: (id, holder) => {
            const actor = actorOf(id);
            if (actor === undefined) return;
            const runtime = runtimeOf(actor);
            if (holder === undefined) runtime.releaseLead(actor.entity.id);
            else runtime.attachLead(Number(holder), actor.entity.id);
        },
        tame: (id, owner) => {
            const actor = actorOf(id);
            return (
                actor !== undefined &&
                runtimeOf(actor).tameFor(actor.entity.id, owner === undefined ? undefined : Number(owner))
            );
        },
        setComponentField: (id, component, field, value) => {
            const actor = actorOf(id);
            if (actor === undefined) return;
            const entity = fields.get(id) ?? new Map<string, Record<string, unknown>>();
            fields.set(id, entity);
            entity.set(component, { ...(entity.get(component) ?? {}), [field]: value });
            // A color is metadata every client shows.
            if (component === 'minecraft:color' && field === 'value' && typeof value === 'number')
                actor.entity.body.color = value;
        },
        itemIdentifier: (name) => normalizedItemIdentifier(name),
        entityTypes: () => [...server.getContent().entities.registry.keys()],
        experience: (id) => {
            const holder = player(id)?.getExperience();
            return holder === undefined ? undefined : { level: holder.getLevel(), progress: holder.getProgress() };
        },
        setExperience: (id, experience) => {
            const holder = player(id)?.getExperience();
            if (holder === undefined) return;
            holder.setLevel(experience.level);
            holder.setProgress(experience.progress);
        },
        spawnPoint: (id) => {
            const point = player(id)?.getSpawnPoint();
            if (point === undefined) return undefined;
            const dimension =
                [...level.worlds()].find((world) => world.getDimension().id === point.dimension)?.getDimension()
                    .bedrockName ?? point.dimension;
            return { dimension, x: point.x, y: point.y, z: point.z };
        },
        setSpawnPoint: (id, point) => {
            const actor = actorOf(id);
            if (actor === undefined) return;
            if (point === undefined) {
                player(id)?.setSpawnPoint(undefined);
                return;
            }
            const world = worldOf(point.dimension);
            host().world.setSpawnPoint(
                refOf(actor),
                world?.getDimension().id ?? point.dimension,
                { x: point.x, y: point.y, z: point.z },
                0
            );
        },
        permissions: (id) => {
            const session = sessionOf(id);
            if (session === undefined) return undefined;
            const operator = session.isOp();
            return { command: commandLevels.get(id) ?? (operator ? 1 : 0), player: operator ? 2 : 1 };
        },
        setCommandPermissionLevel: (id, value) => {
            commandLevels.set(id, value);
        },
        clientInfo: (id) => {
            const session = sessionOf(id);
            if (session === undefined) return undefined;
            const stored = session.getPlayer();
            const input = playerInputOf(session);
            const simulated = session.isSimulated();
            const mode = INPUT_MODES[(input?.inputMode ?? stored.device?.inputMode ?? 1) as keyof typeof INPUT_MODES];
            return {
                locale: stored.locale,
                maxRenderDistance: simulated ? 32 : session.getViewDistance(),
                platformType: simulated ? 'Desktop' : platformOf(stored.device?.os),
                graphicsMode: 'Fancy',
                inputMode: mode ?? 'KeyboardAndMouse',
                touchOnlyAffectsHotbar: false,
                movement: input?.movement ?? { x: 0, y: 0 },
                jump: input?.jump ?? false,
                sneak: input?.sneak ?? false,
                ...(simulated ? {} : { splitScreenSlot: 'First' as const }),
                persistentId: stored.getUUID().toString()
            };
        },
        playAnimation: (id, animation) => {
            const actor = actorOf(id);
            if (actor === undefined) return;
            host().server.playAnimation([refOf(actor)], {
                animation: animation.name,
                ...(animation.nextState === undefined ? {} : { nextState: animation.nextState }),
                ...(animation.blendOutTime === undefined ? {} : { blendOutTime: animation.blendOutTime }),
                ...(animation.stopExpression === undefined ? {} : { stopExpression: animation.stopExpression }),
                ...(animation.controller === undefined ? {} : { controller: animation.controller })
            });
        },
        eat: (id, typeId) => {
            const session = sessionOf(id);
            const item = itemFromContent(typeId, server.getContent());
            if (session === undefined || item === null) return;
            const world = session.getWorld();
            consumeItem(
                {
                    content: server.getContent(),
                    actors: server.getContentWorld().actorsAt(world.getDimension().name, level.name),
                    player: session
                },
                item
            );
        },
        sendClient,
        aimAssist: () => {
            const vanilla = registryOf(vanillaAimAssist());
            return {
                categories: [...vanilla.categories, ...added.categories],
                presets: [...vanilla.presets, ...added.presets]
            };
        },
        addAimAssist: (registry) => {
            added.categories.push(...registry.categories);
            added.presets.push(...registry.presets);
            for (const session of server.getSessionManager().getSessions()) {
                if (session.getWorld().getLevel() === level) send(session, presetsPacketOf(registry));
            }
        },
        enderChest: (id) => {
            return player(id)?.getInventory().container('ender_chest').items().map(scriptItemOf);
        },
        setEnderChestItem: (id, slot, item) => {
            const chest = player(id)?.getInventory().container('ender_chest');
            if (chest === undefined) return;
            if (item === undefined) chest.set(slot, null);
            else {
                const stack = itemOfScriptItem(server, item);
                if (stack !== undefined) chest.set(slot, stack);
            }
        }
    };
};

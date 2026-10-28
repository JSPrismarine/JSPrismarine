/**
 * Translates live Bedrock entity components into the actor metadata a client renders.
 *
 * Component semantics belong to the data-driven entity runtime, while actor flags are a wire
 * representation. Keeping that translation here lets every entity use the same projection and
 * keeps the live-body mirror independent of individual component names.
 */
import { navigationProfile } from '@jsprismarine/entity-goals';
import { isRecord } from '@jsprismarine/entities';
import { ActorDataID } from '@jsprismarine/minecraft/ActorDataID';
import { ActorFlags } from '@jsprismarine/minecraft/ActorFlags';

import { BlockRuntimeIds } from '../../block/state/BlockRuntimeIds';
import type { Entity } from '../Entity';
import { FlagType, MetadataFlag } from '../Metadata';
import type { DataEntity } from './DataEntity';

/** One actor flag and the value the component state projects onto it. */
interface ActorFlagProjection {
    readonly flag: number;
    readonly value: boolean;
}

/** One scalar actor property and its wire type. */
type ActorPropertyProjection =
    | { readonly kind: 'byte'; readonly id: number; readonly value: number }
    | { readonly kind: 'float'; readonly id: number; readonly value: number }
    | { readonly kind: 'int'; readonly id: number; readonly value: number }
    | { readonly kind: 'long'; readonly id: number; readonly value: bigint }
    | { readonly kind: 'string'; readonly id: number; readonly value: string };

/** The first interaction prompt the data type makes available to a touch-screen client. */
const interactTextOf = (entity: DataEntity): string => {
    const rideable = entity.instance.componentParams('minecraft:rideable');
    if (isRecord(rideable) && typeof rideable.interactText === 'string') return rideable.interactText;

    const interact = entity.instance.componentParams('minecraft:interact');
    if (!isRecord(interact) || !Array.isArray(interact.interactions)) return '';

    for (const interaction of interact.interactions) {
        if (isRecord(interaction) && typeof interaction.interactText === 'string') return interaction.interactText;
    }
    return '';
};

/** The complete metadata view derived from one live entity. */
export interface ActorMetadataProjection {
    readonly flags: readonly ActorFlagProjection[];
    readonly properties: readonly ActorPropertyProjection[];
}

/**
 * Projects the active entity definition and runtime state into client-facing metadata.
 *
 * These are component-to-protocol mappings, shared by every entity with the same active data.
 * New component metadata belongs in this projection rather than in per-entity body code.
 *
 * @param leashHolderId - Runtime id of the entity holding this entity's leash, when one is loaded.
 */
export const actorMetadataProjection = (entity: DataEntity, leashHolderId?: number): ActorMetadataProjection => {
    const { instance, body } = entity;
    const navigation = navigationProfile(instance);
    const canSwim =
        navigation.canSwim ||
        navigation.canFloat ||
        navigation.isAmphibious ||
        instance.hasComponent('minecraft:behavior.float');
    const physics = instance.componentParams('minecraft:physics');
    const nameable = instance.componentParams('minecraft:nameable');
    const scale = instance.componentParams('minecraft:scale');
    const variant = instance.componentParams('minecraft:variant');
    const color = instance.componentParams('minecraft:color');
    const color2 = instance.componentParams('minecraft:color2');
    const flags: ActorFlagProjection[] = [
        { flag: ActorFlags.CANCLIMB, value: navigation.canClimbLadders === true },
        { flag: ActorFlags.ALWAYS_SHOW_NAME, value: isRecord(nameable) && nameable.alwaysShow === true },
        { flag: MetadataFlag.ONFIRE, value: body.fireTicks > 0 },
        { flag: ActorFlags.CANSWIM, value: canSwim },
        { flag: ActorFlags.CANFLY, value: navigation.canFly },
        { flag: ActorFlags.CANWALK, value: navigation.canWalk },
        { flag: ActorFlags.CAN_POWER_JUMP, value: instance.hasComponent('minecraft:can_power_jump') },
        { flag: ActorFlags.CAN_DASH, value: instance.hasComponent('minecraft:dash_action') },
        { flag: ActorFlags.WASD_CONTROLLED, value: instance.hasComponent('minecraft:input_ground_controlled') },
        {
            flag: ActorFlags.WASD_FREE_CAMERA_CONTROLLED,
            value: instance.hasComponent('minecraft:free_camera_controlled')
        },
        {
            flag: ActorFlags.CAN_USE_VERTICAL_MOVEMENT_ACTION,
            value: instance.hasComponent('minecraft:vertical_movement_action')
        },
        { flag: ActorFlags.FIRE_IMMUNE, value: instance.hasComponent('minecraft:fire_immune') },
        { flag: ActorFlags.OUT_OF_CONTROL, value: instance.hasComponent('minecraft:out_of_control') },
        { flag: ActorFlags.SWIMMING, value: canSwim && body.conditions.has('in_water') },
        {
            flag: MetadataFlag.AFFECTED_BY_GRAVITY,
            value: isRecord(physics) && physics.hasGravity === true
        },
        {
            flag: MetadataFlag.HAS_COLLISION,
            value: !isRecord(physics) || physics.hasCollision !== false
        },
        { flag: ActorFlags.COLLIDABLE, value: instance.hasComponent('minecraft:is_collidable') },
        {
            flag: MetadataFlag.IGNITED,
            value: body.fuseTicks !== undefined || instance.hasComponent('minecraft:is_ignited')
        },
        { flag: ActorFlags.POWERED, value: instance.hasComponent('minecraft:is_charged') },
        { flag: ActorFlags.SADDLED, value: instance.hasComponent('minecraft:is_saddled') },
        { flag: ActorFlags.LEASHED, value: leashHolderId !== undefined },
        { flag: ActorFlags.CHESTED, value: instance.hasComponent('minecraft:is_chested') },
        {
            flag: ActorFlags.IS_ILLAGER_CAPTAIN,
            value: instance.hasComponent('minecraft:is_illager_captain')
        },
        { flag: ActorFlags.SHAKING, value: instance.hasComponent('minecraft:is_shaking') },
        {
            flag: ActorFlags.HIDDEN_WHEN_INVISIBLE,
            value: instance.hasComponent('minecraft:is_hidden_when_invisible')
        },
        { flag: ActorFlags.STACKABLE, value: instance.hasComponent('minecraft:is_stackable') },
        { flag: ActorFlags.IS_PREGNANT, value: instance.hasComponent('minecraft:is_pregnant') },
        { flag: ActorFlags.STUNNED, value: instance.hasComponent('minecraft:is_stunned') },
        {
            flag: ActorFlags.BODY_ROTATION_ALWAYS_FOLLOWS_HEAD,
            value: instance.hasComponent('minecraft:body_rotation_always_follows_head')
        },
        { flag: ActorFlags.BODY_ROTATION_BLOCKED, value: instance.hasComponent('minecraft:body_rotation_blocked') },
        { flag: ActorFlags.USES_UNIFORM_AIR_DRAG, value: instance.hasComponent('minecraft:uses_uniform_air_drag') },
        { flag: ActorFlags.RENDERS_WHEN_INVISIBLE, value: instance.hasComponent('minecraft:renders_when_invisible') },
        { flag: ActorFlags.ROTATION_AXIS_ALIGNED, value: instance.hasComponent('minecraft:rotation_axis_aligned') },
        {
            flag: ActorFlags.ROTATION_LOCKED_TO_VEHICLE,
            value: instance.hasComponent('minecraft:rotation_locked_to_vehicle')
        },
        { flag: ActorFlags.USES_LEGACY_FRICTION, value: instance.hasComponent('minecraft:uses_legacy_friction') },
        {
            flag: ActorFlags.TAMED,
            value: body.owner !== undefined || instance.hasComponent('minecraft:is_tamed')
        },
        { flag: ActorFlags.BABY, value: instance.hasComponent('minecraft:is_baby') },
        { flag: ActorFlags.SHEARED, value: instance.hasComponent('minecraft:is_sheared') }
    ];
    const properties: ActorPropertyProjection[] = [
        { kind: 'float', id: MetadataFlag.SCALE, value: typeof scale === 'number' ? scale : 1 },
        { kind: 'int', id: MetadataFlag.FUSE_TIME, value: body.fuseTicks ?? 0 },
        { kind: 'long', id: MetadataFlag.ENTITY_LEAD_HOLDER_ID, value: BigInt(leashHolderId ?? -1) },
        { kind: 'string', id: MetadataFlag.NAMETAG, value: body.nameTag ?? '' },
        { kind: 'string', id: ActorDataID.INTERACT_TEXT, value: interactTextOf(entity) }
    ];

    if (typeof color === 'number') properties.push({ kind: 'byte', id: MetadataFlag.COLOR, value: color });
    if (typeof color2 === 'number') properties.push({ kind: 'byte', id: ActorDataID.COLOR_2_INDEX, value: color2 });

    if (instance.hasComponent('jsprismarine:falling_block')) {
        const block = entity.spawnData?.['block'];
        if (typeof block === 'string') {
            const runtimeId = BlockRuntimeIds.tryGetByName(block);
            if (runtimeId !== null) properties.push({ kind: 'int', id: MetadataFlag.VARIANT, value: runtimeId });
        }
    } else if (typeof variant === 'number') {
        properties.push({ kind: 'int', id: MetadataFlag.VARIANT, value: variant });
    }

    return { flags, properties };
};

/** Applies one translated metadata view to the network-facing entity body. */
export const applyActorMetadataProjection = (body: Entity, projection: ActorMetadataProjection): void => {
    for (const { flag, value } of projection.flags) body.metadata.setGenericFlag(flag, value);
    for (const property of projection.properties) {
        if (property.kind === 'byte') body.metadata.setPropertyValue(property.id, FlagType.BYTE, property.value);
        else if (property.kind === 'float') body.metadata.setFloat(property.id, property.value);
        else if (property.kind === 'int') body.metadata.setInt(property.id, property.value);
        else if (property.kind === 'long') body.metadata.setLong(property.id, property.value);
        else body.metadata.setString(property.id, property.value);
    }
};

/** Whether a translated actor metadata view changed since the last write. */
export const sameActorMetadataProjection = (
    left: ActorMetadataProjection | undefined,
    right: ActorMetadataProjection
): boolean => {
    if (
        left === undefined ||
        left.flags.length !== right.flags.length ||
        left.properties.length !== right.properties.length
    )
        return false;

    return (
        left.flags.every((entry, index) => {
            const next = right.flags[index];
            return next !== undefined && entry.flag === next.flag && entry.value === next.value;
        }) &&
        left.properties.every((entry, index) => {
            const next = right.properties[index];
            return next !== undefined && entry.kind === next.kind && entry.id === next.id && entry.value === next.value;
        })
    );
};

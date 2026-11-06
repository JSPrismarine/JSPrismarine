import { navigationProfile } from '@jsprismarine/entity-goals';
import { isRecord } from '@jsprismarine/entities';
import { ActorDataID } from '@jsprismarine/minecraft/ActorDataID';
import { ActorFlags } from '@jsprismarine/minecraft/ActorFlags';
import { MetadataFlag } from '@jsprismarine/protocol/wire/structures/Metadata';

import { BlockRuntimeIds } from '../../block/state/BlockRuntimeIds';
import type { ActorMetadataProjection } from './actorMetadata';
import type { DataEntity } from './DataEntity';

/**
 * The actor metadata projection as it was before static component facts were cached: every
 * component lookup repeated on every call. It is the oracle `actorMetadata.test.ts` holds the
 * shipped projection to, so it must not be tuned.
 */

interface ActorFlagProjection {
    readonly flag: number;
    readonly value: boolean;
}

type ActorPropertyProjection =
    | { readonly kind: 'byte'; readonly id: number; readonly value: number }
    | { readonly kind: 'float'; readonly id: number; readonly value: number }
    | { readonly kind: 'int'; readonly id: number; readonly value: number }
    | { readonly kind: 'long'; readonly id: number; readonly value: bigint }
    | { readonly kind: 'position'; readonly id: number; readonly value: { x: number; y: number; z: number } }
    | { readonly kind: 'string'; readonly id: number; readonly value: string };

/** The first interaction prompt the data type makes available to a touch-screen client. */
const referenceInteractTextOf = (entity: DataEntity): string => {
    const rideable = entity.instance.componentParams('minecraft:rideable');
    if (isRecord(rideable) && typeof rideable.interactText === 'string') return rideable.interactText;

    const interact = entity.instance.componentParams('minecraft:interact');
    if (isRecord(interact) && Array.isArray(interact.interactions)) {
        for (const interaction of interact.interactions) {
            if (isRecord(interaction) && typeof interaction.interactText === 'string') return interaction.interactText;
        }
    }

    const dyeable = entity.instance.componentParams('minecraft:is_dyeable');
    return isRecord(dyeable) && typeof dyeable.interactText === 'string' ? dyeable.interactText : '';
};

export const referenceActorMetadataProjection = (
    entity: DataEntity,
    leashHolderId?: number
): ActorMetadataProjection => {
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
    const componentColor = instance.componentParams('minecraft:color');
    const color = body.color ?? componentColor;
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
        { flag: ActorFlags.SHEARED, value: instance.hasComponent('minecraft:is_sheared') },
        // Java's DATA_SHOW_BOTTOM defaults to true, so an unset record keeps the end
        // crystal's base plate; only the crystal's render controller reads the flag.
        { flag: ActorFlags.SHOW_BOTTOM, value: body.showBottom !== false }
    ];
    const properties: ActorPropertyProjection[] = [
        { kind: 'float', id: MetadataFlag.SCALE, value: typeof scale === 'number' ? scale : 1 },
        { kind: 'int', id: MetadataFlag.FUSE_TIME, value: body.fuseTicks ?? 0 },
        { kind: 'long', id: MetadataFlag.ENTITY_LEAD_HOLDER_ID, value: BigInt(leashHolderId ?? -1) },
        { kind: 'string', id: MetadataFlag.NAMETAG, value: body.nameTag ?? '' },
        { kind: 'string', id: ActorDataID.INTERACT_TEXT, value: referenceInteractTextOf(entity) }
    ];

    // The client draws an end crystal's beam at the BLOCK_TARGET block and treats the zero
    // position as no beam, so the key only goes out while a target is set.
    if (body.beamTarget !== undefined) {
        properties.push({
            kind: 'position',
            id: ActorDataID.BLOCK_TARGET,
            value: {
                x: Math.floor(body.beamTarget.x),
                y: Math.floor(body.beamTarget.y),
                z: Math.floor(body.beamTarget.z)
            }
        });
    }

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

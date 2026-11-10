/**
 * Translates live Bedrock entity components into the actor metadata a client renders.
 *
 * Component semantics belong to the data-driven entity runtime, while actor flags are a wire
 * representation. Keeping that translation here lets every entity use the same projection and
 * keeps the live-body mirror independent of individual component names.
 */
import { navigationProfile } from '@jsprismarine/entity-goals';
import { isRecord } from '@jsprismarine/entities';
import type { EntityPosition } from '@jsprismarine/entities';
import { Vector3 } from '@jsprismarine/math';
import { ActorDataID } from '@jsprismarine/minecraft/ActorDataID';
import { ActorFlags } from '@jsprismarine/minecraft/ActorFlags';

import { BlockRuntimeIds } from '../../block/state/BlockRuntimeIds';
import { FlagType, MetadataFlag } from '@jsprismarine/protocol/wire/structures/Metadata';
import type { Metadata } from '@jsprismarine/protocol/wire/structures/Metadata';
import type { DataEntity } from './DataEntity';

/** One actor flag and the value the component state projects onto it. */
interface ActorFlagProjection {
    readonly flag: number;
    readonly value: boolean;
}

/** One actor property and its wire type. */
type ActorPropertyProjection =
    | { readonly kind: 'byte'; readonly id: number; readonly value: number }
    | { readonly kind: 'float'; readonly id: number; readonly value: number }
    | { readonly kind: 'int'; readonly id: number; readonly value: number }
    | { readonly kind: 'long'; readonly id: number; readonly value: bigint }
    | { readonly kind: 'position'; readonly id: number; readonly value: EntityPosition }
    | { readonly kind: 'string'; readonly id: number; readonly value: string };

/** The first interaction prompt the data type makes available to a touch-screen client. */
const interactTextOf = (entity: DataEntity): string => {
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

/** The complete metadata view derived from one live entity. */
export interface ActorMetadataProjection {
    readonly flags: readonly ActorFlagProjection[];
    readonly properties: readonly ActorPropertyProjection[];
}

/**
 * What the active components alone decide about an entity's metadata.
 *
 * Every field here is a pure function of the component set, so it is read once per set and kept
 * until the set changes. The flag values appear in the order {@link actorMetadataProjection}
 * writes them.
 */
interface ComponentMetadataFacts {
    /** The entity instance's component set when these were read; a different one invalidates them. */
    readonly componentSet: object;
    readonly canClimb: boolean;
    readonly alwaysShowName: boolean;
    readonly canSwim: boolean;
    readonly canFly: boolean;
    readonly canWalk: boolean;
    readonly canPowerJump: boolean;
    readonly canDash: boolean;
    readonly wasdControlled: boolean;
    readonly freeCameraControlled: boolean;
    readonly verticalMovement: boolean;
    readonly fireImmune: boolean;
    readonly outOfControl: boolean;
    readonly affectedByGravity: boolean;
    readonly hasCollision: boolean;
    readonly collidable: boolean;
    readonly ignited: boolean;
    readonly powered: boolean;
    readonly saddled: boolean;
    readonly chested: boolean;
    readonly illagerCaptain: boolean;
    readonly shaking: boolean;
    readonly hiddenWhenInvisible: boolean;
    readonly stackable: boolean;
    readonly pregnant: boolean;
    readonly stunned: boolean;
    readonly bodyFollowsHead: boolean;
    readonly bodyBlocked: boolean;
    readonly uniformAirDrag: boolean;
    readonly rendersWhenInvisible: boolean;
    readonly axisAligned: boolean;
    readonly lockedToVehicle: boolean;
    readonly legacyFriction: boolean;
    readonly tamed: boolean;
    readonly baby: boolean;
    readonly sheared: boolean;
    readonly scale: number;
    readonly interactText: string;
    readonly componentColor: unknown;
    readonly color2: unknown;
    readonly variant: unknown;
    readonly markVariant: unknown;
    readonly skinId: unknown;
    readonly fallingBlock: boolean;
}

const componentFactsByEntity = new WeakMap<DataEntity, ComponentMetadataFacts>();

/** The component-derived metadata facts for an entity, read again only when its component set changed. */
const componentFactsOf = (entity: DataEntity): ComponentMetadataFacts => {
    const { instance } = entity;
    const componentSet = instance.componentSetToken;
    const cached = componentFactsByEntity.get(entity);
    if (cached?.componentSet === componentSet) return cached;

    const navigation = navigationProfile(instance);
    const physics = instance.componentParams('minecraft:physics');
    const nameable = instance.componentParams('minecraft:nameable');
    const scale = instance.componentParams('minecraft:scale');
    const has = (name: string): boolean => instance.hasComponent(name);
    const facts: ComponentMetadataFacts = {
        componentSet,
        canClimb: navigation.canClimbLadders === true,
        alwaysShowName: isRecord(nameable) && nameable.alwaysShow === true,
        canSwim:
            navigation.canSwim || navigation.canFloat || navigation.isAmphibious || has('minecraft:behavior.float'),
        canFly: navigation.canFly,
        canWalk: navigation.canWalk,
        canPowerJump: has('minecraft:can_power_jump'),
        canDash: has('minecraft:dash_action'),
        wasdControlled: has('minecraft:input_ground_controlled'),
        freeCameraControlled: has('minecraft:free_camera_controlled'),
        verticalMovement: has('minecraft:vertical_movement_action'),
        fireImmune: has('minecraft:fire_immune'),
        outOfControl: has('minecraft:out_of_control'),
        affectedByGravity: isRecord(physics) && physics.hasGravity === true,
        hasCollision: !isRecord(physics) || physics.hasCollision !== false,
        collidable: has('minecraft:is_collidable'),
        ignited: has('minecraft:is_ignited'),
        powered: has('minecraft:is_charged'),
        saddled: has('minecraft:is_saddled'),
        chested: has('minecraft:is_chested'),
        illagerCaptain: has('minecraft:is_illager_captain'),
        shaking: has('minecraft:is_shaking'),
        hiddenWhenInvisible: has('minecraft:is_hidden_when_invisible'),
        stackable: has('minecraft:is_stackable'),
        pregnant: has('minecraft:is_pregnant'),
        stunned: has('minecraft:is_stunned'),
        bodyFollowsHead: has('minecraft:body_rotation_always_follows_head'),
        bodyBlocked: has('minecraft:body_rotation_blocked'),
        uniformAirDrag: has('minecraft:uses_uniform_air_drag'),
        rendersWhenInvisible: has('minecraft:renders_when_invisible'),
        axisAligned: has('minecraft:rotation_axis_aligned'),
        lockedToVehicle: has('minecraft:rotation_locked_to_vehicle'),
        legacyFriction: has('minecraft:uses_legacy_friction'),
        tamed: has('minecraft:is_tamed'),
        baby: has('minecraft:is_baby'),
        sheared: has('minecraft:is_sheared'),
        scale: typeof scale === 'number' ? scale : 1,
        interactText: interactTextOf(entity),
        componentColor: instance.componentParams('minecraft:color'),
        color2: instance.componentParams('minecraft:color2'),
        variant: instance.componentParams('minecraft:variant'),
        markVariant: instance.componentParams('minecraft:mark_variant'),
        skinId: instance.componentParams('minecraft:skin_id'),
        fallingBlock: has('jsprismarine:falling_block')
    };
    componentFactsByEntity.set(entity, facts);
    return facts;
};

/**
 * Everything besides the component set that a projection reads, as plain values.
 *
 * Compared before a projection is built: while these and the component set are unchanged, the
 * projection cannot differ from the last one.
 */
export interface ActorMetadataInputs {
    readonly componentSet: object;
    readonly onFire: boolean;
    readonly inWater: boolean;
    readonly fuseTicks: number | undefined;
    readonly owned: boolean;
    readonly leashHolderId: number | undefined;
    readonly nameTag: string | undefined;
    readonly color: unknown;
    readonly beamX: number | undefined;
    readonly beamY: number | undefined;
    readonly beamZ: number | undefined;
    readonly showBottom: boolean;
    readonly fallingBlock: unknown;
}

/** Reads the per-tick inputs of an entity's metadata projection. */
export const actorMetadataInputs = (entity: DataEntity, leashHolderId?: number): ActorMetadataInputs => {
    const { body } = entity;
    const facts = componentFactsOf(entity);
    const beam = body.beamTarget;
    return {
        componentSet: facts.componentSet,
        onFire: body.fireTicks > 0,
        inWater: body.conditions.has('in_water'),
        fuseTicks: body.fuseTicks,
        owned: body.owner !== undefined,
        leashHolderId,
        nameTag: body.nameTag,
        color: body.color,
        beamX: beam === undefined ? undefined : Math.floor(beam.x),
        beamY: beam === undefined ? undefined : Math.floor(beam.y),
        beamZ: beam === undefined ? undefined : Math.floor(beam.z),
        showBottom: body.showBottom !== false,
        fallingBlock: facts.fallingBlock ? entity.spawnData?.['block'] : undefined
    };
};

/** Whether two reads of the per-tick inputs are the same, so the last projection still stands. */
export const sameActorMetadataInputs = (left: ActorMetadataInputs | undefined, right: ActorMetadataInputs): boolean =>
    left !== undefined &&
    left.componentSet === right.componentSet &&
    left.onFire === right.onFire &&
    left.inWater === right.inWater &&
    left.fuseTicks === right.fuseTicks &&
    left.owned === right.owned &&
    left.leashHolderId === right.leashHolderId &&
    left.nameTag === right.nameTag &&
    left.color === right.color &&
    left.beamX === right.beamX &&
    left.beamY === right.beamY &&
    left.beamZ === right.beamZ &&
    left.showBottom === right.showBottom &&
    left.fallingBlock === right.fallingBlock;

/**
 * Projects the active entity definition and runtime state into client-facing metadata.
 *
 * These are component-to-protocol mappings, shared by every entity with the same active data.
 * New component metadata belongs in this projection rather than in per-entity body code. What the
 * components alone decide is read once per component set; only the entity's own state is read here.
 *
 * @param leashHolderId - Runtime id of the entity holding this entity's leash, when one is loaded.
 */
export const actorMetadataProjection = (entity: DataEntity, leashHolderId?: number): ActorMetadataProjection => {
    const { body } = entity;
    const facts = componentFactsOf(entity);
    const color = body.color ?? facts.componentColor;
    const flags: ActorFlagProjection[] = [
        { flag: ActorFlags.CANCLIMB, value: facts.canClimb },
        { flag: ActorFlags.ALWAYS_SHOW_NAME, value: facts.alwaysShowName },
        { flag: MetadataFlag.ONFIRE, value: body.fireTicks > 0 },
        { flag: ActorFlags.CANSWIM, value: facts.canSwim },
        { flag: ActorFlags.CANFLY, value: facts.canFly },
        { flag: ActorFlags.CANWALK, value: facts.canWalk },
        { flag: ActorFlags.CAN_POWER_JUMP, value: facts.canPowerJump },
        { flag: ActorFlags.CAN_DASH, value: facts.canDash },
        { flag: ActorFlags.WASD_CONTROLLED, value: facts.wasdControlled },
        { flag: ActorFlags.WASD_FREE_CAMERA_CONTROLLED, value: facts.freeCameraControlled },
        { flag: ActorFlags.CAN_USE_VERTICAL_MOVEMENT_ACTION, value: facts.verticalMovement },
        { flag: ActorFlags.FIRE_IMMUNE, value: facts.fireImmune },
        { flag: ActorFlags.OUT_OF_CONTROL, value: facts.outOfControl },
        { flag: ActorFlags.SWIMMING, value: facts.canSwim && body.conditions.has('in_water') },
        { flag: MetadataFlag.AFFECTED_BY_GRAVITY, value: facts.affectedByGravity },
        { flag: MetadataFlag.HAS_COLLISION, value: facts.hasCollision },
        { flag: ActorFlags.COLLIDABLE, value: facts.collidable },
        { flag: MetadataFlag.IGNITED, value: body.fuseTicks !== undefined || facts.ignited },
        { flag: ActorFlags.POWERED, value: facts.powered },
        { flag: ActorFlags.SADDLED, value: facts.saddled },
        { flag: ActorFlags.LEASHED, value: leashHolderId !== undefined },
        { flag: ActorFlags.CHESTED, value: facts.chested },
        { flag: ActorFlags.IS_ILLAGER_CAPTAIN, value: facts.illagerCaptain },
        { flag: ActorFlags.SHAKING, value: facts.shaking },
        { flag: ActorFlags.HIDDEN_WHEN_INVISIBLE, value: facts.hiddenWhenInvisible },
        { flag: ActorFlags.STACKABLE, value: facts.stackable },
        { flag: ActorFlags.IS_PREGNANT, value: facts.pregnant },
        { flag: ActorFlags.STUNNED, value: facts.stunned },
        { flag: ActorFlags.BODY_ROTATION_ALWAYS_FOLLOWS_HEAD, value: facts.bodyFollowsHead },
        { flag: ActorFlags.BODY_ROTATION_BLOCKED, value: facts.bodyBlocked },
        { flag: ActorFlags.USES_UNIFORM_AIR_DRAG, value: facts.uniformAirDrag },
        { flag: ActorFlags.RENDERS_WHEN_INVISIBLE, value: facts.rendersWhenInvisible },
        { flag: ActorFlags.ROTATION_AXIS_ALIGNED, value: facts.axisAligned },
        { flag: ActorFlags.ROTATION_LOCKED_TO_VEHICLE, value: facts.lockedToVehicle },
        { flag: ActorFlags.USES_LEGACY_FRICTION, value: facts.legacyFriction },
        { flag: ActorFlags.TAMED, value: body.owner !== undefined || facts.tamed },
        { flag: ActorFlags.BABY, value: facts.baby },
        { flag: ActorFlags.SHEARED, value: facts.sheared },
        // Java's DATA_SHOW_BOTTOM defaults to true, so an unset record keeps the end
        // crystal's base plate; only the crystal's render controller reads the flag.
        { flag: ActorFlags.SHOW_BOTTOM, value: body.showBottom !== false }
    ];
    const properties: ActorPropertyProjection[] = [
        { kind: 'float', id: MetadataFlag.SCALE, value: facts.scale },
        { kind: 'int', id: MetadataFlag.FUSE_TIME, value: body.fuseTicks ?? 0 },
        { kind: 'long', id: MetadataFlag.ENTITY_LEAD_HOLDER_ID, value: BigInt(leashHolderId ?? -1) },
        { kind: 'string', id: MetadataFlag.NAMETAG, value: body.nameTag ?? '' },
        { kind: 'string', id: ActorDataID.INTERACT_TEXT, value: facts.interactText }
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
    if (typeof facts.color2 === 'number')
        properties.push({ kind: 'byte', id: ActorDataID.COLOR_2_INDEX, value: facts.color2 });

    if (facts.fallingBlock) {
        const block = entity.spawnData?.['block'];
        if (typeof block === 'string') {
            const runtimeId = BlockRuntimeIds.tryGetByName(block);
            if (runtimeId !== null) properties.push({ kind: 'int', id: MetadataFlag.VARIANT, value: runtimeId });
        }
    } else if (typeof facts.variant === 'number') {
        properties.push({ kind: 'int', id: MetadataFlag.VARIANT, value: facts.variant });
    }

    // A villager's outfit is two numbers on top of its profession: the biome skin the client
    // reads as `mark_variant`, and the skin it was given at spawn. Without them every villager
    // wears the plains clothes of an unskilled one.
    if (typeof facts.markVariant === 'number')
        properties.push({ kind: 'int', id: ActorDataID.MARK_VARIANT, value: facts.markVariant });
    if (typeof facts.skinId === 'number')
        properties.push({ kind: 'int', id: ActorDataID.SKIN_ID, value: facts.skinId });

    return { flags, properties };
};

/** Applies one translated metadata view to the network-facing entity body. */
export const applyActorMetadataProjection = (
    body: { readonly metadata: Metadata },
    projection: ActorMetadataProjection
): void => {
    for (const { flag, value } of projection.flags) body.metadata.setGenericFlag(flag, value);
    for (const property of projection.properties) {
        if (property.kind === 'byte') body.metadata.setPropertyValue(property.id, FlagType.BYTE, property.value);
        else if (property.kind === 'float') body.metadata.setFloat(property.id, property.value);
        else if (property.kind === 'int') body.metadata.setInt(property.id, property.value);
        else if (property.kind === 'long') body.metadata.setLong(property.id, property.value);
        else if (property.kind === 'position')
            body.metadata.setPropertyValue(
                property.id,
                FlagType.POSITION,
                new Vector3(property.value.x, property.value.y, property.value.z)
            );
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
            if (next === undefined || entry.kind !== next.kind || entry.id !== next.id) return false;
            if (entry.kind === 'position' && next.kind === 'position')
                return (
                    entry.value.x === next.value.x && entry.value.y === next.value.y && entry.value.z === next.value.z
                );
            return entry.value === next.value;
        })
    );
};

/**
 * Translates live Bedrock entity components into the actor metadata a client renders.
 *
 * Component semantics belong to the data-driven entity runtime, while actor flags are a wire
 * representation. Keeping that translation here lets every entity use the same projection and
 * keeps the live-body mirror independent of individual component names.
 */
import { navigationProfile } from '@jsprismarine/entity-goals';
import { isRecord } from '@jsprismarine/entities';
import { ActorFlags } from '@jsprismarine/minecraft/ActorFlags';

import { BlockRuntimeIds } from '../../block/state/BlockRuntimeIds';
import type { Entity } from '../Entity';
import { MetadataFlag } from '../Metadata';
import type { DataEntity } from './DataEntity';

/** One actor flag and the value the component state projects onto it. */
interface ActorFlagProjection {
    readonly flag: number;
    readonly value: boolean;
}

/** One scalar actor property and its wire type. */
type ActorPropertyProjection =
    | { readonly kind: 'float'; readonly id: number; readonly value: number }
    | { readonly kind: 'int'; readonly id: number; readonly value: number };

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
 */
export const actorMetadataProjection = (entity: DataEntity): ActorMetadataProjection => {
    const { instance, body } = entity;
    const navigation = navigationProfile(instance);
    const canSwim =
        navigation.canSwim ||
        navigation.canFloat ||
        navigation.isAmphibious ||
        instance.hasComponent('minecraft:behavior.float');
    const physics = instance.componentParams('minecraft:physics');
    const scale = instance.componentParams('minecraft:scale');
    const flags: ActorFlagProjection[] = [
        { flag: ActorFlags.CANSWIM, value: canSwim },
        { flag: ActorFlags.SWIMMING, value: canSwim && body.conditions.has('in_water') },
        {
            flag: MetadataFlag.AFFECTED_BY_GRAVITY,
            value: isRecord(physics) && physics.hasGravity === true
        },
        { flag: MetadataFlag.HAS_COLLISION, value: !isRecord(physics) || physics.hasCollision !== false },
        { flag: MetadataFlag.IGNITED, value: body.fuseTicks !== undefined },
        { flag: ActorFlags.POWERED, value: instance.hasComponent('minecraft:is_charged') },
        {
            flag: ActorFlags.TAMED,
            value: body.owner !== undefined || instance.hasComponent('minecraft:is_tamed')
        },
        { flag: ActorFlags.BABY, value: instance.hasComponent('minecraft:is_baby') },
        { flag: ActorFlags.SHEARED, value: instance.hasComponent('minecraft:is_sheared') }
    ];
    const properties: ActorPropertyProjection[] = [
        { kind: 'float', id: MetadataFlag.SCALE, value: typeof scale === 'number' ? scale : 1 },
        { kind: 'int', id: MetadataFlag.FUSE_TIME, value: body.fuseTicks ?? 0 }
    ];

    if (instance.hasComponent('jsprismarine:falling_block')) {
        const block = entity.spawnData?.['block'];
        if (typeof block === 'string') {
            const runtimeId = BlockRuntimeIds.tryGetByName(block);
            if (runtimeId !== null) properties.push({ kind: 'int', id: MetadataFlag.VARIANT, value: runtimeId });
        }
    }

    return { flags, properties };
};

/** Applies one translated metadata view to the network-facing entity body. */
export const applyActorMetadataProjection = (body: Entity, projection: ActorMetadataProjection): void => {
    for (const { flag, value } of projection.flags) body.metadata.setGenericFlag(flag, value);
    for (const property of projection.properties) {
        if (property.kind === 'float') body.metadata.setFloat(property.id, property.value);
        else body.metadata.setInt(property.id, property.value);
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

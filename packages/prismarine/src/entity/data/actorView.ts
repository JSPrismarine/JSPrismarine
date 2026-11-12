/**
 * What a client is shown of a store entity, as one plain view.
 *
 * A store actor (`storeActors.ts`) shows an entity from live store state and the entity replica
 * (`network/replica/EntityReplica.ts`) from the change log. Both build an {@link EntityView}
 * through the same helpers, here and in `actorMetadata.ts`, so the two cannot drift apart, and a
 * test can hold one against the other.
 */
import type { EntityPosition } from '@jsprismarine/entities';
import { Attribute, AttributeIds, Attributes } from '@jsprismarine/protocol/wire/structures/Attribute';
import type { SyncedProperties } from '@jsprismarine/protocol/wire/structures/SyncedProperties';

import { syncedPropertiesOf } from '../../network/actorProperties';
import type { MobEquipmentSet } from '../equipment';
import type { StatusEffect } from '../StatusEffect';
import { actorMetadataProjection } from './actorMetadata';
import type { ActorMetadataProjection } from './actorMetadata';
import type { DataEntity } from './DataEntity';

/** Where an entity stands and faces, which a move is measured from. */
export interface ShownPose {
    readonly x: number;
    readonly y: number;
    readonly z: number;
    readonly yaw: number;
    readonly pitch: number;
}

/** The health a client is shown: the current value and the most it can be. */
export interface ShownHealth {
    readonly current: number;
    readonly max: number;
}

/**
 * The attributes a client is sent for an entity with the given health.
 *
 * The type's maximum rather than `Attributes.getDefaults`' twenty, so a client draws a ten-health
 * cow with five hearts instead of with two and a half. A type with no health is sent none, so an
 * armor stand is not drawn as a living thing.
 * @param health - The entity's health, or undefined for a type with none.
 */
export const healthAttributesOf = (health: ShownHealth | undefined): Attributes => {
    const attributes = new Attributes(health === undefined ? [] : Attributes.getDefaults());
    if (health !== undefined)
        attributes.setAttribute(
            new Attribute({
                name: AttributeIds.Health,
                min: 0,
                max: health.max,
                def: health.max,
                value: health.current
            })
        );
    return attributes;
};

/**
 * Everything a client is shown of one store entity that its store state decides: where it is,
 * its metadata, its health, its synced properties, its status effects and what it wears.
 *
 * What a player's own components add (breath, sprinting, flight) and what a session holds of a
 * player (its skin, its name and its inventory's equipment) are not part of it.
 */
export type EntityView = {
    readonly identifier: string;
    readonly pose: ShownPose;
    readonly velocity: EntityPosition;
    readonly onGround: boolean;
    readonly metadata: ActorMetadataProjection;
    readonly health: ShownHealth | undefined;
    readonly properties: SyncedProperties;
    readonly statusEffects: readonly StatusEffect[];
    readonly equipment: MobEquipmentSet;
};

/**
 * The view of a live store entity.
 * @param leashHolderId - Runtime id of the entity holding its leash, when one is loaded.
 */
export const entityViewOf = (entity: DataEntity, leashHolderId?: number): EntityView => {
    const { body, instance } = entity;
    const at = body.position;
    const health = instance.attributes.get('health');
    return {
        identifier: entity.identifier,
        pose: { x: at.x, y: at.y, z: at.z, yaw: body.yaw, pitch: body.pitch },
        velocity: { ...body.velocity },
        onGround: body.conditions.has('on_ground'),
        metadata: actorMetadataProjection(entity, leashHolderId),
        health: health === undefined ? undefined : { current: health.current, max: health.max },
        properties: syncedPropertiesOf(instance.properties),
        statusEffects: [...body.statusEffects.values()],
        equipment: body.equipment
    };
};

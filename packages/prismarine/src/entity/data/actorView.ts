/**
 * What a client is shown of a store entity besides its metadata, from plain values.
 *
 * A store actor (`storeActors.ts`) shows an entity from live store state and the entity replica
 * (`network/replica/EntityReplica.ts`) from the change log. Both build the attributes and the
 * pose here, so the two cannot drift apart. The metadata projection is in `actorMetadata.ts`.
 */
import { Attribute, AttributeIds, Attributes } from '@jsprismarine/protocol/wire/structures/Attribute';

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

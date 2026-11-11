import { Entity } from '../entity/Entity';
import type { Position } from '../world/Position';
import type { Attribute } from '@jsprismarine/protocol/wire/structures/Attribute';

/**
 * A legacy entity body of any type, for the tests that still meet one.
 *
 * The server builds none: every entity but a player is a store entity, and a saved actor no pack
 * declares comes back as an inert one. The tests of code that still takes a legacy `Entity` use
 * this as the mob in front of it, until that code reads store actors.
 */
export class GenericEntity extends Entity {
    private readonly identifier: string;

    /** Creates a generic actor body with its serialized type identifier. */
    public constructor({
        identifier,
        position,
        pitch = 0,
        yaw = 0,
        headYaw = 0,
        attributes,
        runtimeId
    }: {
        identifier: string;
        position: Position;
        pitch?: number;
        yaw?: number;
        headYaw?: number;
        attributes?: Attribute[];
        /** An id already drawn from the shared counter; see `Entity`'s constructor. */
        runtimeId?: bigint;
    }) {
        super({ position, pitch, yaw, headYaw, attributes, ...(runtimeId === undefined ? {} : { runtimeId }) });
        this.identifier = identifier;

        // Again, now that there is an identifier to look the size up by. Every other entity knows
        // its type from a static, which is resolved before `super()` returns; this one carries it
        // in a field, which is not assigned until the line above - so the size the base
        // constructor worked out was the size of an unknown entity.
        this.applySize();
    }

    public override getType(): string {
        return this.identifier;
    }
}

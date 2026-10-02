import { Entity } from './Entity';
import type { Position } from '../world/Position';

/**
 * An entity the server has no class for.
 *
 * Its identifier comes from the file rather than from a constant, so a llama restored from a world
 * this server does not model still says it is a llama - which is what the client needs in order to
 * render it. Everything else about it rides along in {@link Entity.persistentNbt}.
 *
 * Without this, loading a world would mean either dropping every unmodelled mob or refusing to
 * load at all; a wolf would vanish because nobody has written a Wolf class yet.
 */
export class GenericEntity extends Entity {
    private readonly identifier: string;

    public constructor({
        identifier,
        position,
        pitch = 0,
        yaw = 0,
        headYaw = 0
    }: {
        identifier: string;
        position: Position;
        pitch?: number;
        yaw?: number;
        headYaw?: number;
    }) {
        super({ position, pitch, yaw, headYaw });
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

export default GenericEntity;

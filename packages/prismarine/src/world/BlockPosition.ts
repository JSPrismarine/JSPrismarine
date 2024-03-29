import Vector3 from '../math/Vector3';
import { BlockPos } from '@jsprismarine/protocol';

/**
 * Represents a block position in the world.
 */
export default class BlockPosition extends BlockPos {
    /**
     * Creates a BlockPosition from a Vector3.
     * @param vec - The Vector3 to create the BlockPosition from.
     * @returns A new BlockPosition object.
     */
    public static fromVector3(vec: Vector3): BlockPosition {
        const position = vec.floor();
        return new BlockPosition(position.getX(), position.getY(), position.getZ());
    }

    public getX(): number {
        return this.x;
    }

    public getY(): number {
        return this.y;
    }

    public getZ(): number {
        return this.z;
    }
}

import { Vector3 } from '@jsprismarine/math';

export default class BlockPosition extends Vector3 {
    public static fromVector3(vec: Vector3): BlockPosition {
        const position = vec.floor();
        return new BlockPosition(position.getX(), position.getY(), position.getZ());
    }
}

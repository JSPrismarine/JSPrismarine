import type BinaryStream from '@jsprismarine/binaryutils';
import { NetworkUtil as WireUtil } from '@jsprismarine/protocol/wire/networkUtil';
import BlockPosition from '../world/BlockPosition';

/**
 * The shared wire helpers, with block positions in this package's `BlockPosition`.
 *
 * The helpers themselves live in `@jsprismarine/protocol`, which owns the wire format and has
 * no `BlockPosition`: it reads the three signed varints back as a plain `Vector3`. Server code
 * expects the subclass, so the one method whose return type differs is narrowed here and
 * everything else is inherited unchanged.
 */
export class NetworkUtil extends WireUtil {
    /**
     * Deserialize a `BlockPosition` from a `BinaryStream`.
     * @param stream - The network stream.
     * @returns The deserialized `BlockPosition`.
     */
    public static override readBlockPosition(stream: BinaryStream): BlockPosition {
        const position = super.readBlockPosition(stream);
        return new BlockPosition(position.getX(), position.getY(), position.getZ());
    }
}

import NetworkStructure from '../NetworkStructure';

import type BinaryStream from '@jsprismarine/binaryutils';

/**
 * The `VoxelShapes::SerializableCells` of a shape: a grid of `X Size` by `Y Size` by `Z Size`
 * cells and a flag per cell saying whether it is solid.
 */
export interface SerializableCells {
    /** `X Size`, the number of cells along X, 0 to 127. */
    xSize: number;
    /** `Y Size`, the number of cells along Y, 0 to 127. */
    ySize: number;
    /** `Z Size`, the number of cells along Z, 0 to 127. */
    zSize: number;
    /**
     * `Storage`: the solid flags of all `xSize * ySize * zSize` cells, packed one bit per cell
     * into bytes, as the bytes appear on the wire. Empty for a grid with no cells.
     */
    storage: number[];
}

/**
 * A `VoxelShapes::SerializableVoxelShape`: a block collision shape as a grid of solid and
 * empty cells plus the cell boundaries along each axis, in block units from 0 to 1.
 *
 * Protocol 2193 wire order:
 * 0. `Cells`: `X Size`, `Y Size` and `Z Size` as one byte each, then `Storage` as a varuint32
 *    count followed by that many bytes.
 * 1. `X Coordinates`: varuint32 count, then one little-endian float per boundary. A grid with
 *    `X Size` cells has `X Size + 1` boundaries.
 * 2. `Y Coordinates`: the same along Y.
 * 3. `Z Coordinates`: the same along Z.
 *
 * `packages/bedrock-data/src/resources/voxel_shapes.json` lists the vanilla shapes under
 * `shapes` with these fields in camel case, so one entry maps onto the constructor
 * parameters as they are.
 * {@link https://mojang.github.io/bedrock-protocol-docs/1.26.51/types/voxel-shapes-serializable-voxel-shape/}
 */
export default class SerializableVoxelShape extends NetworkStructure {
    /**
     * Creates a shape. The defaults build the docs' empty shape, handle 0 of the vanilla
     * registry, so the static `deserialize` can construct an instance before reading the stream.
     * @param cells - `Cells`, the grid and its solid flags.
     * @param xCoordinates - `X Coordinates`, the cell boundaries along X.
     * @param yCoordinates - `Y Coordinates`, the cell boundaries along Y.
     * @param zCoordinates - `Z Coordinates`, the cell boundaries along Z.
     */
    public constructor(
        public cells: SerializableCells = { xSize: 0, ySize: 0, zSize: 0, storage: [] },
        public xCoordinates: number[] = [0],
        public yCoordinates: number[] = [0],
        public zCoordinates: number[] = [0]
    ) {
        super();
    }

    private static writeFloats(stream: BinaryStream, values: number[]): void {
        stream.writeUnsignedVarInt(values.length);
        for (const value of values) {
            stream.writeFloatLE(value);
        }
    }

    private static readFloats(stream: BinaryStream): number[] {
        const values: number[] = [];
        let count = stream.readUnsignedVarInt();
        while (count-- > 0) {
            values.push(stream.readFloatLE());
        }
        return values;
    }

    /** Writes the cells and the three coordinate lists in wire order. */
    public serialize(stream: BinaryStream): void {
        stream.writeByte(this.cells.xSize);
        stream.writeByte(this.cells.ySize);
        stream.writeByte(this.cells.zSize);
        stream.writeUnsignedVarInt(this.cells.storage.length);
        stream.write(Buffer.from(this.cells.storage));

        SerializableVoxelShape.writeFloats(stream, this.xCoordinates);
        SerializableVoxelShape.writeFloats(stream, this.yCoordinates);
        SerializableVoxelShape.writeFloats(stream, this.zCoordinates);
    }

    /** Reads the cells and the three coordinate lists in wire order. */
    public deserialize(stream: BinaryStream): void {
        const xSize = stream.readByte();
        const ySize = stream.readByte();
        const zSize = stream.readByte();
        const storage = [...stream.read(stream.readUnsignedVarInt())];
        this.cells = { xSize, ySize, zSize, storage };

        this.xCoordinates = SerializableVoxelShape.readFloats(stream);
        this.yCoordinates = SerializableVoxelShape.readFloats(stream);
        this.zCoordinates = SerializableVoxelShape.readFloats(stream);
    }
}

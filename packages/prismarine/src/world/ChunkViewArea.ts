/**
 * The chunks around a player that the player's client holds, as offsets from the chunk the
 * player stands in.
 *
 * One area answers both questions a session asks about a chunk: whether to send it, and whether
 * the client still has it. They must have the same answer. The session once sent by a circle and
 * forgot by a square, so a chunk in a corner of the square stayed counted as held after the
 * client had dropped it, and was never sent again when the player came back.
 *
 * The shape is the client's, not a free choice: a Bedrock client keeps the chunks inside the
 * radius `NetworkChunkPublisherUpdate` names and drops the rest. Another shape, such as a square,
 * has to stay inside what the client keeps, or be published to it in a way it understands.
 */
export interface ChunkViewArea {
    /** The farthest a chunk inside can be from the center on either axis, in chunks. */
    readonly reach: number;
    /**
     * Whether a chunk is inside.
     * @param dx - Chunks east of the center chunk; negative for west.
     * @param dz - Chunks south of the center chunk; negative for north.
     */
    contains(dx: number, dz: number): boolean;
}

/**
 * A circle of chunks, which is the area a Bedrock client keeps around the published position.
 * @param radius - The radius in chunks; a chunk exactly that far away is inside.
 */
export const circularViewArea = (radius: number): ChunkViewArea => ({
    reach: radius,
    contains: (dx, dz) => dx * dx + dz * dz <= radius * radius
});

/**
 * The area a player with a view distance holds. Change the shape here and nowhere else: every
 * caller sends and forgets by what this returns.
 * @param viewDistance - The player's view distance in chunks.
 */
export const chunkViewArea = (viewDistance: number): ChunkViewArea => circularViewArea(viewDistance);

/**
 * Every offset inside an area, row by row.
 * @param area - The area.
 * @returns The offsets, as `[dx, dz]`.
 */
export const offsetsIn = (area: ChunkViewArea): [dx: number, dz: number][] => {
    const offsets: [number, number][] = [];
    for (let dx = -area.reach; dx <= area.reach; dx++) {
        for (let dz = -area.reach; dz <= area.reach; dz++) {
            if (area.contains(dx, dz)) offsets.push([dx, dz]);
        }
    }
    return offsets;
};

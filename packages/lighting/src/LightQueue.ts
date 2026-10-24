/** One entry of a {@link LightQueue}. The queue reuses a single instance, so copy what you keep. */
export interface LightNode {
    /** World x. */
    x: number;
    /** World y. */
    y: number;
    /** World z. */
    z: number;
    /** The level the node carries. Increase nodes ignore it; decrease nodes hold the level that went away. */
    level: number;
}

const COMPACT_THRESHOLD = 8192;

/**
 * A first-in first-out queue of light nodes held as a flat array of numbers, four per node.
 *
 * A light flood enqueues one node per block it touches, so the queue is the engine's hottest
 * allocation site. Packing the fields into one `number[]` and handing out a single reused
 * {@link LightNode} keeps a flood of a hundred thousand blocks from allocating a hundred thousand
 * objects.
 */
export class LightQueue {
    private readonly items: number[] = [];
    private head = 0;
    private readonly cursor: LightNode = { x: 0, y: 0, z: 0, level: 0 };

    /** The number of nodes waiting. */
    public get size(): number {
        return (this.items.length - this.head) >> 2;
    }

    /**
     * Appends a node.
     * @param {number} x - World x.
     * @param {number} y - World y.
     * @param {number} z - World z.
     * @param {number} level - The level the node carries; 0 for an increase node.
     */
    public push(x: number, y: number, z: number, level = 0): void {
        this.items.push(x, y, z, level);
    }

    /**
     * Removes and returns the oldest node.
     * @returns {LightNode | undefined} The node, or `undefined` when the queue is empty. The same
     * object comes back from every call and its fields change on the next `shift`.
     */
    public shift(): LightNode | undefined {
        if (this.head === this.items.length) return undefined;

        const cursor = this.cursor;
        cursor.x = this.items[this.head]!;
        cursor.y = this.items[this.head + 1]!;
        cursor.z = this.items[this.head + 2]!;
        cursor.level = this.items[this.head + 3]!;
        this.head += 4;

        if (this.head === this.items.length) {
            this.items.length = 0;
            this.head = 0;
        } else if (this.head >= COMPACT_THRESHOLD && this.head * 2 >= this.items.length) {
            this.items.splice(0, this.head);
            this.head = 0;
        }

        return cursor;
    }
}

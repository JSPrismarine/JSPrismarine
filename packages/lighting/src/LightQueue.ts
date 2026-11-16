import { columnKeyOf } from './coordinates';

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

/** The nodes queued in one chunk column, four numbers per node, the oldest at `head`. */
interface ColumnNodes {
    readonly items: number[];
    head: number;
}

/**
 * A queue of light nodes, kept per chunk column as flat arrays of numbers, four per node.
 *
 * A light flood enqueues one node per block it touches, so the queue is the engine's hottest
 * allocation site. Packing the fields into `number[]`s and handing out a single reused
 * {@link LightNode} keeps a flood of a hundred thousand blocks from allocating a hundred thousand
 * objects.
 *
 * The nodes of one column come out in the order they went in. {@link LightQueue.shift} empties the
 * column that has waited longest before it starts the next, and {@link LightQueue.takeWithin}
 * takes the nodes of a rectangle of columns and reads no other column, so finishing one chunk's
 * light costs the same however much is queued elsewhere.
 */
export class LightQueue {
    /** The columns that hold a node, in the order each got its first. */
    private readonly columns = new Map<number, ColumnNodes>();
    private count = 0;
    /** The column the last push went to. A flood pushes into one column many times in a row. */
    private pushKey = Number.NaN;
    private pushColumn: ColumnNodes | undefined;
    /** The column {@link LightQueue.shift} is emptying. */
    private frontKey = Number.NaN;
    private front: ColumnNodes | undefined;
    private readonly cursor: LightNode = { x: 0, y: 0, z: 0, level: 0 };

    /**
     * @param byColumn - Counts of queued nodes by chunk column, shared by every queue of one
     *   engine, so it can say which columns still have light to settle without asking each queue.
     */
    public constructor(private readonly byColumn?: Map<number, number>) {}

    /** The number of nodes waiting. */
    public get size(): number {
        return this.count;
    }

    /**
     * Appends a node.
     * @param {number} x - World x.
     * @param {number} y - World y.
     * @param {number} z - World z.
     * @param {number} level - The level the node carries; 0 for an increase node.
     */
    public push(x: number, y: number, z: number, level = 0): void {
        const key = columnKeyOf(x >> 4, z >> 4);
        let column = key === this.pushKey ? this.pushColumn : this.columns.get(key);
        if (column === undefined) {
            column = { items: [], head: 0 };
            this.columns.set(key, column);
        }
        this.pushKey = key;
        this.pushColumn = column;

        column.items.push(x, y, z, level);
        this.count++;
        const counts = this.byColumn;
        if (counts !== undefined) counts.set(key, (counts.get(key) ?? 0) + 1);
    }

    /**
     * Removes and returns the oldest node of the column that has waited longest.
     * @returns {LightNode | undefined} The node, or `undefined` when the queue is empty. The same
     * object comes back from every call and its fields change on the next `shift` or
     * {@link LightQueue.takeWithin}.
     */
    public shift(): LightNode | undefined {
        let column = this.front;
        if (column === undefined) {
            const first = this.columns.entries().next();
            if (first.done === true) return undefined;

            [this.frontKey, column] = first.value;
            this.front = column;
        }

        this.take(this.frontKey, column);
        return this.cursor;
    }

    /**
     * Removes every node inside a rectangle of chunk columns and hands each to `visit`. A node
     * `visit` queues inside the rectangle is handed over by the same call, so without a limit the
     * rectangle holds none when it returns. No column outside the rectangle is read.
     *
     * The columns take turns, and a turn hands over the nodes the column held when it started.
     * A flood therefore spreads through the rectangle one step at a time from every source in it,
     * as it does through a single queue, and not to the end of one column before the next begins.
     * @param {number} minChunkX - The lowest chunk x of the rectangle.
     * @param {number} maxChunkX - The highest chunk x of the rectangle, inclusive.
     * @param {number} minChunkZ - The lowest chunk z of the rectangle.
     * @param {number} maxChunkZ - The highest chunk z of the rectangle, inclusive.
     * @param {(node: LightNode) => void} visit - Receives each node. It may push to this queue and
     * must not take from it. The same object comes back on every call.
     * @param {number} [limit] - The most nodes to hand over. Unbounded when omitted; with a limit,
     * the rectangle can still hold nodes when this returns.
     * @returns {number} How many nodes it handed over.
     */
    public takeWithin(
        minChunkX: number,
        maxChunkX: number,
        minChunkZ: number,
        maxChunkZ: number,
        visit: (node: LightNode) => void,
        limit: number = Number.POSITIVE_INFINITY
    ): number {
        let count = 0;
        for (;;) {
            let found = false;
            for (let chunkX = minChunkX; chunkX <= maxChunkX; chunkX++) {
                for (let chunkZ = minChunkZ; chunkZ <= maxChunkZ; chunkZ++) {
                    const key = columnKeyOf(chunkX, chunkZ);
                    const column = this.columns.get(key);
                    if (column === undefined) continue;

                    found = true;
                    // What `visit` appends to this column waits for the column's next turn. The
                    // column is let go with its last node, and by then this turn is over.
                    for (let turn = (column.items.length - column.head) >> 2; turn > 0; turn--) {
                        if (count >= limit) return count;

                        this.take(key, column);
                        count++;
                        visit(this.cursor);
                    }
                }
            }
            if (!found) return count;
        }
    }

    /** Moves a column's oldest node into the cursor, and lets the column go with its last node. */
    private take(key: number, column: ColumnNodes): void {
        const { items } = column;
        const head = column.head;
        const cursor = this.cursor;
        cursor.x = items[head]!;
        cursor.y = items[head + 1]!;
        cursor.z = items[head + 2]!;
        cursor.level = items[head + 3]!;
        column.head = head + 4;
        this.count--;

        const counts = this.byColumn;
        if (counts !== undefined) {
            const left = (counts.get(key) ?? 1) - 1;
            if (left === 0) counts.delete(key);
            else counts.set(key, left);
        }

        if (column.head === items.length) {
            this.columns.delete(key);
            // Neither may be reached again: the next push to this column starts a new one.
            if (key === this.pushKey) this.pushColumn = undefined;
            if (key === this.frontKey) this.front = undefined;
        } else if (column.head >= COMPACT_THRESHOLD && column.head * 2 >= items.length) {
            items.splice(0, column.head);
            column.head = 0;
        }
    }
}

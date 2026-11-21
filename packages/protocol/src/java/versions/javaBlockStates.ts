/**
 * Java Edition's block state ids, which a chunk and a block update name every block by.
 *
 * A release's ids come from `blockStates.json` beside its packet ids, which
 * `pnpm --filter @jsprismarine/bedrock-data run dump:java-protocol` writes: one row a block, its
 * first state's id and its properties in the order that numbers its states. A state's id is the
 * first id plus its value indices read as a mixed-radix number over those properties.
 */
import { ProtocolWireErrors } from '@jsprismarine/errors/protocol/wire';

/** One block's states: its name, the id of its first state, and its properties in the order that numbers them. */
export type JavaBlockStateRow = readonly [
    name: string,
    firstId: number,
    properties: readonly (readonly [string, readonly string[]])[]
];

const isRow = (row: unknown): row is JavaBlockStateRow =>
    Array.isArray(row) &&
    typeof row[0] === 'string' &&
    typeof row[1] === 'number' &&
    Array.isArray(row[2]) &&
    row[2].every(
        (property: unknown) =>
            Array.isArray(property) &&
            typeof property[0] === 'string' &&
            Array.isArray(property[1]) &&
            property[1].every((value: unknown) => typeof value === 'string')
    );

/**
 * A release's `blockStates.json`, checked row by row.
 * @param rows - The parsed file.
 * @returns The rows.
 * @throws {Error} At the first row that is not `[name, firstId, properties]`.
 */
export const javaBlockStateRows = (rows: readonly unknown[]): JavaBlockStateRow[] =>
    rows.map((row, index) => {
        if (!isRow(row)) throw new ProtocolWireErrors.JavaBlockStateRowMalformed({ index });
        return row;
    });

/** One release's block state ids. */
export class JavaBlockStates {
    private readonly rows = new Map<string, JavaBlockStateRow>();
    /** The rows in id order, which {@link JavaBlockStates.stateOf} searches. */
    private readonly ordered: readonly JavaBlockStateRow[];

    /**
     * @param rows - The release's rows.
     */
    /** How many states the release has, which sizes a direct paletted container's entries. */
    public readonly size: number;

    public constructor(rows: readonly JavaBlockStateRow[]) {
        let size = 0;
        for (const row of rows) {
            this.rows.set(row[0], row);
            size = Math.max(size, row[1] + row[2].reduce((count, [, values]) => count * values.length, 1));
        }
        this.size = size;
        this.ordered = [...rows].sort((a, b) => a[1] - b[1]);
    }

    /**
     * The block and property values of a state id, the inverse of {@link JavaBlockStates.idOf}.
     * @param id - The state's network id.
     * @returns The block's name and every property's value, or undefined for an id past the last state.
     */
    public stateOf(id: number): { name: string; properties: Record<string, string> } | undefined {
        // Rows are in id order, each block's states one contiguous run.
        let low = 0;
        let high = this.ordered.length - 1;
        while (low <= high) {
            const middle = (low + high) >> 1;
            const row = this.ordered[middle]!;
            const count = row[2].reduce((product, [, values]) => product * values.length, 1);
            if (id < row[1]) high = middle - 1;
            else if (id >= row[1] + count) low = middle + 1;
            else {
                const properties: Record<string, string> = {};
                let index = id - row[1];
                for (let at = row[2].length - 1; at >= 0; at--) {
                    const [property, values] = row[2][at]!;
                    properties[property] = values[index % values.length]!;
                    index = Math.floor(index / values.length);
                }
                return { name: row[0], properties };
            }
        }
        return undefined;
    }

    /**
     * A state's id.
     * @param name - The block, such as `minecraft:oak_stairs`.
     * @param properties - Every property of the block, as Java names its values.
     * @returns The id, or undefined for a block or a value the release does not have.
     */
    public idOf(name: string, properties: Readonly<Record<string, string>> = {}): number | undefined {
        const row = this.rows.get(name);
        if (row === undefined) return undefined;
        let index = 0;
        for (const [property, values] of row[2]) {
            const at = values.indexOf(properties[property] ?? '');
            if (at === -1) return undefined;
            index = index * values.length + at;
        }
        return row[1] + index;
    }
}

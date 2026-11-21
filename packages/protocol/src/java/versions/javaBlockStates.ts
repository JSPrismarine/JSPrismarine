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

    /**
     * @param rows - The release's rows.
     */
    public constructor(rows: readonly JavaBlockStateRow[]) {
        for (const row of rows) this.rows.set(row[0], row);
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

/** One of a release's static registries: entry names by network id, which the client knows itself. */
export class JavaRegistry {
    private readonly ids: ReadonlyMap<string, number>;

    /**
     * @param names - The entries in network id order.
     */
    public constructor(private readonly names: readonly string[]) {
        this.ids = new Map(names.map((name, id) => [name, id]));
    }

    /** Every entry, in network id order. */
    public get entries(): readonly string[] {
        return this.names;
    }

    /** How many entries the registry has. */
    public get size(): number {
        return this.names.length;
    }

    /**
     * An entry's network id.
     * @param name - The entry, such as `minecraft:player`.
     * @returns The id, or undefined for an entry the release lacks.
     */
    public idOf(name: string): number | undefined {
        return this.ids.get(name);
    }

    /**
     * The entry a network id names.
     * @param id - The id.
     * @returns The name, or undefined past the last entry.
     */
    public nameOf(id: number): string | undefined {
        return this.names[id];
    }
}

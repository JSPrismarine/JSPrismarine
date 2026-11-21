/** What a vanilla server sends a client in the configuration phase, as `capture:java-configuration` records it. */
export interface JavaConfiguration {
    /** The feature flags the server turned on. */
    features: string[];
    /** The data packs the server's registries come from. */
    knownPacks: { namespace: string; id: string; version: string }[];
    /** Each synchronized registry and its entry ids, in the order that gives each its network id. */
    registries: { registry: string; entries: string[] }[];
    /** Each tagged registry's tags, naming entries by network id. */
    tags: { registry: string; tags: { name: string; entries: number[] }[] }[];
}

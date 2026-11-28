/** One Java Edition release the server speaks. */
export interface JavaRelease {
    /** The release id, as the jar and the launcher name it. */
    readonly minecraftVersion: string;
    /** The number a client sends in its handshake. */
    readonly protocolVersion: number;
    /**
     * The resource pack format a client of this release reads, `[major, minor]`, as its jar's
     * `version.json` gives it. A pack built for the release declares it as its `min_format` and
     * `max_format`.
     */
    readonly resourcePackFormat: readonly [number, number];
}

/** A release's packet ids, by phase, direction and Mojang's packet name. */
export type JavaPacketIds = Readonly<
    Record<
        string,
        Readonly<{
            clientbound?: Readonly<Record<string, number>>;
            serverbound?: Readonly<Record<string, number>>;
        }>
    >
>;

/** A release and its packet ids: what a connection that speaks it encodes and decodes with. */
export interface JavaProtocol extends JavaRelease {
    readonly packets: JavaPacketIds;
}

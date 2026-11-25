/** One Java Edition release the server speaks. */
export interface JavaRelease {
    /** The release id, as the jar and the launcher name it. */
    readonly minecraftVersion: string;
    /** The number a client sends in its handshake. */
    readonly protocolVersion: number;
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

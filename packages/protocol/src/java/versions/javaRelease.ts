/** One Java Edition release the server speaks. */
export interface JavaRelease {
    /** The release id, as the jar and the launcher name it. */
    readonly minecraftVersion: string;
    /** The number a client sends in its handshake. */
    readonly protocolVersion: number;
}

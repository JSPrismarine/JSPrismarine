/**
 * The Java Edition releases this server speaks, newest first.
 *
 * Each protocol number is the `protocol_version` in the release's server jar `version.json`,
 * which `javaReleases.test.ts` checks against the pinned jar when the cache holds it. A
 * snapshot's number has bit 30 set, so it sorts above every release.
 */
export interface JavaRelease {
    /** The release id, as the jar and the launcher name it. */
    readonly minecraftVersion: string;
    /** The number a client sends in its handshake. */
    readonly protocolVersion: number;
}

/** The newest release this server speaks, which a server list ping advertises. */
export const NEWEST_JAVA_RELEASE: JavaRelease = { minecraftVersion: '26.3', protocolVersion: 777 };

/** Every release this server speaks, newest first. */
export const JAVA_RELEASES: readonly JavaRelease[] = [NEWEST_JAVA_RELEASE];

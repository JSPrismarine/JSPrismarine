/**
 * The Java Edition releases this server speaks, newest first.
 *
 * Each release's number and packet ids are generated from its server jar by
 * `pnpm --filter @jsprismarine/bedrock-data run dump:java-protocol`, under `versions/<release>/`.
 * A snapshot's number has bit 30 set, so it sorts above every release.
 */
import { PACKETS as PACKETS_26_3 } from './26.3/packets';
import { RELEASE as RELEASE_26_3 } from './26.3/release';
import type { JavaProtocol } from './javaRelease';

/** The newest release this server speaks, which a server list ping advertises. */
export const NEWEST_JAVA_RELEASE: JavaProtocol = { ...RELEASE_26_3, packets: PACKETS_26_3 };

/** Every release this server speaks, newest first. */
export const JAVA_RELEASES: readonly JavaProtocol[] = [NEWEST_JAVA_RELEASE];

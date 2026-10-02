/**
 * Deciding who is near enough to be told about something.
 *
 * Deliberately free of imports. Every decision this server makes about the audience for a
 * packet is one of the functions below, and keeping them dependent on nothing means they can
 * be tested with plain objects - no server, no world, no connection. `World` and
 * `PlayerSession` only ever apply what is decided here.
 *
 * The test is done in chunk space rather than in blocks because that is the unit the client
 * works in: `PlayerSession.needNewChunks` streams terrain in a *disc* of chunks around the
 * player, and an entity or block update outside that disc refers to ground the client does
 * not have.
 */

/** Anything with block coordinates: a `Vector3`, a `Position`, or a stand-in in a test. */
export interface Point3 {
    getX(): number;
    getY(): number;
    getZ(): number;
}

/**
 * Chunks of slack added to every view test.
 *
 * Three things make the true edge ragged: the client's copy of a position is up to a tick
 * behind the server's, terrain is loaded on a circular test but unloaded on a square one, and
 * a chunk is only recorded as sent once its batch has finished compressing. One extra ring of
 * packets costs less than an entity blinking in and out along that edge.
 */
export const VIEW_MARGIN_CHUNKS = 1;

/**
 * The radius assumed for a client that has not negotiated one yet.
 *
 * A player is spawned and can be sent things before `RequestChunkRadiusPacket` arrives, and
 * `player.viewDistance` is zero until it does. Treating that zero literally would give a
 * brand new player an audience of nothing and an empty world; this is the same fallback the
 * chunk path already uses, so the audience matches the terrain that was actually sent.
 */
export const DEFAULT_VIEW_DISTANCE_CHUNKS = 4;

/** Vanilla plays block sounds within about sixteen blocks; a little more is kind to latency. */
export const SOUND_RADIUS = 32;

/** Block cracking and destroy particles: cosmetic, dense, and pointless at a distance. */
export const WORLD_EVENT_RADIUS = 32;

/**
 * The chunk column a block coordinate falls in.
 *
 * Floored before the shift rather than shifted directly - `>>` converts through `ToInt32`,
 * which truncates towards zero, so a bare shift puts everything between -1 and 0 in chunk 0
 * instead of chunk -1. Entity positions are floats, so that case is reached constantly.
 * @param {number} blockCoordinate - A block coordinate, whole or fractional.
 * @returns {number} The chunk coordinate containing it.
 */
export function toChunk(blockCoordinate: number): number {
    return Math.floor(blockCoordinate) >> 4;
}

/**
 * The squared distance between two points, in chunk columns, ignoring height.
 *
 * Height is left out on purpose: terrain is streamed by column, so a client that has a chunk
 * has all of it. Squared because the only thing anyone does with it is compare it to a radius.
 * @param {Point3} a - One point, in block coordinates.
 * @param {Point3} b - The other, in block coordinates.
 * @returns {number} The squared horizontal distance in chunks.
 */
export function chunkDistanceSquared(a: Point3, b: Point3): number {
    const dx = toChunk(a.getX()) - toChunk(b.getX());
    const dz = toChunk(a.getZ()) - toChunk(b.getZ());
    return dx * dx + dz * dz;
}

/**
 * The chunk radius a viewer is treated as having.
 * @param {number} viewDistance - The radius the client negotiated; zero if it has not yet.
 * @returns {number} The radius to use, never zero.
 */
export function effectiveViewDistance(viewDistance: number): number {
    return viewDistance > 0 ? viewDistance : DEFAULT_VIEW_DISTANCE_CHUNKS;
}

export interface ViewTest {
    /** Where the thing happened, in block coordinates. */
    readonly event: Point3;
    /** Where the candidate recipient is, in block coordinates. */
    readonly viewer: Point3;
    /** The recipient's negotiated chunk radius; zero means it has not asked yet. */
    readonly viewDistance: number;
    /**
     * A cap in chunks belonging to the subject rather than the viewer - an entity type's own
     * tracking range. It can only narrow the result, never widen it past what the viewer sees.
     */
    readonly range?: number;
    /** Chunks of slack; defaults to {@link VIEW_MARGIN_CHUNKS}. Negative tightens. */
    readonly margin?: number;
    /** A tighter cap in blocks. Like `range`, it can only narrow. */
    readonly radius?: number;
}

/**
 * Whether a viewer should be told about something that happened at `event`.
 *
 * The circular chunk test, not a square one, because `needNewChunks` loads on
 * `dx² + dz² > viewDistance²` - the chunks a client holds are a disc, so a square test would
 * send updates for four corners it has no ground for. Both forms cost the same.
 * @param {ViewTest} test - Event, viewer, and the radii that apply.
 * @returns {boolean} `true` if the viewer is near enough.
 */
export function isInView(test: ViewTest): boolean {
    const { event, viewer, viewDistance, range, margin = VIEW_MARGIN_CHUNKS, radius } = test;

    // The block radius first: it is the tighter of the two whenever it is given, so rejecting
    // on it saves the chunk arithmetic for sounds and particles, which are the packets that
    // use it and the ones sent most often.
    if (radius !== undefined) {
        const dx = event.getX() - viewer.getX();
        const dy = event.getY() - viewer.getY();
        const dz = event.getZ() - viewer.getZ();
        if (dx * dx + dy * dy + dz * dz > radius * radius) return false;
    }

    const reach = Math.min(effectiveViewDistance(viewDistance), range ?? Number.POSITIVE_INFINITY) + margin;
    if (reach < 0) return false;

    return chunkDistanceSquared(event, viewer) <= reach * reach;
}

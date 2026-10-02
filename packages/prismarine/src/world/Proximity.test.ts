import { describe, expect, it } from 'vitest';
import {
    chunkDistanceSquared,
    DEFAULT_VIEW_DISTANCE_CHUNKS,
    effectiveViewDistance,
    isInView,
    toChunk,
    VIEW_MARGIN_CHUNKS
} from './Proximity';

/** A point at block coordinates, which is all the proximity helpers ask for. */
const at = (x: number, y: number, z: number) => ({ getX: () => x, getY: () => y, getZ: () => z });

/** A point `chunks` chunks east of the origin, in the middle of its chunk. */
const chunksEast = (chunks: number) => at(chunks * 16 + 8, 64, 8);

describe('world', () => {
    describe('Proximity', () => {
        describe('toChunk', () => {
            it('should map whole block coordinates to their chunk', () => {
                expect(toChunk(0)).toBe(0);
                expect(toChunk(15)).toBe(0);
                expect(toChunk(16)).toBe(1);
                expect(toChunk(-1)).toBe(-1);
                expect(toChunk(-16)).toBe(-1);
                expect(toChunk(-17)).toBe(-2);
            });

            it('should floor fractional coordinates rather than truncating them', () => {
                // Entity positions are floats and `>> 4` truncates towards zero, which put
                // everything between -1 and 0 in chunk 0.
                expect(toChunk(-0.5)).toBe(-1);
                expect(toChunk(-16.5)).toBe(-2);
                expect(toChunk(0.5)).toBe(0);
                expect(toChunk(15.9)).toBe(0);
            });
        });

        describe('chunkDistanceSquared', () => {
            it('should ignore height', () => {
                // Terrain is streamed by column, so a client holding a chunk holds all of it.
                expect(chunkDistanceSquared(at(8, 0, 8), at(8, 255, 8))).toBe(0);
            });

            it('should measure in chunks, not blocks', () => {
                expect(chunkDistanceSquared(at(8, 64, 8), chunksEast(3))).toBe(9);
            });
        });

        describe('effectiveViewDistance', () => {
            it('should fall back for a client that has not negotiated one', () => {
                // Taken literally, a zero would give a brand new player an empty world.
                expect(effectiveViewDistance(0)).toBe(DEFAULT_VIEW_DISTANCE_CHUNKS);
            });

            it('should keep a negotiated radius', () => {
                expect(effectiveViewDistance(10)).toBe(10);
            });
        });

        describe('isInView', () => {
            const viewer = at(8, 64, 8);

            it('should include something in the same chunk', () => {
                expect(isInView({ event: at(1, 70, 2), viewer, viewDistance: 10 })).toBe(true);
            });

            it('should include out to the view distance plus the margin', () => {
                expect(isInView({ event: chunksEast(10 + VIEW_MARGIN_CHUNKS), viewer, viewDistance: 10 })).toBe(true);
            });

            it('should exclude one chunk beyond that', () => {
                expect(isInView({ event: chunksEast(10 + VIEW_MARGIN_CHUNKS + 1), viewer, viewDistance: 10 })).toBe(
                    false
                );
            });

            it('should use a circular test rather than a square one', () => {
                // The corner at (r, r) is inside a Chebyshev square and outside a disc. Terrain
                // is loaded on a circular test, so the client has no ground there - this case is
                // what pins the choice down.
                const reach = 10 + VIEW_MARGIN_CHUNKS;
                const corner = at(reach * 16 + 8, 64, reach * 16 + 8);
                expect(isInView({ event: corner, viewer, viewDistance: 10 })).toBe(false);
            });

            it('should give a client that has not negotiated a radius its fallback', () => {
                expect(isInView({ event: chunksEast(2), viewer, viewDistance: 0 })).toBe(true);
                expect(isInView({ event: chunksEast(20), viewer, viewDistance: 0 })).toBe(false);
            });

            describe('range', () => {
                it('should narrow the audience', () => {
                    // Inside the viewer's reach of 10 + margin, outside a range of 6 + margin.
                    const event = chunksEast(8);
                    expect(isInView({ event, viewer, viewDistance: 10 })).toBe(true);
                    expect(isInView({ event, viewer, viewDistance: 10, range: 6 })).toBe(false);
                });

                it('should never widen it past what the viewer can see', () => {
                    // A player's range is 32 chunks, well past any view distance; the viewer's
                    // own radius still decides.
                    expect(isInView({ event: chunksEast(20), viewer, viewDistance: 4, range: 32 })).toBe(false);
                });
            });

            describe('radius', () => {
                it('should narrow to a tighter block distance', () => {
                    expect(isInView({ event: at(48, 64, 8), viewer, viewDistance: 10 })).toBe(true);
                    expect(isInView({ event: at(48, 64, 8), viewer, viewDistance: 10, radius: 16 })).toBe(false);
                });

                it('should never widen past the chunk test', () => {
                    expect(isInView({ event: chunksEast(40), viewer, viewDistance: 10, radius: 100_000 })).toBe(false);
                });

                it('should take height into account, unlike the chunk test', () => {
                    expect(isInView({ event: at(8, 64, 8), viewer, viewDistance: 10, radius: 16 })).toBe(true);
                    expect(isInView({ event: at(8, 200, 8), viewer, viewDistance: 10, radius: 16 })).toBe(false);
                });
            });
        });
    });
});

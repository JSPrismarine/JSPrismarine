import { describe, expect, it } from 'vitest';
import { movedErrorTarget } from './movedErrors';

const moved = { prismarine: { 'prismarine-player-not-found': 'server' } };

describe('movedErrorTarget', () => {
    it("sends an old link to a split domain's error to its module's page", () => {
        expect(movedErrorTarget(moved, '/errors/prismarine', '#prismarine-player-not-found')).toBe(
            '/errors/prismarine/server#prismarine-player-not-found'
        );
    });

    it('leaves other anchors, domains and pages where they are', () => {
        expect(movedErrorTarget(moved, '/errors/prismarine', '#groups')).toBeUndefined();
        expect(movedErrorTarget(moved, '/errors/leveldb', '#prismarine-player-not-found')).toBeUndefined();
        expect(movedErrorTarget(moved, '/errors/prismarine/server', '#prismarine-player-not-found')).toBeUndefined();
    });
});

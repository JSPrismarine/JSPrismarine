import { beforeEach, describe, expect, it, vi } from 'vitest';

import type Server from '../Server';
import GameruleManager from './GameruleManager';

describe('GameruleManager', () => {
    let server: Server;
    let gameruleManager: GameruleManager;

    beforeEach(() => {
        server = vi.fn().mockImplementation(() => ({
            getLogger: () => ({
                error: () => {},
                debug: () => {},
                verbose: () => {}
            }),
            on: vi.fn(),
            emit: vi.fn().mockResolvedValue({})
        }))();
        gameruleManager = new GameruleManager(server);
    });

    it('should set a gamerule', () => {
        const name = 'CommandBlockOutput';
        const value = true;
        const editable = true;

        gameruleManager.setGamerule(name, value, editable);

        const rule = gameruleManager.getGamerule(name);
        expect(rule).toEqual([value, editable]);
    });

    it('should get a gamerule', () => {
        const name = 'CommandBlockOutput';
        const value = true;
        const editable = true;

        gameruleManager.setGamerule(name, value, editable);

        const rule = gameruleManager.getGamerule(name);
        expect(rule).toEqual([value, editable]);
    });

    it('should return null for unknown gamerule', () => {
        const name = 'UnknownGamerule';

        const rule = gameruleManager.getGamerule(name);
        expect(rule).toBeNull();
    });
});

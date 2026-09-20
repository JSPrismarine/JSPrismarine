import { beforeEach, describe, expect, it, vi } from 'vitest';

import type Server from '../Server';
import GameRuleManager from './GameRuleManager';

describe('GameRuleManager', () => {
    let server: Server;
    let gameRuleManager: GameRuleManager;

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
        gameRuleManager = new GameRuleManager(server);
    });

    it('should set a gameRule', () => {
        const name = 'CommandBlockOutput';
        const value = true;
        const editable = true;

        gameRuleManager.setGameRule(name, value, editable);

        const rule = gameRuleManager.getGameRule(name);
        expect(rule).toEqual([value, editable]);
    });

    it('should get a gameRule', () => {
        const name = 'CommandBlockOutput';
        const value = true;
        const editable = true;

        gameRuleManager.setGameRule(name, value, editable);

        const rule = gameRuleManager.getGameRule(name);
        expect(rule).toEqual([value, editable]);
    });

    it('should return null for unknown gameRule', () => {
        const name = 'UnknownGameRule';

        const rule = gameRuleManager.getGameRule(name);
        expect(rule).toBeNull();
    });
});

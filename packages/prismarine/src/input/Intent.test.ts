import { describe, expect, it } from 'vitest';

import { INTENT_KINDS, Intents, isIntentKind, laneOfIntents, PLAYER_ANIMATIONS } from './Intent';

describe('input/Intent', () => {
    it('lists the supported kinds, each once', () => {
        // A literal list, so a kind dropped from the table fails here rather than passing by
        // comparing the table with itself.
        expect([...INTENT_KINDS].sort()).toEqual([
            'animate',
            'answerForm',
            'attackEntity',
            'changeGameMode',
            'chat',
            'closeContainer',
            'damageAnvil',
            'dropHeldItem',
            'eat',
            'editBook',
            'editCommandBlock',
            'editCommandMinecart',
            'emote',
            'finishCredits',
            'holdButtons',
            'interactEntity',
            'jump',
            'mineBlock',
            'move',
            'openInventory',
            'openNpc',
            'pickBlock',
            'pickEntity',
            'playSound',
            'playerInitialized',
            'pressRespawn',
            'queryBossBar',
            'releaseItem',
            'requestAbility',
            'respawn',
            'runCommand',
            'scriptMessage',
            'selectHotbarSlot',
            'setCreativeSlot',
            'setDefaultGameMode',
            'setFlying',
            'setPlayerPermission',
            'setRecipeBook',
            'setSleeping',
            'setSneaking',
            'setSprinting',
            'setViewDistance',
            'toggleCrafterSlot',
            'turnLecternPage',
            'useItem',
            'useItemOnBlock',
            'useLabTable'
        ]);
    });

    it('declares a lane for every kind', () => {
        for (const kind of INTENT_KINDS) expect(['connection', 'read', 'input'], kind).toContain(Intents[kind].lane);
    });

    it('takes the strictest lane of a set of kinds', () => {
        expect(laneOfIntents(['queryBossBar'])).toBe('read');
        expect(laneOfIntents(['queryBossBar', 'openInventory'])).toBe('input');
        expect(laneOfIntents(['openInventory', 'queryBossBar'])).toBe('input');
        expect(laneOfIntents([])).toBe('connection');
    });

    it('tells a kind from any other string, including prototype names', () => {
        expect(isIntentKind('openInventory')).toBe(true);
        expect(isIntentKind('teleport')).toBe(false);
        expect(isIntentKind('toString')).toBe(false);
    });

    it('names each player animation once', () => {
        expect(new Set(PLAYER_ANIMATIONS).size).toBe(PLAYER_ANIMATIONS.length);
    });
});

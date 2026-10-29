import { describe, expect, it } from 'vitest';

import { reportProgress } from '../../../.test/reportProgress';
import { ALL_MEMORY_MODULE_TYPES, MemoryModuleTypes, MemorySlot, visibleEntities } from './memory.js';
import { TestEntity } from './testWorld.js';

describe('the memory module registry', () => {
    it('reports the available memory modules', () => {
        reportProgress(`Entity brains expose ${ALL_MEMORY_MODULE_TYPES.length} memory modules.`);
    });

    it('registers every name exactly once', () => {
        const names = ALL_MEMORY_MODULE_TYPES.map((memory) => memory.name);
        expect(new Set(names).size).toBe(names.length);
    });

    it('keeps the six registered names that differ from their Java field names', () => {
        expect(MemoryModuleTypes.NEAREST_LIVING_ENTITIES.name).toBe('mobs');
        expect(MemoryModuleTypes.NEAREST_VISIBLE_LIVING_ENTITIES.name).toBe('visible_mobs');
        expect(MemoryModuleTypes.NEAREST_VISIBLE_ATTACKABLE_PLAYER.name).toBe('nearest_visible_targetable_player');
        expect(MemoryModuleTypes.LONG_JUMP_COOLDOWN_TICKS.name).toBe('long_jump_cooling_down');
        expect(MemoryModuleTypes.BREEZE_SHOOT_RECOVERING.name).toBe('breeze_shoot_recover');
        expect(MemoryModuleTypes.LIKED_NOTEBLOCK_POSITION.name).toBe('liked_noteblock');
    });
});

describe('MemorySlot', () => {
    it('starts empty and never-expiring', () => {
        const slot = new MemorySlot<number>();
        expect(slot.hasValue()).toBe(false);
        expect(slot.canExpire()).toBe(false);
        expect(slot.timeToLive()).toBe(MemorySlot.NEVER_EXPIRE);
    });

    it('holds a value without expiry when set with no time to live', () => {
        const slot = new MemorySlot<number>();
        slot.set(7);
        for (let tick = 0; tick < 1000; tick++) {
            slot.tick();
        }
        expect(slot.value()).toBe(7);
    });

    it('is readable for exactly n ticks and is cleared on the n plus first', () => {
        const slot = new MemorySlot<string>();
        slot.set('gold', 3);
        // Java checks hasExpired before decrementing, so ticks 1 to 3 still read the value.
        slot.tick();
        expect(slot.value()).toBe('gold');
        expect(slot.timeToLive()).toBe(2);
        slot.tick();
        slot.tick();
        expect(slot.value()).toBe('gold');
        expect(slot.timeToLive()).toBe(0);
        slot.tick();
        expect(slot.hasValue()).toBe(false);
    });

    it('resets its expiry when cleared', () => {
        const slot = new MemorySlot<number>();
        slot.set(1, 5);
        slot.clear();
        expect(slot.timeToLive()).toBe(MemorySlot.NEVER_EXPIRE);
    });
});

describe('the visible entity view', () => {
    it('answers closest, all and contains over the already-sorted list', () => {
        const near = new TestEntity('minecraft:pig', { position: { x: 1, y: 0, z: 0 } });
        const far = new TestEntity('minecraft:pig', { position: { x: 9, y: 0, z: 0 } });
        const view = visibleEntities([near, far]);
        expect(view.findClosest((entity) => entity.type === 'minecraft:pig')).toBe(near);
        expect(view.findAll(() => true)).toEqual([near, far]);
        expect(view.contains(far)).toBe(true);
        expect(view.contains(new TestEntity('minecraft:pig'))).toBe(false);
    });
});

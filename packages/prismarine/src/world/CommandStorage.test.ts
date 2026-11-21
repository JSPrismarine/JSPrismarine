import { PrismarineWorldErrors } from '@jsprismarine/errors/prismarine/world';
import { parseSnbtCompound } from '@jsprismarine/nbt/snbt';
import { EMPTY_COMPOUND } from '@jsprismarine/nbt/tag';
import { describe, expect, it } from 'vitest';

import { CommandStorage } from './CommandStorage';

describe('CommandStorage', () => {
    const state = parseSnbtCompound('{count: 3}');

    it('answers the empty compound for a storage nobody wrote', () => {
        expect(new CommandStorage().get('mypack:state')).toBe(EMPTY_COMPOUND);
    });

    it('reads back what was written, under the id with its namespace filled in', () => {
        const storage = new CommandStorage();
        storage.set('state', state);

        expect(storage.get('minecraft:state')).toBe(state);
        expect(storage.get('state')).toBe(state);
        expect([...storage.saved().keys()]).toEqual(['minecraft:state']);
    });

    it('drops a storage written empty, as Java does, so the save leaves it out', () => {
        const storage = new CommandStorage();
        storage.set('mypack:state', state);
        storage.set('mypack:state', EMPTY_COMPOUND);

        expect(storage.saved().size).toBe(0);
    });

    it.each(['MyPack:state', 'mypack:a b', 'a:b:c', 'my/pack:state', ''])(
        'refuses %j, which is not a resource location',
        (id) => {
            expect(() => new CommandStorage().get(id)).toThrow(PrismarineWorldErrors.InvalidStorageId);
        }
    );

    it('keeps a saved copy apart from later writes', () => {
        const storage = new CommandStorage();
        storage.set('mypack:state', state);
        const saved = storage.saved();
        storage.set('mypack:other', state);

        expect([...saved.keys()]).toEqual(['mypack:state']);
    });

    it('restores what a save held, skipping ids and compounds a save should not hold', () => {
        const storage = new CommandStorage();
        storage.set('mypack:gone', state);
        storage.restore(
            new Map([
                ['mypack:state', state],
                ['Bad Id', state],
                ['mypack:empty', EMPTY_COMPOUND]
            ])
        );

        expect([...storage.saved().keys()]).toEqual(['mypack:state']);
    });
});

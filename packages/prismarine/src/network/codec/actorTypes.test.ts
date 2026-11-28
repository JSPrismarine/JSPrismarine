import { NBTTagCompound } from '@jsprismarine/nbt';
import { describe, expect, it } from 'vitest';

import { nbtOfBytes } from '../../nbtBytes';
import Codec2193 from './Codec2193';
import Codec2225 from './Codec2225';
import { isMissingVanillaActor, withPackActorTypes } from './actorTypes';

/** Each entry of an actor list, as plain values by field. */
const entriesOf = (list: Buffer): Record<string, unknown>[] =>
    [...(nbtOfBytes(list).getList('idlist', false) ?? [])].flatMap((entry) =>
        entry instanceof NBTTagCompound
            ? [Object.fromEntries([...entry.entries()].map(([key, value]) => [key, value.value]))]
            : []
    );

describe('network/codec/actorTypes', () => {
    it('hides an actor type 1.26.60 added from a 1.26.51 session only', () => {
        expect(isMissingVanillaActor(Codec2193.context, 'minecraft:ice_ball')).toBe(true);
        expect(isMissingVanillaActor(Codec2225.context, 'minecraft:ice_ball')).toBe(false);
    });

    it('shows a type every release has, and a pack type no release lists', () => {
        expect(isMissingVanillaActor(Codec2193.context, 'minecraft:pig')).toBe(false);
        expect(isMissingVanillaActor(Codec2193.context, 'example:dragonfly')).toBe(false);
    });

    describe('withPackActorTypes', () => {
        const capture = Codec2225.context.entityIdentifiers!;
        const corpse = { identifier: 'example:corpse', isSpawnable: false, isSummonable: true };
        const carrier = {
            identifier: 'example:carrier',
            runtimeIdentifier: 'minecraft:armor_stand',
            isSpawnable: true,
            isSummonable: false
        };

        it('lists a pack type after the captured ones, written as BDS writes one', () => {
            const vanilla = entriesOf(capture);
            const entries = entriesOf(withPackActorTypes(capture, [corpse, carrier]));
            const highest = Math.max(...vanilla.map((entry) => Number(entry.rid)));

            expect(entries.slice(0, vanilla.length)).toEqual(vanilla);
            // In name order, numbered after the highest captured id.
            expect(entries.slice(vanilla.length)).toEqual([
                {
                    bid: 'minecraft:armor_stand',
                    hasspawnegg: 1,
                    id: 'example:carrier',
                    rid: highest + 1,
                    summonable: 0
                },
                { bid: 'minecraft:', hasspawnegg: 0, id: 'example:corpse', rid: highest + 2, summonable: 1 }
            ]);
        });

        it('adds nothing for a type the capture lists, or a vanilla type of another release', () => {
            const pig = { identifier: 'minecraft:pig', isSpawnable: true, isSummonable: true };
            expect(withPackActorTypes(capture, [pig])).toBe(capture);

            const older = Codec2193.context.entityIdentifiers!;
            const iceBall = { identifier: 'minecraft:ice_ball', isSpawnable: false, isSummonable: true };
            expect(withPackActorTypes(older, [iceBall])).toBe(older);
        });
    });
});

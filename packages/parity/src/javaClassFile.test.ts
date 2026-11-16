import { describe, expect, it } from 'vitest';

import { javaFieldStores, javaMemberRefs, pinnedJavaClass, pinnedJavaClassFile } from './javaClassFile.ts';
import { REFERENCES } from './references.ts';

describe.skipIf(REFERENCES.javaServerJar.locate() === undefined)('pinnedJavaClassFile', () => {
    it('reads a class’s superclass and the int constants its constructor stores', () => {
        const blaze = pinnedJavaClassFile('net/minecraft/world/entity/monster/Blaze');

        expect(blaze?.superName).toBe('net/minecraft/world/entity/monster/Monster');
        const stores = pinnedJavaClass('net/minecraft/world/entity/monster/Blaze')
            .filter((method) => method.name === '<init>')
            .flatMap((method) => javaFieldStores(method));
        expect(stores).toContainEqual({ field: 'Blaze.xpReward', value: 10 });
    });

    it('lists the fields a method reads beside the methods it calls, in code order', () => {
        const populate = pinnedJavaClass('net/minecraft/world/entity/monster/skeleton/AbstractSkeleton').find(
            (method) => method.name === 'populateDefaultEquipmentSlots'
        );
        const members =
            (populate === undefined ? [] : javaMemberRefs(populate)).map((ref) => `${ref.kind} ${ref.member}`) ?? [];

        expect(members).toContain('get Items.BOW');
        expect(members.indexOf('get EquipmentSlot.MAINHAND')).toBeLessThan(members.indexOf('get Items.BOW'));
        expect(members.at(-1)).toBe('call AbstractSkeleton.setItemSlot');
    });
});

import { describe, expect, it } from 'vitest';

import NetworkBinaryStream from '../NetworkBinaryStream';
import CreativeContentPacket, { CreativeItemCategory, creativeCategoryOf } from './CreativeContentPacket';

import { creativeContentPacket } from '../wire/definitions/creativeContent';
import { layoutAt } from '../wire/WireLayout';

import type { CreativeContent } from './CreativeContentPacket';
import { capture, enumDumpMembers } from '../testing/evidence.test.helper';

/** A file of the repository, by its path from the root. */
/** LEB128, which is what the docs call a varuint. */
const varuint = (value: number): number[] => {
    const bytes: number[] = [];
    let rest = value >>> 0;

    do {
        const byte = rest & 0x7f;
        rest >>>= 7;
        bytes.push(rest > 0 ? byte | 0x80 : byte);
    } while (rest > 0);

    return bytes;
};

/** ZigZag then LEB128, which is what the docs call a varint32. */
const varint = (value: number): number[] => varuint((value << 1) ^ (value >> 31));

/** Packet id 0x91 as a varuint. */
const HEADER = varuint(0x91);

const str = (text: string): number[] => {
    const utf8 = Buffer.from(text, 'utf-8');
    return [...varuint(utf8.byteLength), ...utf8];
};

/**
 * One `ItemStack` by hand, in the order protocol 2193 lays it out: Id (varint32), Stack size
 * (uint16 LE), Aux value (varuint32), Block Runtime Id (varint32), then the User Data Buffer.
 * Spelled out rather than built with the structure so the test pins the bytes and not the writer.
 */
const stack = (id: number, count: number, aux: number, userData: number[] = []): number[] => [
    ...varint(id),
    count & 0xff,
    count >> 8,
    ...varuint(aux),
    ...varint(0), // Block Runtime Id: none of these place a block.
    ...varuint(userData.length),
    ...userData
];

/** The empty stack: zeroes all the way down, including a zero length User Data Buffer. */
const AIR = [0x00, 0x00, 0x00, 0x00, 0x00, 0x00];

const encode = (data: CreativeContent): Buffer => new CreativeContentPacket(data).serialize(new NetworkBinaryStream());

const decode = (buffer: Buffer): CreativeContent =>
    new CreativeContentPacket().deserialize(new NetworkBinaryStream(buffer));

describe('CreativeContentPacket', () => {
    it('writes every group and then every entry under the group it names', () => {
        const buffer = encode({
            groups: [
                {
                    category: CreativeItemCategory.EQUIPMENT,
                    name: 'itemGroup.name.sword',
                    icon: { runtimeId: 308, count: 1, meta: 0, blockRuntimeId: 0, userData: Buffer.from([1, 2]) }
                },
                {
                    category: CreativeItemCategory.ITEMS,
                    name: '',
                    icon: { runtimeId: 0, count: 0, meta: 0, blockRuntimeId: 0 }
                }
            ],
            entries: [
                { item: { runtimeId: 280, count: 64, meta: 0, blockRuntimeId: 0 }, group: 1 },
                { item: { runtimeId: 280, count: 1, meta: 2, blockRuntimeId: 0 }, group: 1 }
            ]
        });

        expect([...buffer]).toEqual([
            ...HEADER,
            0x02, // Groups.
            CreativeItemCategory.EQUIPMENT,
            ...str('itemGroup.name.sword'),
            ...stack(308, 1, 0, [1, 2]),
            CreativeItemCategory.ITEMS,
            0x00, // An empty name, so the group is anonymous.
            ...AIR,
            0x02, // Entries.
            0x01, // Creative Net Id, one-based.
            ...stack(280, 64, 0),
            0x01, // Group Index.
            0x02,
            ...stack(280, 1, 2),
            0x01
        ]);
    });

    it('writes an empty menu as two empty lists', () => {
        expect([...encode({ groups: [], entries: [] })]).toEqual([...HEADER, 0x00, 0x00]);
    });

    it('reads the groups and the entries back', () => {
        const data = decode(
            Buffer.from([
                ...HEADER,
                0x02,
                CreativeItemCategory.CONSTRUCTION,
                ...str('itemGroup.name.planks'),
                ...stack(5, 1, 0),
                CreativeItemCategory.ITEMS,
                ...str(''),
                ...AIR,
                0x02,
                0x01,
                ...stack(5, 64, 0),
                0x00,
                0x02,
                ...stack(9, 3, 7),
                0x01
            ])
        );

        expect(data.groups.map(({ category, name }) => ({ category, name }))).toEqual([
            { category: CreativeItemCategory.CONSTRUCTION, name: 'itemGroup.name.planks' },
            { category: CreativeItemCategory.ITEMS, name: '' }
        ]);
        expect(data.groups[1]?.icon.runtimeId).toBe(0);
        expect(data.entries.map(({ item, group }) => ({ id: item.runtimeId, count: item.count, group }))).toEqual([
            { id: 5, count: 64, group: 0 },
            { id: 9, count: 3, group: 1 }
        ]);
    });

    describe('creativeCategoryOf', () => {
        it('names a tab from the word the creative data uses for it', () => {
            expect(creativeCategoryOf('construction')).toBe(CreativeItemCategory.CONSTRUCTION);
            expect(creativeCategoryOf('nature')).toBe(CreativeItemCategory.NATURE);
            expect(creativeCategoryOf('equipment')).toBe(CreativeItemCategory.EQUIPMENT);
            expect(creativeCategoryOf('items')).toBe(CreativeItemCategory.ITEMS);
        });

        it('files a tab it does not know under items, so the menu stays drawable', () => {
            expect(creativeCategoryOf('something_mojang_added')).toBe(CreativeItemCategory.ITEMS);
        });
    });

    describe('Creative Category numbering', () => {
        it("numbers the tabs 1 through 5, as Mojang's enum dump does", () => {
            const members = enumDumpMembers('CreativeItemCategory');

            expect(members.length).toBeGreaterThan(0);
            for (const { name, value } of members) {
                if (name === 'NUM_CATEGORIES') continue;
                expect(CreativeItemCategory[value]?.replaceAll('_', '').toLowerCase()).toBe(name.toLowerCase());
            }
        });

        // The 1.26.50 page prints the tabs as 0 through 4 and the 1.26.60 page as 1 through 5. The
        // capture from a real server at protocol 2193 carries 1 for `itemGroup.name.planks`, a
        // construction group, so the numbering is the same at both versions.
        it.each([2193, 2225])('re-encodes the captured creative menu at protocol %i', (protocol) => {
            const bytes = capture(protocol, 0x91);
            const layout = layoutAt(creativeContentPacket, protocol);
            const stream = new NetworkBinaryStream(bytes);
            const payload = layout.decode(stream);

            expect(stream.feof()).toBe(true);
            expect(payload.groups[0]).toMatchObject({
                name: 'itemGroup.name.planks',
                category: CreativeItemCategory.CONSTRUCTION
            });
            expect(new Set(payload.groups.map(({ category }) => category))).toEqual(
                new Set([
                    CreativeItemCategory.CONSTRUCTION,
                    CreativeItemCategory.NATURE,
                    CreativeItemCategory.EQUIPMENT,
                    CreativeItemCategory.ITEMS
                ])
            );

            // Writing the Creative Net Ids from the entries' positions reproduces the capture, so
            // the server numbers them one-based and in order.
            const encoded = new NetworkBinaryStream();
            layout.encode(encoded, payload);
            expect(encoded.getBuffer().equals(bytes)).toBe(true);
        });

        it('keeps the 0xFFFFFFFF Group Index that marks an ungrouped entry', () => {
            const data: CreativeContent = {
                groups: [],
                entries: [{ item: { runtimeId: 5, count: 1, meta: 0, blockRuntimeId: 0 }, group: 0xffffffff }]
            };

            expect(decode(encode(data)).entries[0]?.group).toBe(0xffffffff);
        });
    });
});

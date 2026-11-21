import BinaryStream from '@jsprismarine/binaryutils';
import { ContainerUiId as ContainerUiId2193 } from '@jsprismarine/minecraft/generated/v2193/ContainerUiId';
import { ContainerUiId as ContainerUiId2225 } from '@jsprismarine/minecraft/generated/v2225/ContainerUiId';
import { describe, expect, it } from 'vitest';

import { layoutAt } from '../../wire/WireLayout';
import { inventoryContentPacket, inventorySlotPacket } from '../wire/definitions/containers';
import { capture, enumDumpMembers } from '../../testing/evidence.test.helper';

/** Member names compared without case, underscores or a trailing `Container`. */
const compact = (name: string): string =>
    name
        .replaceAll('_', '')
        .replace(/container$/i, '')
        .toLowerCase();

/** An empty stack: every field zero, and a blob with no length. */
const emptyStack = { id: 0, stackSize: 0, auxValue: 0, stackNetId: null, blockRuntimeId: 0, userData: Buffer.alloc(0) };

/**
 * The bytes the hand-written encoder produced, recorded before the class moved to the layout.
 * One case per branch of `Full Container Name`: no dynamic id and an empty stack, then a
 * dynamic id and a tracked stack.
 */
const CASES = [
    {
        name: 'an emptied crafting slot, with no dynamic id',
        bytes: Buffer.from('7c1d010d00000000000000000000', 'hex'),
        payload: {
            windowId: 124,
            inventorySlot: 29,
            fullContainerName: { containerId: 13, dynamicId: null },
            storageItem: null,
            item: emptyStack
        }
    },
    {
        name: 'a tracked stack in a dynamic container',
        bytes: Buffer.from('071a01070111000000000500030000012ab6b5ac94070a00000000000000000000', 'hex'),
        payload: {
            windowId: 7,
            inventorySlot: 26,
            fullContainerName: { containerId: 7, dynamicId: 17 },
            storageItem: null,
            item: {
                id: 5,
                stackSize: 3,
                auxValue: 0,
                stackNetId: 21,
                blockRuntimeId: 1921718966,
                userData: Buffer.alloc(10)
            }
        }
    }
] as const;

describe('the declarative InventorySlot layout', () => {
    for (const version of [2193, 2225] as const) {
        const layout = layoutAt(inventorySlotPacket, version);

        describe(`at protocol ${version}`, () => {
            for (const { name, bytes, payload } of CASES) {
                it(`writes the bytes the hand-written encoder wrote for ${name}`, () => {
                    const stream = new BinaryStream();
                    layout.encode(stream, payload);

                    expect(stream.getBuffer()).toEqual(bytes);
                });

                it(`reads those bytes back for ${name}`, () => {
                    expect(layout.decode(new BinaryStream(bytes))).toEqual(payload);
                });
            }

            it('reads an absent Full Container Name, which the old encoder never wrote', () => {
                const absent = Buffer.from('7c1d00000000000000000000', 'hex');

                expect(layout.decode(new BinaryStream(absent))).toEqual({
                    windowId: 124,
                    inventorySlot: 29,
                    fullContainerName: null,
                    storageItem: null,
                    item: emptyStack
                });
            });

            it('writes Container Id as one uint8, not a varuint32', () => {
                const stream = new BinaryStream();
                layout.encode(stream, { ...CASES[0].payload, windowId: 200 });

                expect(stream.getBuffer().subarray(0, 2)).toEqual(Buffer.from('c81d', 'hex'));
            });

            it('writes Dynamic ID as a little-endian uint32', () => {
                const payload = {
                    ...CASES[0].payload,
                    fullContainerName: { containerId: 13, dynamicId: 0xfffffffe }
                };
                const stream = new BinaryStream();
                layout.encode(stream, payload);

                expect(stream.getBuffer().subarray(4, 9)).toEqual(Buffer.from('01feffffff', 'hex'));
                expect(layout.decode(new BinaryStream(stream.getBuffer()))).toEqual(payload);
            });

            // The shared FullContainerName type, as the BDS capture of InventoryContentPacket (0x31)
            // carries it: the Dynamic ID presence byte is on the wire at both versions, though the
            // 1.26.50 page prints the field plain.
            it('round-trips the InventoryContentPacket capture that carries Full Container Name', () => {
                const bytes = capture(version, 0x31);
                const content = layoutAt(inventoryContentPacket, version);
                const decoded = content.decode(new BinaryStream(bytes));
                const out = new BinaryStream();
                content.encode(out, decoded);

                expect(decoded.fullContainerName).toEqual({ containerId: 0, dynamicId: null });
                expect(out.getBuffer()).toEqual(bytes);
            });
        });
    }

    // The 1.26.50 page numbers ContainerEnumName densely (RecipeFoodContainer 18); Mojang's
    // enum dump and the 1.26.60 page give the game's own values, which both versions use.
    for (const [version, members] of [
        [2193, ContainerUiId2193],
        [2225, ContainerUiId2225]
    ] as const) {
        it(`names every container at protocol ${version} with the value Mojang's enum dump gives`, () => {
            const dump = enumDumpMembers('ContainerEnumName');
            const generated = new Map(
                Object.entries(members)
                    .filter(([, value]) => typeof value === 'number')
                    .map(([name, value]) => [compact(name), value])
            );

            expect(dump.length).toBeGreaterThan(60);
            for (const { name, value } of dump) {
                expect(generated.get(compact(name)), name).toBe(value);
            }
        });
    }
});

import { describe, expect, it } from 'vitest';
import NetworkBinaryStream from '../NetworkBinaryStream';
import BlockPos from '../structure/BlockPos';
import CommandBlockUpdatePacket, { CommandBlockMode } from './CommandBlockUpdatePacket';

import type { CommandBlockUpdate } from './CommandBlockUpdatePacket';

describe('CommandBlockUpdatePacket', () => {
    const tail = Buffer.from([
        0x03,
        0x73,
        0x61,
        0x79, // "say"
        0x00, // last output ""
        0x01,
        0x6e, // name "n"
        0x00, // filtered name ""
        0x01, // track output
        0x14,
        0x00,
        0x00,
        0x00, // tick delay 20
        0x00 // execute on first tick
    ]);

    it('decodes a block target with position, mode, and flags', () => {
        const stream = new NetworkBinaryStream(
            Buffer.concat([Buffer.from([0x4e, 0x01, 0x02, 0x04, 0x06, 0x01, 0x00, 0x01]), tail])
        );
        const data = new CommandBlockUpdatePacket().deserialize(stream);

        expect(data.target).toEqual({
            isBlock: true,
            blockPosition: new BlockPos(1, 2, 3),
            commandBlockMode: CommandBlockMode.Repeating,
            redstoneMode: false,
            isConditional: true
        });
        expect(data).toMatchObject({
            command: 'say',
            lastOutput: '',
            name: 'n',
            filteredName: '',
            trackOutput: true,
            tickDelay: 20,
            executeOnFirstTick: false,
            lastOutputIsRawMessage: false
        });
        expect(stream.feof()).toBe(true);
    });

    it('decodes an entity target as selector 0 and a varuint64 runtime id', () => {
        const stream = new NetworkBinaryStream(Buffer.concat([Buffer.from([0x4e, 0x00, 0x80, 0x01]), tail]));
        const data = new CommandBlockUpdatePacket().deserialize(stream);

        expect(data.target).toEqual({ isBlock: false, targetRuntimeId: 128n });
        expect(stream.feof()).toBe(true);
    });

    it('rejects an unknown target alternative', () => {
        const stream = new NetworkBinaryStream(Buffer.from([0x4e, 0x02]));

        expect(() => new CommandBlockUpdatePacket().deserialize(stream)).toThrow(/alternative 2/);
    });

    it('encodes a block target back to the same bytes', () => {
        const packet = new CommandBlockUpdatePacket({
            target: {
                isBlock: true,
                blockPosition: new BlockPos(1, 2, 3),
                commandBlockMode: CommandBlockMode.Repeating,
                redstoneMode: false,
                isConditional: true
            },
            command: 'say',
            lastOutput: '',
            name: 'n',
            filteredName: '',
            trackOutput: true,
            tickDelay: 20,
            executeOnFirstTick: false,
            lastOutputIsRawMessage: false
        });

        expect(packet.serialize(new NetworkBinaryStream())).toEqual(
            Buffer.concat([Buffer.from([0x4e, 0x01, 0x02, 0x04, 0x06, 0x01, 0x00, 0x01]), tail])
        );
    });
});

describe('CommandBlockUpdatePacket at each supported protocol', () => {
    it.each([2193, 2225])('round-trips an entity and a block target at protocol %i', (protocol) => {
        const block: CommandBlockUpdate = {
            target: {
                isBlock: true,
                blockPosition: new BlockPos(-1, 64, 3),
                commandBlockMode: CommandBlockMode.Chain,
                redstoneMode: true,
                isConditional: false
            },
            command: 'x',
            lastOutput: '',
            name: '',
            filteredName: '',
            trackOutput: false,
            tickDelay: -2,
            executeOnFirstTick: true,
            lastOutputIsRawMessage: false
        };
        const entity: CommandBlockUpdate = { ...block, target: { isBlock: false, targetRuntimeId: 300n } };

        const blockPacket = new CommandBlockUpdatePacket(block);
        blockPacket.codecProtocol = protocol;
        const blockBytes = blockPacket.serialize(new NetworkBinaryStream());
        // header, selector 1, ZigZag(-1)=1, ZigZag(64)=0x80 0x01, ZigZag(3)=6, mode 2, redstone, conditional
        expect(blockBytes.subarray(0, 9)).toEqual(Buffer.from([0x4e, 0x01, 0x01, 0x80, 0x01, 0x06, 0x02, 0x01, 0x00]));
        const decodedBlock = new CommandBlockUpdatePacket();
        decodedBlock.codecProtocol = protocol;
        expect(decodedBlock.deserialize(new NetworkBinaryStream(blockBytes))).toEqual(block);

        const entityPacket = new CommandBlockUpdatePacket(entity);
        entityPacket.codecProtocol = protocol;
        const entityBytes = entityPacket.serialize(new NetworkBinaryStream());
        // header, selector 0, varuint64 300
        expect(entityBytes.subarray(0, 4)).toEqual(Buffer.from([0x4e, 0x00, 0xac, 0x02]));
        const decodedEntity = new CommandBlockUpdatePacket();
        decodedEntity.codecProtocol = protocol;
        expect(decodedEntity.deserialize(new NetworkBinaryStream(entityBytes))).toEqual(entity);
    });
});

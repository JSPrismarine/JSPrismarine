import BinaryStream from '@jsprismarine/binaryutils';
import { Vector3 } from '@jsprismarine/math';
import { PlayerAuthInputData } from '@jsprismarine/minecraft';
import { describe, expect, it } from 'vitest';

import { Item } from '../../item/Item';
import BlockPosition from '../../world/BlockPosition';
import { HandSlot, UseItemAction } from './InventoryTransactionPacket';
import { PlayerAction } from './PlayerActionPacket';
import PlayerAuthInputPacket from './PlayerAuthInputPacket';

/**
 * The packet as a client writes it, built from the layout rather than from the reader.
 *
 * Protocol 2193's, from gophertunnel's `packet/player_auth_input.go`: the head, then five
 * optionals each with one presence byte, then the three trailing vectors. Written here by
 * hand so that the test knows the bytes rather than trusting `encodePayload` to agree with
 * `decodePayload` - the two are pinned against each other separately below.
 */
const minimalInput = (write: (out: BinaryStream) => void = () => {}): Buffer => {
    const out = new BinaryStream();
    out.writeUnsignedVarInt(0x90); // Header.
    out.writeFloatLE(10); // Pitch.
    out.writeFloatLE(-90); // Yaw.
    out.writeFloatLE(1.5); // Position.
    out.writeFloatLE(64);
    out.writeFloatLE(-3.5);
    out.writeFloatLE(0); // Move vector.
    out.writeFloatLE(1);
    out.writeFloatLE(-88); // Head yaw.
    out.writeUnsignedVarInt(2); // Two flags set.
    out.writeVarInt(PlayerAuthInputData.SPRINTING);
    out.writeVarInt(PlayerAuthInputData.VERTICAL_COLLISION);
    out.writeUnsignedVarInt(1); // Input mode: mouse.
    out.writeUnsignedVarInt(0); // Play mode: normal.
    out.writeVarInt(2); // Interaction model: classic.
    out.writeFloatLE(10); // Interact rotation.
    out.writeFloatLE(-90);
    out.writeUnsignedVarLong(1234n); // Tick.
    out.writeFloatLE(0); // Delta.
    out.writeFloatLE(-0.08);
    out.writeFloatLE(0.1);
    write(out); // The five optionals.
    out.writeFloatLE(0); // Analog move vector.
    out.writeFloatLE(1);
    out.writeFloatLE(0.2); // Camera orientation.
    out.writeFloatLE(-0.1);
    out.writeFloatLE(0.97);
    out.writeFloatLE(0); // Raw move vector.
    out.writeFloatLE(1);

    return out.getBuffer();
};

/** Five absent optionals: five bytes of zero. */
const noOptionals = (out: BinaryStream): void => {
    for (let i = 0; i < 5; i++) out.writeBoolean(false);
};

const decode = (buffer: Buffer): PlayerAuthInputPacket => {
    const packet = new PlayerAuthInputPacket(buffer);
    packet.decode();
    return packet;
};

describe('PlayerAuthInputPacket', () => {
    it('reads the head of the packet: where the player is and what they pressed', () => {
        const packet = decode(minimalInput(noOptionals));

        expect(packet.pitch).toBe(10);
        expect(packet.yaw).toBe(-90);
        expect(packet.headYaw).toBe(-88);
        expect(packet.position.getX()).toBeCloseTo(1.5);
        expect(packet.position.getY()).toBeCloseTo(64);
        expect(packet.position.getZ()).toBeCloseTo(-3.5);
        expect(packet.inputData.has(PlayerAuthInputData.SPRINTING)).toBe(true);
        expect(packet.inputData.has(PlayerAuthInputData.VERTICAL_COLLISION)).toBe(true);
        expect(packet.inputData.has(PlayerAuthInputData.JUMPING)).toBe(false);
        expect(packet.tick).toBe(1234n);
        expect(packet.delta.getY()).toBeCloseTo(-0.08);
        expect(packet.cameraOrientation.getZ()).toBeCloseTo(0.97);
    });

    it('reads nothing past the end: the five optionals are absent and the tail lines up', () => {
        const packet = decode(minimalInput(noOptionals));

        expect(packet.itemUseTransaction).toBeNull();
        expect(packet.itemStackRequest).toBeNull();
        expect(packet.blockActions).toBeNull();
        expect(packet.vehicleRotation).toBeNull();
        expect(packet.predictedVehicle).toBeNull();
        expect(packet.rawMoveVector).toEqual({ x: 0, y: 1 });
        expect(packet.feof()).toBe(true);
    });

    it('reads the block actions a survival break arrives as', () => {
        const packet = decode(
            minimalInput((out) => {
                out.writeBoolean(false); // No item use.
                out.writeBoolean(false); // No stack request.
                out.writeBoolean(true); // Block actions.
                out.writeUnsignedVarInt(2);
                out.writeVarInt(PlayerAction.START_BREAK);
                out.writeVarInt(5); // Position, signed: a block below y=0 must survive.
                out.writeVarInt(-12);
                out.writeVarInt(-7);
                out.writeVarInt(1); // Face.
                out.writeVarInt(PlayerAction.STOP_BREAK);
                out.writeVarInt(0);
                out.writeVarInt(0);
                out.writeVarInt(0);
                out.writeVarInt(0);
                out.writeBoolean(false); // No vehicle rotation.
                out.writeBoolean(false); // No predicted vehicle.
            })
        );

        expect(packet.blockActions).toHaveLength(2);
        expect(packet.blockActions![0]).toMatchObject({ action: PlayerAction.START_BREAK, face: 1 });
        expect(packet.blockActions![0]!.position.getY()).toBe(-12);
        expect(packet.blockActions![1]!.action).toBe(PlayerAction.STOP_BREAK);
        expect(packet.feof()).toBe(true);
    });

    it('reads an item use carried in the tick, with the hand 2193 added', () => {
        const packet = decode(
            minimalInput((out) => {
                out.writeBoolean(true); // Item use.
                out.writeVarInt(0); // Legacy request id.
                out.writeBoolean(false); // No legacy slot changes.
                out.writeUnsignedVarInt(0); // No actions.
                out.writeVarInt(UseItemAction.CLICK_BLOCK);
                out.writeByte(1); // Trigger: player input.
                out.writeVarInt(3); // Block position.
                out.writeVarInt(64);
                out.writeVarInt(-2);
                out.writeByte(1); // Face.
                out.writeVarInt(4); // Hotbar slot.
                out.writeByte(HandSlot.OFFHAND);
                Item.air().networkSerialize(out); // Item in hand.
                out.writeFloatLE(3.5); // Player position.
                out.writeFloatLE(65.6);
                out.writeFloatLE(-1.5);
                out.writeFloatLE(0.5); // Click position.
                out.writeFloatLE(1);
                out.writeFloatLE(0.5);
                out.writeUnsignedVarInt(0); // Block runtime id.
                out.writeByte(1); // Prediction: success.
                out.writeByte(0); // Cooldown: off.
                out.writeBoolean(false); // No stack request.
                out.writeBoolean(false); // No block actions.
                out.writeBoolean(false); // No vehicle rotation.
                out.writeBoolean(false); // No predicted vehicle.
            })
        );

        const use = packet.itemUseTransaction!;
        expect(use.data.actionType).toBe(UseItemAction.CLICK_BLOCK);
        expect(use.data.hand).toBe(HandSlot.OFFHAND);
        expect(use.data.hotbarSlot).toBe(4);
        expect(use.data.blockPosition.getZ()).toBe(-2);
        expect(use.data.clientInteractPrediction).toBe(1);
        expect(packet.feof()).toBe(true);
    });

    it('refuses a flag count no client can send, rather than allocating for it', () => {
        const out = new BinaryStream();
        out.writeUnsignedVarInt(0x90);
        for (let i = 0; i < 8; i++) out.writeFloatLE(0); // Pitch, yaw, position, move vector, head yaw.
        out.writeUnsignedVarInt(5000);

        expect(() => decode(out.getBuffer())).toThrow(/5000/);
    });

    it('writes what it reads', () => {
        const packet = new PlayerAuthInputPacket();
        packet.pitch = 5;
        packet.yaw = 45;
        packet.headYaw = 40;
        packet.position = new Vector3(1, 2, 3);
        packet.inputData = new Set([PlayerAuthInputData.START_JUMPING, PlayerAuthInputData.UP]);
        packet.inputMode = 1;
        packet.interactionModel = 2;
        packet.tick = 99n;
        packet.blockActions = [{ action: PlayerAction.CRACK_BLOCK, position: new BlockPosition(1, -5, 2), face: 4 }];
        packet.vehicleRotation = { x: 1, y: 2 };
        packet.predictedVehicle = -77n;
        packet.encode();

        const read = decode(packet.getBuffer());

        expect(read.inputData).toEqual(packet.inputData);
        expect(read.blockActions![0]!.position.getY()).toBe(-5);
        expect(read.vehicleRotation).toEqual({ x: 1, y: 2 });
        expect(read.predictedVehicle).toBe(-77n);
        expect(read.tick).toBe(99n);
        expect(read.feof()).toBe(true);
    });

    it('writes the head byte for byte as the layout says', () => {
        // The same packet by hand and by the writer, so the writer is pinned to the layout
        // and not merely to the reader.
        const packet = new PlayerAuthInputPacket();
        packet.pitch = 10;
        packet.yaw = -90;
        packet.headYaw = -88;
        packet.position = new Vector3(1.5, 64, -3.5);
        packet.moveVector = { x: 0, y: 1 };
        packet.inputData = new Set([PlayerAuthInputData.SPRINTING, PlayerAuthInputData.VERTICAL_COLLISION]);
        packet.inputMode = 1;
        packet.interactionModel = 2;
        packet.interactRotation = { x: 10, y: -90 };
        packet.tick = 1234n;
        packet.delta = new Vector3(0, -0.08, 0.1);
        packet.analogMoveVector = { x: 0, y: 1 };
        packet.cameraOrientation = new Vector3(0.2, -0.1, 0.97);
        packet.rawMoveVector = { x: 0, y: 1 };
        packet.encode();

        expect(packet.getBuffer()).toEqual(minimalInput(noOptionals));
    });
});

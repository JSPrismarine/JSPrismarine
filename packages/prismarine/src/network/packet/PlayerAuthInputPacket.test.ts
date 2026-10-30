import BinaryStream from '@jsprismarine/binaryutils';
import { Vector3 } from '@jsprismarine/math';
import NetworkBinaryStream from '@jsprismarine/protocol/NetworkBinaryStream';
import {
    ClientPlayMode,
    HandSlot,
    InputMode,
    INPUT_FLAG_COUNT,
    ItemUseActionType,
    MAX_BLOCK_ACTIONS,
    NewInteractionModel,
    PlayerActionType,
    PlayerAuthInputData
} from '@jsprismarine/protocol';
import PlayerAuthInputPacket from '@jsprismarine/protocol/packet/PlayerAuthInputPacket';
import { describe, expect, it } from 'vitest';

import { Item } from '../../item/Item';
import BlockPosition from '../../world/BlockPosition';
import type { ServerPlayerAuthInput } from '../PlayerAuthInputAdapter';
import { playerAuthInputFromProtocol, playerAuthInputToProtocol } from '../PlayerAuthInputAdapter';
import Codec2193 from '../codec/Codec2193';

/**
 * The packet as a client writes it, built from the docs' layout rather than from the reader.
 *
 * Protocol 2193: the head, then five optionals each with one presence byte, then the three
 * trailing vectors. Written by hand so that the test knows the bytes rather than trusting
 * `encodePayload` to agree with `decodePayload`; the two are pinned against each other
 * separately below.
 */
const minimalInput = (write: (out: BinaryStream) => void = () => {}): Buffer => {
    const out = new BinaryStream();
    out.writeUnsignedVarInt(0x90); // Header.
    out.writeFloatLE(10); // Player Rotation: pitch.
    out.writeFloatLE(-90); // Player Rotation: yaw.
    out.writeFloatLE(1.5); // Position.
    out.writeFloatLE(64);
    out.writeFloatLE(-3.5);
    out.writeFloatLE(0); // Move Vector.
    out.writeFloatLE(1);
    out.writeFloatLE(-88); // Player Head Rotation.
    out.writeUnsignedVarInt(2); // Input Data: two flags set.
    out.writeVarInt(PlayerAuthInputData.SPRINTING);
    out.writeVarInt(PlayerAuthInputData.VERTICAL_COLLISION);
    out.writeUnsignedVarInt(InputMode.Mouse); // Input Mode.
    out.writeUnsignedVarInt(ClientPlayMode.Normal); // Play Mode.
    out.writeVarInt(NewInteractionModel.Classic); // New Interaction Model.
    out.writeFloatLE(10); // Interact Rotation.
    out.writeFloatLE(-90);
    out.writeUnsignedVarLong(1234n); // Client Tick.
    out.writeFloatLE(0); // Pos Delta.
    out.writeFloatLE(-0.08);
    out.writeFloatLE(0.1);
    write(out); // The five optionals.
    out.writeFloatLE(0); // Analog Move Vector.
    out.writeFloatLE(1);
    out.writeFloatLE(0.2); // Camera Orientation.
    out.writeFloatLE(-0.1);
    out.writeFloatLE(0.97);
    out.writeFloatLE(0); // Raw Move Vector.
    out.writeFloatLE(1);

    return out.getBuffer();
};

/** Five absent optionals: five bytes of zero. */
const noOptionals = (out: BinaryStream): void => {
    for (let i = 0; i < 5; i++) out.writeBoolean(false);
};

const decode = (buffer: Buffer): ServerPlayerAuthInput & { feof: () => boolean } => {
    const stream = new NetworkBinaryStream(buffer);
    const packet = new PlayerAuthInputPacket();
    const data = packet.deserialize(stream, Codec2193.context);
    return { ...playerAuthInputFromProtocol(data, Codec2193.context), feof: () => stream.feof() };
};

const emptyInput = (): ServerPlayerAuthInput => ({
    pitch: 0,
    yaw: 0,
    position: new Vector3(0, 0, 0),
    moveVector: { x: 0, y: 0 },
    headYaw: 0,
    inputData: new Set(),
    inputMode: InputMode.Undefined,
    playMode: ClientPlayMode.Normal,
    interactionModel: NewInteractionModel.Touch,
    interactRotation: { x: 0, y: 0 },
    tick: 0n,
    delta: new Vector3(0, 0, 0),
    itemUseTransaction: null,
    itemStackRequest: null,
    blockActions: null,
    vehicleRotation: null,
    predictedVehicle: null,
    analogMoveVector: { x: 0, y: 0 },
    cameraOrientation: new Vector3(0, 0, 0),
    rawMoveVector: { x: 0, y: 0 }
});

const encode = (input: ServerPlayerAuthInput): Buffer => {
    const packet = new PlayerAuthInputPacket(playerAuthInputToProtocol(input, Codec2193.context));
    return packet.serialize(new NetworkBinaryStream(), Codec2193.context);
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
        expect(packet.inputMode).toBe(InputMode.Mouse);
        expect(packet.playMode).toBe(ClientPlayMode.Normal);
        expect(packet.interactionModel).toBe(NewInteractionModel.Classic);
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

    it('numbers the flags as the game does, gaps included', () => {
        // The 1.26.51 docs page lists the members 0 to 62 with no gaps; the game, gophertunnel
        // and the corrected 1.26.60 docs skip 2, 54 and 55. A reader that follows the 1.26.51
        // page takes a StartJumping for a StopSwimming.
        expect(PlayerAuthInputData.JUMP_DOWN).toBe(3);
        expect(PlayerAuthInputData.START_JUMPING).toBe(31);
        expect(PlayerAuthInputData.START_SPIN_ATTACK).toBe(56);
        expect(PlayerAuthInputData.INTERNAL_UPDATE).toBe(65);
        expect(INPUT_FLAG_COUNT).toBe(66);

        const out = new BinaryStream();
        out.writeUnsignedVarInt(0x90);
        for (let i = 0; i < 8; i++) out.writeFloatLE(0); // Rotation, position, move vector, head rotation.
        out.write(Buffer.from([0x03, 0x3e, 0x06, 0x82, 0x01])); // Three flags: ZigZag 31, 3 and 65.
        out.writeUnsignedVarInt(0); // Input Mode.
        out.writeUnsignedVarInt(0); // Play Mode.
        out.writeVarInt(0); // New Interaction Model.
        for (let i = 0; i < 2; i++) out.writeFloatLE(0); // Interact Rotation.
        out.writeUnsignedVarLong(0n); // Client Tick.
        for (let i = 0; i < 3; i++) out.writeFloatLE(0); // Pos Delta.
        noOptionals(out);
        for (let i = 0; i < 7; i++) out.writeFloatLE(0); // The three trailing vectors.

        const packet = decode(out.getBuffer());

        expect([...packet.inputData]).toEqual([
            PlayerAuthInputData.START_JUMPING,
            PlayerAuthInputData.JUMP_DOWN,
            PlayerAuthInputData.INTERNAL_UPDATE
        ]);
        expect(packet.feof()).toBe(true);
    });

    it('reads the block actions a survival break arrives as', () => {
        const packet = decode(
            minimalInput((out) => {
                out.writeBoolean(false); // No Item Use Transaction.
                out.writeBoolean(false); // No Item Stack Request.
                out.writeBoolean(true); // Player Block Actions.
                out.writeUnsignedVarInt(2);
                out.writeVarInt(PlayerActionType.StartDestroyBlock);
                out.writeVarInt(5); // Position, signed: a block below y=0 must survive.
                out.writeVarInt(-12);
                out.writeVarInt(-7);
                out.writeVarInt(1); // Facing.
                out.writeVarInt(PlayerActionType.StopDestroyBlock); // Carries the default position and facing.
                out.writeVarInt(0);
                out.writeVarInt(0);
                out.writeVarInt(0);
                out.writeVarInt(0);
                out.writeBoolean(false); // No Vehicle Rotation.
                out.writeBoolean(false); // No Client Predicted Vehicle.
            })
        );

        expect(packet.blockActions).toHaveLength(2);
        expect(packet.blockActions![0]).toMatchObject({ action: PlayerActionType.StartDestroyBlock, face: 1 });
        expect(packet.blockActions![0]!.position.getY()).toBe(-12);
        expect(packet.blockActions![1]!.action).toBe(PlayerActionType.StopDestroyBlock);
        expect(packet.feof()).toBe(true);
    });

    it('refuses more block actions than the docs allow, rather than allocating for them', () => {
        const over = MAX_BLOCK_ACTIONS + 1;
        const out = new BinaryStream();
        out.writeUnsignedVarInt(0x90);
        for (let i = 0; i < 8; i++) out.writeFloatLE(0);
        out.writeUnsignedVarInt(0); // No flags.
        out.writeUnsignedVarInt(0);
        out.writeUnsignedVarInt(0);
        out.writeVarInt(0);
        for (let i = 0; i < 2; i++) out.writeFloatLE(0);
        out.writeUnsignedVarLong(0n);
        for (let i = 0; i < 3; i++) out.writeFloatLE(0);
        out.writeBoolean(false);
        out.writeBoolean(false);
        out.writeBoolean(true); // Player Block Actions.
        out.writeUnsignedVarInt(over);

        expect(() => decode(out.getBuffer())).toThrow(new RegExp(`${over}`));
    });

    it('reads an item use carried in the tick, with the hand 2193 added', () => {
        const packet = decode(
            minimalInput((out) => {
                out.writeBoolean(true); // Item Use Transaction.
                out.writeVarInt(0); // Legacy Request ID.
                out.writeBoolean(false); // No Legacy Set Item Slots.
                out.writeUnsignedVarInt(0); // No Actions.
                out.writeVarInt(ItemUseActionType.PLACE); // Action Type.
                out.writeByte(1); // Trigger Type: player input.
                out.writeVarInt(3); // Position.
                out.writeVarInt(64);
                out.writeVarInt(-2);
                out.writeByte(1); // Face.
                out.writeVarInt(4); // Slot.
                out.writeByte(HandSlot.OFFHAND); // Hand.
                Item.air().networkSerialize(out); // Item.
                out.writeFloatLE(3.5); // From Position.
                out.writeFloatLE(65.6);
                out.writeFloatLE(-1.5);
                out.writeFloatLE(0.5); // Click Position.
                out.writeFloatLE(1);
                out.writeFloatLE(0.5);
                out.writeUnsignedVarInt(0); // Target Block Id.
                out.writeByte(1); // Client Interact Prediction: success.
                out.writeByte(0); // Client Cooldown State: off.
                out.writeBoolean(false); // No Item Stack Request.
                out.writeBoolean(false); // No Player Block Actions.
                out.writeBoolean(false); // No Vehicle Rotation.
                out.writeBoolean(false); // No Client Predicted Vehicle.
            })
        );

        const use = packet.itemUseTransaction!;
        expect(use.data.actionType).toBe(ItemUseActionType.PLACE);
        expect(use.data.hand).toBe(HandSlot.OFFHAND);
        expect(use.data.hotbarSlot).toBe(4);
        expect(use.data.blockPosition.getZ()).toBe(-2);
        expect(use.data.clientInteractPrediction).toBe(1);
        expect(packet.feof()).toBe(true);
    });

    it('reads an item stack request carried in the tick', () => {
        const packet = decode(
            minimalInput((out) => {
                out.writeBoolean(false); // No Item Use Transaction.
                out.write(
                    Buffer.from([
                        0x01, // Item Stack Request present.
                        0x05, // Client Request Id: -3 as a ZigZag varint32.
                        0x00, // No Actions.
                        0x00, // No Strings To Filter.
                        0x00, // StringsToFilterOrigin: 0 as an int32 LE.
                        0x00,
                        0x00,
                        0x00
                    ])
                );
                out.writeBoolean(false); // No Player Block Actions.
                out.writeBoolean(false); // No Vehicle Rotation.
                out.writeBoolean(false); // No Client Predicted Vehicle.
            })
        );

        expect(packet.itemStackRequest).toEqual({
            requestId: -3,
            actions: [],
            filterStrings: [],
            filterStringCause: 0
        });
        expect(packet.feof()).toBe(true);
    });

    it('reads the vehicle rotation and the predicted vehicle when the player rides', () => {
        const packet = decode(
            minimalInput((out) => {
                out.writeBoolean(false); // No Item Use Transaction.
                out.writeBoolean(false); // No Item Stack Request.
                out.writeBoolean(false); // No Player Block Actions.
                out.write(
                    Buffer.from([
                        0x01, // Vehicle Rotation present.
                        0x00,
                        0x00,
                        0x34,
                        0x42, // X: 45 as a float LE.
                        0x00,
                        0x00,
                        0xb4,
                        0x42, // Y: 90.
                        0x01, // Client Predicted Vehicle present.
                        0x99,
                        0x01 // -77 as a ZigZag varint64.
                    ])
                );
            })
        );

        expect(packet.vehicleRotation).toEqual({ x: 45, y: 90 });
        expect(packet.predictedVehicle).toBe(-77n);
        expect(packet.feof()).toBe(true);
    });

    it('refuses a flag count no client can send, rather than allocating for it', () => {
        const out = new BinaryStream();
        out.writeUnsignedVarInt(0x90);
        for (let i = 0; i < 8; i++) out.writeFloatLE(0); // Rotation, position, move vector, head rotation.
        out.writeUnsignedVarInt(5000);

        expect(() => decode(out.getBuffer())).toThrow(/5000/);
    });

    it('writes what it reads', () => {
        const packet = emptyInput();
        packet.pitch = 5;
        packet.yaw = 45;
        packet.headYaw = 40;
        packet.position = new Vector3(1, 2, 3);
        packet.inputData = new Set([PlayerAuthInputData.START_JUMPING, PlayerAuthInputData.UP]);
        packet.inputMode = InputMode.Mouse;
        packet.interactionModel = NewInteractionModel.Classic;
        packet.tick = 99n;
        packet.blockActions = [{ action: PlayerActionType.CrackBlock, position: new BlockPosition(1, -5, 2), face: 4 }];
        packet.vehicleRotation = { x: 1, y: 2 };
        packet.predictedVehicle = -77n;
        const encoded = encode(packet);

        const read = decode(encoded);

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
        const packet = emptyInput();
        packet.pitch = 10;
        packet.yaw = -90;
        packet.headYaw = -88;
        packet.position = new Vector3(1.5, 64, -3.5);
        packet.moveVector = { x: 0, y: 1 };
        packet.inputData = new Set([PlayerAuthInputData.SPRINTING, PlayerAuthInputData.VERTICAL_COLLISION]);
        packet.inputMode = InputMode.Mouse;
        packet.interactionModel = NewInteractionModel.Classic;
        packet.interactRotation = { x: 10, y: -90 };
        packet.tick = 1234n;
        packet.delta = new Vector3(0, -0.08, 0.1);
        packet.analogMoveVector = { x: 0, y: 1 };
        packet.cameraOrientation = new Vector3(0.2, -0.1, 0.97);
        packet.rawMoveVector = { x: 0, y: 1 };
        const encoded = encode(packet);

        expect(encoded).toEqual(minimalInput(noOptionals));
    });
});

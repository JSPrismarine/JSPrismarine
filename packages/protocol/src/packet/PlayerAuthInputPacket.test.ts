import BinaryStream from '@jsprismarine/binaryutils';
import { describe, expect, it } from 'vitest';

import NetworkBinaryStream from '../NetworkBinaryStream';
import { PacketIdentifier } from '../PacketIdentifier';
import { ItemStackRequestActionType } from '../wire/structures/ItemStackRequest';
import {
    ClientPlayMode,
    INPUT_FLAG_COUNT,
    InputMode,
    NewInteractionModel,
    PlayerAuthInputData
} from '../wire/structures/PlayerAuthInput';
import PlayerAuthInputPacket from './PlayerAuthInputPacket';
import { enumDumpMembers } from '../testing/evidence.test.helper';

/** `NON_DEPRECATED_NAME` for a dump name such as `StartUsingItem`. */
const screamingSnake = (name: string): string => name.replace(/(?<=[a-z0-9])(?=[A-Z])/g, '_').toUpperCase();

/** An empty item stack descriptor: id, stack size, aux value, no net id, block runtime id, no user data. */
const AIR = Buffer.alloc(8);

/**
 * One packet as a client writes it, every optional present, with each byte written by hand
 * so the test knows the layout instead of trusting the reader to agree with itself.
 *
 * Nothing here differs between 2193 and 2225 except the item stack request's action ids, and
 * a take is 0 at both.
 */
const fullInput = (): Buffer => {
    const out = new BinaryStream();
    out.writeUnsignedVarInt(0x90); // Header: 144.
    out.writeFloatLE(10); // Player Rotation: pitch, yaw.
    out.writeFloatLE(-90);
    out.writeFloatLE(1.5); // Position.
    out.writeFloatLE(64);
    out.writeFloatLE(-3.5);
    out.writeFloatLE(0); // Move Vector.
    out.writeFloatLE(1);
    out.writeFloatLE(-88); // Player Head Rotation.
    out.writeUnsignedVarInt(3); // Input Data: a varuint count, then one varint per flag.
    out.writeVarInt(PlayerAuthInputData.START_JUMPING);
    out.writeVarInt(PlayerAuthInputData.JUMP_DOWN);
    out.writeVarInt(PlayerAuthInputData.INTERNAL_UPDATE);
    out.writeUnsignedVarInt(InputMode.Touch); // Input Mode.
    out.writeUnsignedVarInt(ClientPlayMode.Normal); // Play Mode.
    out.writeVarInt(NewInteractionModel.Crosshair); // New Interaction Model.
    out.writeFloatLE(10); // Interact Rotation.
    out.writeFloatLE(-90);
    out.writeUnsignedVarLong(1234n); // Client Tick.
    out.writeFloatLE(0); // Pos Delta.
    out.writeFloatLE(-0.08);
    out.writeFloatLE(0.1);

    out.writeBoolean(true); // Item Use Transaction.
    out.writeVarInt(-2); // Legacy Request ID: valid, so the slot list follows.
    out.writeBoolean(true); // Legacy Set Item Slots.
    out.writeUnsignedVarInt(1);
    out.writeByte(28); // Container Enum: a raw uint8.
    out.writeUnsignedVarInt(2); // Slots.
    out.writeByte(3);
    out.writeByte(4);
    out.writeUnsignedVarInt(1); // Actions.
    out.writeUnsignedVarInt(2); // Source Type: WorldInteraction.
    out.writeBoolean(false); // No Container ID.
    out.writeBoolean(true); // Bit Flags.
    out.writeUnsignedVarInt(1);
    out.writeUnsignedVarInt(0); // Slot.
    out.write(AIR); // From Item.
    out.write(AIR); // To Item.
    out.writeVarInt(1); // Action Type: Use.
    out.writeByte(1); // Trigger Type: player input.
    out.writeVarInt(3); // Position, three signed varints.
    out.writeVarInt(-64);
    out.writeVarInt(-2);
    out.writeByte(1); // Face.
    out.writeVarInt(4); // Slot.
    out.writeByte(1); // Hand: offhand.
    out.write(AIR); // Item.
    out.writeFloatLE(3.5); // From Position.
    out.writeFloatLE(65.6);
    out.writeFloatLE(-1.5);
    out.writeFloatLE(0.5); // Click Position.
    out.writeFloatLE(1);
    out.writeFloatLE(0.5);
    out.writeUnsignedVarInt(7); // Target Block Id.
    out.writeByte(1); // Client Interact Prediction.
    out.writeByte(0); // Client Cooldown State.

    out.writeBoolean(true); // Item Stack Request.
    out.writeVarInt(-3); // Client Request Id.
    out.writeUnsignedVarInt(1); // Actions.
    out.writeUnsignedVarInt(0); // Variant index: take.
    out.writeByte(ItemStackRequestActionType.TAKE); // Action type.
    out.writeByte(12); // Amount.
    out.writeByte(59); // Source: Container Name, the cursor.
    out.writeBoolean(false); // Source: no Dynamic ID.
    out.writeByte(0); // Source: Slot.
    out.writeIntLE(70000); // Source: Net Id Variant.
    out.writeByte(12); // Destination: Container Name.
    out.writeBoolean(false); // Destination: no Dynamic ID.
    out.writeByte(5); // Destination: Slot.
    out.writeIntLE(0); // Destination: Net Id Variant.
    out.writeUnsignedVarInt(0); // Strings To Filter.
    out.writeIntLE(0); // StringsToFilterOrigin.

    out.writeBoolean(true); // Player Block Actions.
    out.writeUnsignedVarInt(2);
    out.writeVarInt(0); // StartDestroyBlock.
    out.writeVarInt(5); // Position, signed: a block below y=0 survives.
    out.writeVarInt(-12);
    out.writeVarInt(-7);
    out.writeVarInt(1); // Facing.
    out.writeVarInt(2); // StopDestroyBlock carries the default position and facing.
    out.writeVarInt(0);
    out.writeVarInt(0);
    out.writeVarInt(0);
    out.writeVarInt(0);

    out.writeBoolean(true); // Vehicle Rotation.
    out.writeFloatLE(15);
    out.writeFloatLE(-45);
    out.writeBoolean(true); // Client Predicted Vehicle: a zigzag varint64.
    out.writeVarLong(-9n);

    out.writeFloatLE(0); // Analog Move Vector.
    out.writeFloatLE(1);
    out.writeFloatLE(0.2); // Camera Orientation.
    out.writeFloatLE(-0.1);
    out.writeFloatLE(0.97);
    out.writeFloatLE(0); // Raw Move Vector.
    out.writeFloatLE(1);

    return out.getBuffer();
};

describe('PlayerAuthInputPacket', () => {
    it('carries packet id 144', () => {
        expect(new PlayerAuthInputPacket().getId()).toBe(PacketIdentifier.PLAYER_AUTH_INPUT);
        expect(PacketIdentifier.PLAYER_AUTH_INPUT).toBe(0x90);
    });

    describe.each([2193, 2225])('at protocol %i', (protocolVersion) => {
        it('reads every field in the docs order and reaches the end of the stream', () => {
            const stream = new NetworkBinaryStream(fullInput());
            const packet = new PlayerAuthInputPacket();
            const data = packet.deserialize(stream, { protocolVersion });

            expect(data.pitch).toBe(10);
            expect(data.yaw).toBe(-90);
            expect(data.headYaw).toBe(-88);
            expect([...data.inputData]).toEqual([
                PlayerAuthInputData.START_JUMPING,
                PlayerAuthInputData.JUMP_DOWN,
                PlayerAuthInputData.INTERNAL_UPDATE
            ]);
            expect(data.inputMode).toBe(InputMode.Touch);
            expect(data.interactionModel).toBe(NewInteractionModel.Crosshair);
            expect(data.tick).toBe(1234n);
            expect(data.itemUseTransaction?.legacySlotChanges).toHaveLength(1);
            expect(data.itemUseTransaction?.data.blockPosition.getY()).toBe(-64);
            expect(data.itemUseTransaction?.data.hand).toBe(1);
            expect(data.itemStackRequest?.requestId).toBe(-3);
            expect(data.blockActions).toHaveLength(2);
            expect(data.blockActions?.[0]?.position.y).toBe(-12);
            expect(data.vehicleRotation).toEqual({ x: 15, y: -45 });
            expect(data.predictedVehicle).toBe(-9n);
            expect(data.rawMoveVector).toEqual({ x: 0, y: 1 });
            expect(stream.feof()).toBe(true);
        });

        it('writes back the bytes it read', () => {
            const bytes = fullInput();
            const data = new PlayerAuthInputPacket().deserialize(new NetworkBinaryStream(bytes), { protocolVersion });

            const written = new PlayerAuthInputPacket(data).serialize(new NetworkBinaryStream(), { protocolVersion });

            expect(written).toEqual(bytes);
        });
    });

    it('numbers the input flags as the pinned game dump does, with the gaps at 2, 54 and 55', () => {
        // No Bedrock Dedicated Server capture of this packet exists, so the dump is the executable
        // evidence. The 1.26.50 page lists the members 0 to 62 with no gaps; the 1.26.60 page and
        // the dump skip 2, 54 and 55, and the 1.26.60 changelog's enum rows are the documentation
        // being corrected. InternalUpdate is the dump's INPUT_NUM slot, 65, as the 1.26.60 page has it.
        const members = enumDumpMembers('PlayerAuthInputPacket::InputData');
        const named = members.filter(
            ({ name }) => !name.endsWith('_DEPRECATED') && name !== 'INPUT_NUM' && name !== 'InternalUpdate'
        );
        const byName = new Map(
            Object.entries(PlayerAuthInputData)
                .filter((entry): entry is [string, number] => typeof entry[1] === 'number')
                .map(([name, value]) => [name, value])
        );

        expect(named).toHaveLength(62);
        for (const { name, value } of named) expect(byName.get(screamingSnake(name)), name).toBe(value);
        expect(byName.get('INTERNAL_UPDATE')).toBe(members.find(({ name }) => name === 'INPUT_NUM')?.value);
        expect(INPUT_FLAG_COUNT).toBe(66);
    });

    it('numbers the play modes, input modes and interaction models as the pinned game dump does', () => {
        const values = (name: string) =>
            Object.fromEntries(enumDumpMembers(name).map(({ name, value }) => [name, value]));

        expect(values('ClientPlayMode')).toMatchObject({
            Normal: ClientPlayMode.Normal,
            Teaser: ClientPlayMode.Teaser,
            Screen: ClientPlayMode.Screen,
            ExitLevel: ClientPlayMode.ExitLevel,
            NumModes: ClientPlayMode.NumModes
        });
        expect(values('InputMode')).toMatchObject({
            Undefined: InputMode.Undefined,
            Mouse: InputMode.Mouse,
            Touch: InputMode.Touch,
            GamePad: InputMode.GamePad,
            MotionController_Deprecated: InputMode.MotionController_Deprecated,
            Count: InputMode.Count
        });
        expect(values('NewInteractionModel')).toMatchObject({
            Touch: NewInteractionModel.Touch,
            Crosshair: NewInteractionModel.Crosshair,
            Classic: NewInteractionModel.Classic,
            Count: NewInteractionModel.Count
        });
    });
});

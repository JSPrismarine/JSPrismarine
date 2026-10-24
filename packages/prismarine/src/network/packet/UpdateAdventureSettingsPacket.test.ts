import { describe, expect, it } from 'vitest';

import Identifiers from '../Identifiers';
import UpdateAdventureSettingsPacket from './UpdateAdventureSettingsPacket';

// Header varuint 188, then the five bools in docs order: no PvM, no MvP, Immutable World,
// Show Name Tags, Auto Jump.
const wire = Buffer.from([0xbc, 0x01, 0x01, 0x00, 0x01, 0x00, 0x01]);

describe('UpdateAdventureSettingsPacket', () => {
    it('uses the network id the client expects', () => {
        expect(UpdateAdventureSettingsPacket.NetID).toBe(Identifiers.UpdateAdventureSettingsPacket);
        expect(UpdateAdventureSettingsPacket.NetID).toBe(188);
    });

    it('writes the five settings in docs order', () => {
        const packet = new UpdateAdventureSettingsPacket();
        packet.noAttackingMobs = true;
        packet.noAttackingPlayers = false;
        packet.worldImmutable = true;
        packet.showNameTags = false;
        packet.autoJump = true;
        packet.encode();

        expect(packet.getBuffer()).toEqual(wire);
    });

    it('reads a hand-built buffer back and consumes it all', () => {
        const packet = new UpdateAdventureSettingsPacket(wire);
        packet.decode();

        expect(packet.noAttackingMobs).toBe(true);
        expect(packet.noAttackingPlayers).toBe(false);
        expect(packet.worldImmutable).toBe(true);
        expect(packet.showNameTags).toBe(false);
        expect(packet.autoJump).toBe(true);
        expect(packet.feof()).toBe(true);
    });
});

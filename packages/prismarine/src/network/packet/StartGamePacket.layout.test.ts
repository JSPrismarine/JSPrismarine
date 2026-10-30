import BinaryStream from '@jsprismarine/binaryutils';
import { Vector3 } from '@jsprismarine/math';
import { layoutAt, startGamePacket } from '@jsprismarine/protocol';
import { describe, expect, it } from 'vitest';

import type Server from '../../Server';
import { stub } from '../../testing/stub.test.helper';
import GameRuleManager from '../../world/GameRuleManager';
import StartGamePacket from './StartGamePacket';

/**
 * The declarative layout must produce the same bytes as the classes it replaces, at both
 * versions. `StartGamePacket.test.ts` pins the 2193 bytes field by field and cross-decodes
 * them through the protocol package; this file holds the class to the layout and pins the
 * 2225 delta: one int8 inserted between Is Exported From Editor and Day Cycle Stop Time,
 * and nothing else.
 */
describe('the declarative StartGame layout against the packet class it replaces', () => {
    const build = (protocolVersion: number): StartGamePacket => {
        const packet = new StartGamePacket();
        packet.codecProtocol = protocolVersion;
        packet.entityId = -2n;
        packet.runtimeEntityId = 7n;
        packet.gamemode = 1;
        packet.playerPos = new Vector3(0.5, 64, -2);
        packet.pitch = 1;
        packet.yaw = 180;
        packet.seed = 258n;
        packet.worldSpawnPos = new Vector3(8, -60, -16);
        packet.gameRules = new GameRuleManager(stub<Server>());
        packet.time = 6000;
        packet.ticks = 1234;
        packet.levelId = 'level-id';
        packet.worldName = 'A world';
        packet.serverIdentifier = 'JSPrismarine';
        packet.scenarioIdentifier = 'scenario';
        packet.worldIdentifier = 'world-id';
        packet.editorLevelMigrationVersion = 1;
        return packet;
    };

    it('inserts exactly the Editor Level Migration Version int8 mid-list at 2225', () => {
        const base = build(2193);
        base.encodePayload();
        const extended = build(2225);
        extended.encodePayload();

        const bytes2193 = base.getBuffer();
        const bytes2225 = extended.getBuffer();
        expect(bytes2225.byteLength).toBe(bytes2193.byteLength + 1);

        // The first differing byte is the inserted int8 itself, and once it is cut back out
        // the two buffers differ only inside the Server Version string, which names each
        // protocol's newest game version by design.
        const firstDiff = bytes2225.findIndex((byte, index) => byte !== bytes2193[index]);
        expect(bytes2225[firstDiff]).toBe(1); // The inserted Editor Level Migration Version.

        const excised = Buffer.concat([bytes2225.subarray(0, firstDiff), bytes2225.subarray(firstDiff + 1)]);
        const versionAt = excised.indexOf('1.26.', 0, 'latin1');
        const differing = [...excised.keys()].filter((index) => excised[index] !== bytes2193[index]);
        expect(versionAt).toBeGreaterThan(0);
        for (const index of differing) {
            expect(index).toBeGreaterThanOrEqual(versionAt);
            expect(index).toBeLessThan(versionAt + '1.26.60'.length);
        }

        // Field-exact pin: decode both through the layout and compare payloads. The server
        // version string is the one other difference, by design: it names each protocol's
        // newest game version.
        const read2193 = layoutAt(startGamePacket, 2193).decode(new BinaryStream(bytes2193));
        const read2225 = layoutAt(startGamePacket, 2225).decode(new BinaryStream(bytes2225));
        expect(read2193.editorLevelMigrationVersion).toBe(0); // The fallback: not on the wire.
        expect(read2225.editorLevelMigrationVersion).toBe(1);
        expect(read2193.dayCycleStopTime).toBe(6000);
        expect(read2225.dayCycleStopTime).toBe(6000);
        expect({ ...read2193, editorLevelMigrationVersion: 1, serverVersion: read2225.serverVersion }).toEqual(
            read2225
        );
    });

    it('decodes what the class encoded, consuming the whole payload at both versions', () => {
        for (const version of [2193, 2225]) {
            const packet = build(version);
            packet.encodePayload();

            const stream = new BinaryStream(packet.getBuffer());
            const read = layoutAt(startGamePacket, version).decode(stream);
            expect(stream.feof()).toBe(true);
            expect(read).toMatchObject({
                entityId: -2n,
                runtimeEntityId: 7n,
                levelName: 'A world',
                currentTick: 1234n,
                serverId: 'JSPrismarine'
            });
        }
    });
});

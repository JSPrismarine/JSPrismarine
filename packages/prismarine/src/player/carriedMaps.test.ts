import { describe, expect, it } from 'vitest';

import { Vector3 } from '@jsprismarine/math';
import ClientboundMapItemDataPacket from '@jsprismarine/protocol/bedrock/packet/ClientboundMapItemDataPacket';
import type NetworkPacket from '@jsprismarine/protocol/NetworkPacket';

import type Server from '../Server';
import { BlockRuntimeIds } from '../block/state/BlockRuntimeIds';
import HumanInventory from '../inventory/HumanInventory';
import { Item } from '../item/Item';
import { identityNamed } from '../testing/sessionIdentity.test.helper';
import { stub } from '../testing/stub.test.helper';
import Chunk from '../world/chunk/Chunk';
import { Dimensions } from '../world/DimensionType';
import type { Level } from '../world/Level';
import type { World } from '../world/World';
import { Brightness, MapColors, packedMapColor } from '../world/mapColors';
import type { SavedMap } from '../world/savedMap';
import { MAP_SIZE, blankSavedMap } from '../world/savedMap';
import { tickCarriedMaps } from './carriedMaps';
import type PlayerSession from './PlayerSession';
import type { SessionPlayer } from './sessionPlayers';

const MAP_ID = 7;

/** One loaded chunk of grass at y 64, at the origin. */
const grassChunk = (): Chunk => {
    const chunk = new Chunk(0, 0);
    const grass = BlockRuntimeIds.getByName('minecraft:grass_block');
    for (let x = 0; x < 16; x++) for (let z = 0; z < 16; z++) chunk.setBlockRuntimeId(x, 64, z, grass);
    return chunk;
};

/** A player standing in that chunk with a map somewhere in its inventory, recording what it is sent. */
const playerWith = (map: SavedMap, slot: 'mainhand' | 'backpack' = 'mainhand', name = 'Steve') => {
    const sent: NetworkPacket<unknown>[] = [];
    // Whether the player is still on, and whether its next sends fail.
    const state = { connected: true, failing: false };
    const inventory = new HumanInventory();
    inventory
        .container('inventory')
        .set(slot === 'mainhand' ? 0 : 20, new Item({ name: 'minecraft:filled_map', count: 1, mapId: MAP_ID }));
    inventory.setHandSlot(0);

    const chunk = grassChunk();
    let world: World;
    const level = stub<Level>({
        getMap: (id: number) => (id === MAP_ID ? map : undefined),
        loadedWorld: (dimension: string) => (dimension === 'minecraft:overworld' ? world : undefined),
        getTicks: () => 0
    });
    world = stub<World>({
        getLevel: () => level,
        getDimension: () => Dimensions.Overworld,
        getLoadedChunk: (chunkX: number, chunkZ: number) => (chunkX === 0 && chunkZ === 0 ? chunk : null),
        isMapWaterAt: () => false
    });
    const player = stub<SessionPlayer>({
        getInventory: () => inventory,
        getPosition: () => new Vector3(8.5, 65, 8.5),
        yaw: 0
    });
    const server = stub<Server>({
        // A carved pumpkin hides its wearer from maps, as Java's tag says.
        getContent: () => stub({ tags: stub({ has: () => true, members: () => ['minecraft:carved_pumpkin'] }) })
    });
    const session = stub<PlayerSession>({
        identity: identityNamed(name),
        isConnected: () => state.connected,
        // A session that left has forgotten its player, as `PlayerSession.getPlayer` throws then.
        getPlayer: () => {
            if (!state.connected) throw new TypeError(`${name} has left`);
            return player;
        },
        getWorld: () => world,
        getServer: () => server,
        send: async (packet: NetworkPacket<unknown>) => {
            if (state.failing) throw new TypeError('the transport refused the packet');
            sent.push(packet);
        }
    });
    return { session, sent, state };
};

const mapPackets = (sent: readonly NetworkPacket<unknown>[]) =>
    sent.flatMap((packet) => (packet instanceof ClientboundMapItemDataPacket ? [packet.getPacketData()] : []));

const blank = () => blankSavedMap({ dimension: 'minecraft:overworld', x: 0, z: 0, scale: 0 });

describe('the maps a player carries, each tick', () => {
    it('sends a held map whole the first tick, with the player on it', async () => {
        const { session, sent } = playerWith(blank());

        await Promise.all(tickCarriedMaps(session));

        const [first] = mapPackets(sent);
        expect(first).toMatchObject({ mapId: BigInt(MAP_ID), width: MAP_SIZE, height: MAP_SIZE, startX: 0 });
        expect(first?.decorations).toHaveLength(1);
    });

    it('fills a held map in from the loaded terrain around the player over sixteen ticks', async () => {
        const map = blank();
        const { session, sent } = playerWith(map);

        for (let tick = 0; tick < 16; tick++) await Promise.all(tickCarriedMaps(session));

        // The player's chunk is pixels 64 to 79 of a map centered on the origin; nothing else is loaded.
        const at = (x: number, z: number) => map.colors?.[x + z * MAP_SIZE];
        expect(at(70, 70)! >> 2).toBe(MapColors.grass.id);
        expect(at(70, 70)).toBe(packedMapColor(MapColors.grass.id, Brightness.NORMAL));
        expect(at(40, 40)).toBe(0);
        // After the first, whole one, each update carries only what changed.
        const later = mapPackets(sent).slice(1);
        expect(later.length).toBeGreaterThan(0);
        expect(later.every((data) => (data?.width ?? 0) <= 16)).toBe(true);
    });

    it('marks but does not fill in a map carried in the inventory rather than the hand', async () => {
        const map = blank();
        const { session } = playerWith(map, 'backpack');

        for (let tick = 0; tick < 16; tick++) await Promise.all(tickCarriedMaps(session));

        expect(map.colors?.every((color) => color === 0)).toBe(true);
    });

    it('does not fill in a locked map', async () => {
        const map = { ...blank(), locked: true };
        const { session, sent } = playerWith(map);

        for (let tick = 0; tick < 16; tick++) await Promise.all(tickCarriedMaps(session));

        expect(map.colors?.every((color) => color === 0)).toBe(true);
        expect(mapPackets(sent)[0]?.isLocked).toBe(true);
    });

    it('does not fill in a map of another dimension', async () => {
        const map = { ...blank(), dimension: 'minecraft:the_nether' };
        const { session, sent } = playerWith(map);

        await Promise.all(tickCarriedMaps(session));

        // Nobody has loaded the Nether, so there is nothing to draw it from or send it with.
        expect(sent).toEqual([]);
    });

    it('sends a held map whole again when the transport refused the first send', async () => {
        const { session, sent, state } = playerWith(blank());
        state.failing = true;
        await Promise.allSettled(tickCarriedMaps(session));
        expect(sent).toEqual([]);

        state.failing = false;
        await Promise.all(tickCarriedMaps(session));

        const [resent] = mapPackets(sent);
        expect(resent).toMatchObject({ startX: 0, startY: 0, width: MAP_SIZE, height: MAP_SIZE });
        // The markers follow on Java's cadence, within five updates.
        for (let tick = 0; tick < 5; tick++) await Promise.all(tickCarriedMaps(session));
        expect(mapPackets(sent).some((data) => data?.decorations?.length === 1)).toBe(true);
    });

    it("ticks a map on as a holder who left and wore a pumpkin is dropped, without reading the holder's player", async () => {
        const map = blank();
        const steve = playerWith(map);
        const alex = playerWith(map, 'mainhand', 'Alex');
        await Promise.all(tickCarriedMaps(steve.session));
        await Promise.all(tickCarriedMaps(alex.session));

        steve.state.connected = false;

        expect(() => tickCarriedMaps(alex.session)).not.toThrow();
    });
});

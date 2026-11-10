/**
 * A player in the entity store, shown to other clients through the current replicator.
 *
 * The viewers are real players with real sessions, the replicator is the real one and the store
 * player is spawned the way package C4b's tests spawn one. Only the world around them is a
 * double that hands the store actors' announcements to the replicator, as `World` does. The
 * assertions count the packets each viewer receives.
 */
import type { Logger } from '@jsprismarine/logger';
import { Gametype, WindowIds } from '@jsprismarine/minecraft';
import AddPlayerPacket from '@jsprismarine/protocol/packet/AddPlayerPacket';
import MobArmorEquipmentPacket from '@jsprismarine/protocol/packet/MobArmorEquipmentPacket';
import MobEquipmentPacket from '@jsprismarine/protocol/packet/MobEquipmentPacket';
import MoveActorAbsolutePacket from '@jsprismarine/protocol/packet/MoveActorAbsolutePacket';
import type NetworkPacket from '@jsprismarine/protocol/NetworkPacket';
import RemoveActorPacket from '@jsprismarine/protocol/packet/RemoveActorPacket';
import UpdateAbilitiesPacket, { AbilityLayerFlag } from '@jsprismarine/protocol/packet/UpdateAbilitiesPacket';
import type Skin from '@jsprismarine/protocol/wire/structures/skin/Skin';
import UUID from '@jsprismarine/protocol/wire/structures/UUID';
import { isRecord } from '@jsprismarine/entities';
import { describe, expect, it } from 'vitest';

import type { Config } from '../../config/Config';
import { Item } from '../../item/Item';
import Codec2193 from '../../network/codec/Codec2193';
import { NetworkWorldReplicator } from '../../network/NetworkWorldReplicator';
import { playerListEntryOf } from '../../network/playerListEntry';
import type { PermissionManager } from '../../permission/PermissionManager';
import type Server from '../../Server';
import { fakePlayer } from '../../testing/fakePlayer.test.helper';
import { stub } from '../../testing/stub.test.helper';
import type { World } from '../../world/World';
import { Entity } from '../Entity';
import { EYE_HEIGHT } from '../Human';
import { PLAYER_IDENTIFIER } from '../playerOverlay';
import ContainerEntry from '../../inventory/ContainerEntry';
import type { StorePlayer } from '../storePlayer';
import type { StorePlayerIdentity } from '../storePlayer';
import { entityFixture, FLOOR_Y } from './testing';
import { StoreActors } from './storeActors';
import { spawnStorePlayer, StorePlayerActor, StorePlayers } from './storePlayers';

/** The parts of the shipped `entities/player.json` these checks read. */
const SHIPPED_PLAYER = {
    components: {
        'minecraft:collision_box': { width: 0.6, height: 1.8 },
        'minecraft:type_family': { family: ['player'] },
        'minecraft:loot': { table: 'loot_tables/empty.json' },
        'minecraft:movement': { value: 0.1 }
    }
};

/** Where the store player's feet are: on the fixture floor, a block from the viewers. */
const FEET = { x: 1.5, y: FLOOR_Y + 1, z: 0.5 };

/** Who a test's store player is. */
const identityOf = (name: string): StorePlayerIdentity => ({
    uuid: UUID.fromRandom(),
    name,
    xuid: '2535400000000000'
});

/** One stack for a slot. */
const entryOf = (name: string) => new ContainerEntry({ item: new Item({ runtimeId: 0, name }), count: 1 });

const fixture = () => {
    // Ids from the server's own counter, so a store player and the viewers never share one.
    const store = entityFixture(undefined, {}, { [PLAYER_IDENTIFIER]: SHIPPED_PLAYER }, () => {
        Entity.runtimeIdCount += 1n;
        return Number(Entity.runtimeIdCount);
    });
    const viewers = [fakePlayer({ name: 'Alex' }), fakePlayer({ name: 'Sam' })];
    for (const viewer of viewers) viewer.player.viewDistance = 4;

    const server = stub<Server>({
        getContent: () => store.content,
        getPermissionManager: () => stub<PermissionManager>({ isOp: () => false }),
        getConfig: () =>
            stub<Config>({
                getProximityBroadcast: () => true,
                getPacketCompressionLevel: () => 0,
                getPacketCompressionThreshold: () => 256
            }),
        getLogger: () => stub<Logger>({ verbose: () => {}, error: (error) => void reports.push(String(error)) })
    });
    const reports: string[] = [];
    // The world's own wiring of the actors' announcements to its replicator.
    const world: World = stub<World>({
        getName: () => 'test',
        getServer: () => server,
        getPlayers: () => viewers.map((viewer) => viewer.player),
        shownActors: () => [...actors.all()],
        showActor: async (actor) => replicator.entityAdded(actor),
        hideActor: async (actor) => replicator.entityRemoved(actor),
        broadcastMove: async (actor, teleport) => replicator.entityMoved(actor, teleport),
        sendActorMetadata: async (actor) => replicator.entityMetadataChanged(actor),
        entityEquipmentChanged: (actor) => void replicator.entityEquipmentChanged(actor)
    });
    const replicator = new NetworkWorldReplicator(world, server);
    const players = new StorePlayers();
    const actors = new StoreActors({
        world: () => world,
        report: (message) => void reports.push(message),
        blows: { hurt: () => false, written: () => {}, heal: () => false },
        playerActor: (entity, at, blows) => players.actorOf(entity, at, blows)
    });

    /**
     * Spawns a store player and announces it, as the live runtime's `onSpawn` does.
     * @param fill - Writes the player's parts before it is shown.
     */
    const spawn = (identity: StorePlayerIdentity, fill?: (player: StorePlayer) => void) => {
        const player = spawnStorePlayer(store.runtime, players, FEET, identity, (spawned) => {
            spawned.skin = stub<Skin>({});
            fill?.(spawned);
        });
        if (player === undefined) throw new Error('the fixture declares no player');
        actors.add(player.entity);
        const actor = actors.actorOf(player.entity.id);
        if (!(actor instanceof StorePlayerActor)) throw new Error('the player was given no player actor');
        return { player, entity: player.entity, actor };
    };

    /** One world tick's sends: what changed in the store, then the movement flush. */
    const tick = async () => {
        await Promise.all(actors.sync(store.runtime));
        await replicator.flushMovement();
    };

    return { store, viewers, actors, replicator, reports, spawn, tick };
};

/** Lets the announcements the actors start without awaiting reach the connections. */
const settle = () => new Promise<void>((resolve) => setImmediate(resolve));

/** The entity a packet names, whether it keeps its fields on itself or in its payload. */
const entityOf = (packet: NetworkPacket<unknown>): bigint | undefined => {
    if (packet instanceof RemoveActorPacket) return packet.uniqueEntityId;
    if (packet instanceof MoveActorAbsolutePacket) return packet.runtimeEntityId;
    const data = packet.getPacketData();
    return isRecord(data) && typeof data['runtimeEntityId'] === 'bigint' ? data['runtimeEntityId'] : undefined;
};

/** The packets of one type a viewer received, naming `runtimeId` when one is given. */
const ofType = <T extends NetworkPacket<unknown>>(
    sent: readonly unknown[],
    type: abstract new (...args: never[]) => T,
    runtimeId?: bigint
): T[] =>
    sent.filter(
        (packet): packet is T => packet instanceof type && (runtimeId === undefined || entityOf(packet) === runtimeId)
    );

const itemName = (descriptor: Parameters<typeof Item.fromStackDescriptor>[1]): string =>
    Item.fromStackDescriptor(Codec2193.context, descriptor).getName();

const payloadOf = <T>(packet: NetworkPacket<T>): T => {
    const data = packet.getPacketData();
    if (data === null) throw new Error(`${packet.getName()} has no payload`);
    return data;
};

describe('a store player shown to other clients', () => {
    it('reaches each viewer as one AddPlayer, with the packets a legacy player is shown with', async () => {
        const { viewers, spawn } = fixture();
        const [alex] = viewers;
        const identity = identityOf('Steve');
        const { actor } = spawn(identity, (player) => {
            player.headYaw = 30;
        });
        await settle();

        for (const viewer of viewers) {
            const added = ofType(viewer.sent, AddPlayerPacket);
            expect(added).toHaveLength(1);
            const data = payloadOf(added[0]!);
            expect(data.runtimeEntityId).toBe(actor.getRuntimeId());
            expect(data.uuid.equals(identity.uuid)).toBe(true);
            expect(data.headYaw).toBe(30);
            expect(data.name).toBe('Steve');
            // A client draws a player at its eyes, which is where a legacy player stands.
            expect(data.position.getY()).toBeCloseTo(FEET.y + EYE_HEIGHT);
            expect(data.metadata.nameTag).toBe('Steve');
        }

        // What a legacy player is shown with, in the same order, from the same code.
        const legacy = fakePlayer({ name: 'Legacy' });
        const before = alex!.sent.length;
        await alex!.player.getNetworkSession().sendAddPlayer(legacy.player);
        const names = (packets: readonly NetworkPacket<unknown>[]) => packets.map((packet) => packet.getName());
        expect(names(alex!.sent.slice(0, before))).toEqual(names(alex!.sent.slice(before)));
    });

    it('is never shown to the client whose own entity it is', async () => {
        const { viewers, spawn, tick, store, actors } = fixture();
        const [own, other] = viewers;
        // C4h's session holds its store entity's id; a legacy viewer given that id stands in.
        const { entity } = spawn(identityOf('Steve'), (spawned) => {
            Object.assign(own!.player, { getRuntimeId: () => BigInt(spawned.entity.id) });
        });
        const ownId = BigInt(entity.id);
        await settle();
        // The periodic pass, which hands every viewer every actor.
        for (const viewer of viewers)
            await viewer.player.getNetworkSession().reconcileTrackedEntities([...actors.all()]);

        store.runtime.applyClientMovement(entity.id, {
            position: { x: 3.5, y: FEET.y, z: 0.5 },
            yaw: 90,
            pitch: 0,
            onGround: true
        });
        await tick();

        expect(ofType(own!.sent, AddPlayerPacket)).toHaveLength(0);
        expect(ofType(own!.sent, MoveActorAbsolutePacket, ownId)).toHaveLength(0);
        expect(ofType(other!.sent, AddPlayerPacket, ownId)).toHaveLength(1);
        expect(ofType(other!.sent, MoveActorAbsolutePacket, ownId)).toHaveLength(1);
    });

    it('sends at most one move a tick, from where the client last said it was', async () => {
        const { viewers, spawn, tick, store } = fixture();
        const { entity, actor } = spawn(identityOf('Steve'));
        await settle();

        for (const x of [2, 2.5, 3]) {
            store.runtime.applyClientMovement(entity.id, {
                position: { x, y: FEET.y, z: 0.5 },
                yaw: 45,
                pitch: 10,
                onGround: true
            });
        }
        await tick();
        // A tick in which the client reported nothing new sends nothing.
        await tick();

        for (const viewer of viewers) {
            const moves = ofType(viewer.sent, MoveActorAbsolutePacket, actor.getRuntimeId());
            expect(moves).toHaveLength(1);
            expect(moves[0]!.position.getX()).toBe(3);
            expect(moves[0]!.position.getY()).toBeCloseTo(FEET.y + EYE_HEIGHT);
            expect(moves[0]!.yaw).toBe(45);
            expect(moves[0]!.flags & MoveActorAbsolutePacket.FLAG_ON_GROUND).not.toBe(0);
        }
    });

    it('shows what it holds and wears when it comes into view, and each change after', async () => {
        const { viewers, spawn, tick } = fixture();
        const { player, actor } = spawn(identityOf('Steve'), (spawned) => {
            const inventory = spawned.getInventory();
            inventory.setItem(inventory.getHandSlotIndex(), entryOf('minecraft:diamond_sword'));
            inventory.getArmor().setItem(1, entryOf('minecraft:iron_chestplate'));
        });
        await settle();

        const [alex] = viewers;
        const added = payloadOf(ofType(alex!.sent, AddPlayerPacket)[0]!);
        expect(itemName(added.carriedItem)).toBe('minecraft:diamond_sword');
        expect(ofType(alex!.sent, MobArmorEquipmentPacket, actor.getRuntimeId())).toHaveLength(1);

        alex!.sent.length = 0;
        await tick();
        // Nothing changed, so nothing is sent.
        expect(ofType(alex!.sent, MobArmorEquipmentPacket)).toHaveLength(0);

        const inventory = player.getInventory();
        inventory.setItem(inventory.getHandSlotIndex(), entryOf('minecraft:bow'));
        await tick();
        await settle();
        expect(ofType(alex!.sent, MobArmorEquipmentPacket, actor.getRuntimeId())).toHaveLength(1);
        // The main hand; the off hand follows in a packet of its own window.
        const held = ofType(alex!.sent, MobEquipmentPacket, actor.getRuntimeId()).filter(
            (packet) => payloadOf(packet).windowId === WindowIds.INVENTORY
        );
        expect(held.map((packet) => itemName(payloadOf(packet).item))).toEqual(['minecraft:bow']);
    });

    it("shows its game mode and abilities from its store player and the server's operator list", async () => {
        const { viewers, spawn } = fixture();
        spawn(identityOf('Steve'), (player) => {
            player.gamemode = Gametype.CREATIVE;
        });
        await settle();

        const [alex] = viewers;
        expect(payloadOf(ofType(alex!.sent, AddPlayerPacket)[0]!).gamemode).toBe(Gametype.CREATIVE);
        const abilities = ofType(alex!.sent, UpdateAbilitiesPacket);
        expect(abilities).toHaveLength(1);
        const layer = abilities[0]!.abilityLayers[0]!;
        expect(layer.layerFlags.get(AbilityLayerFlag.INSTABUILD)).toBe(true);
        expect(layer.layerFlags.get(AbilityLayerFlag.OPERATOR_COMMANDS)).toBe(false);
    });

    it('is listed with the entry a legacy player is listed with', () => {
        const { spawn } = fixture();
        const identity = identityOf('Steve');
        const { player, actor } = spawn(identity);

        const entry = playerListEntryOf(actor);
        expect(entry.getUUID().equals(identity.uuid)).toBe(true);
        expect(entry.getName()).toBe('Steve');
        expect(entry.getXUID()).toBe(identity.xuid);
        expect(entry.getSkin()).toBe(player.skin);
        expect(entry.getRuntimeId()).toBe(actor.getRuntimeId());
    });

    it('stays on screen through its death and leaves every screen once when it leaves the store', async () => {
        const { viewers, spawn, tick, store, actors } = fixture();
        const { entity, actor } = spawn(identityOf('Steve'));
        await settle();

        // Death keeps a player in the store (ADR 0008), so nobody is told to remove it.
        store.runtime.hurt(entity, undefined, 'entity_attack', 50);
        await tick();
        for (const viewer of viewers) expect(ofType(viewer.sent, RemoveActorPacket)).toHaveLength(0);

        // A leave or a dimension change takes the player out of this store.
        actors.remove(entity);
        await settle();
        for (const viewer of viewers) {
            expect(ofType(viewer.sent, RemoveActorPacket, actor.getRuntimeId())).toHaveLength(1);
            expect(viewer.player.getNetworkSession().tracks(actor.getRuntimeId())).toBe(false);
            expect(ofType(viewer.sent, AddPlayerPacket)).toHaveLength(1);
        }
    });

    it('is shown as a plain actor when no store player is filed for it', () => {
        const { store, actors } = fixture();
        const entity = store.runtime.spawn(PLAYER_IDENTIFIER, FEET);
        if (entity === undefined) throw new Error('the fixture declares no player');
        actors.add(entity);
        expect(actors.actorOf(entity.id)).not.toBeInstanceOf(StorePlayerActor);
    });
});

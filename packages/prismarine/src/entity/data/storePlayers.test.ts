/**
 * A player in the entity store, shown to other clients from the change log.
 *
 * The viewers are real players with real sessions, the replicator is the real one and the store
 * player is spawned the way package C4b's tests spawn one. Only the world around them is a
 * double that hands each sealed tick of the store's log to the replicator, as `World` does. The
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
import SetActorDataPacket from '@jsprismarine/protocol/packet/SetActorDataPacket';
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
import { entityIds } from '../entityIds';
import { EYE_HEIGHT } from '../playerEyes';
import { PLAYER_IDENTIFIER } from '../playerOverlay';
import ContainerEntry from '../../inventory/ContainerEntry';
import type { StorePlayer } from '../storePlayer';
import type { StorePlayerIdentity } from '../storePlayer';
import { entityFixture, FLOOR_Y } from './testing';
import { StoreActors } from './storeActors';
import { leaveStore, spawnStorePlayer, StorePlayerActor, StorePlayers } from './storePlayers';
import { replicateEntities } from '../../testing/changeTicks.test.helper';

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
    // Ids from the server's own counter, so a store player and the viewers never share one,
    // unless a test hands the next spawn an id of its own.
    let nextId: number | undefined;
    const store = entityFixture(undefined, {}, { [PLAYER_IDENTIFIER]: SHIPPED_PLAYER }, () => {
        const claimed = nextId;
        nextId = undefined;
        if (claimed !== undefined) return claimed;
        return entityIds.next();
    });
    /** Gives the next spawned entity this id. */
    const spawnNextAs = (id: bigint) => {
        nextId = Number(id);
    };
    const viewers = [fakePlayer({ name: 'Alex' }), fakePlayer({ name: 'Sam' })];
    for (const viewer of viewers) viewer.session['viewDistance'] = 4;

    const players = new StorePlayers();
    const server = stub<Server>({
        getContent: () => store.content,
        getStorePlayers: () => players,
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
    const world: World = stub<World>({
        getName: () => 'test',
        getServer: () => server,
        getViewers: () => viewers.map((viewer) => viewer.session),
        viewerOf: (runtimeId) => viewers.find((viewer) => viewer.player.getRuntimeId() === runtimeId)?.session,
        shownEntities: () => replicator.shownEntities()
    });
    const replicator = new NetworkWorldReplicator(world, server);
    const actors = new StoreActors({
        world: () => world,
        report: (message) => void reports.push(message),
        blows: { hurt: () => false, written: () => {}, heal: () => false },
        playerActor: (entity, at, blows) => players.actorOf(entity, at, blows)
    });

    /**
     * One world tick around `work`: its writes logged, then what replication sends of the sealed
     * tick, the movement last.
     */
    const tick = async (work: () => void = () => {}) => {
        store.runtime.store.beginTick();
        work();
        const sealed = store.runtime.store.sealTick();
        if (sealed !== undefined) replicator.tickSealed(sealed);
        await replicateEntities(replicator);
        await replicator.flushMovement();
    };

    /**
     * Spawns a store player in a tick of its own, as the live runtime's `onSpawn` gives it an actor.
     * @param fill - Writes the player's parts before it is shown.
     */
    const spawn = async (identity: StorePlayerIdentity, fill?: (player: StorePlayer) => void) => {
        let player: StorePlayer | undefined;
        await tick(() => {
            player = spawnStorePlayer(store.runtime, players, FEET, identity, (spawned) => {
                spawned.skin = stub<Skin>({});
                fill?.(spawned);
            });
            if (player?.entity !== undefined) actors.add(player.entity);
        });
        const entity = player?.entity;
        if (player === undefined || entity === undefined) throw new Error('the fixture declares no player');
        const actor = actors.actorOf(entity.id);
        if (!(actor instanceof StorePlayerActor)) throw new Error('the player was given no player actor');
        return { player, entity, actor };
    };

    return { store, viewers, actors, replicator, reports, spawn, spawnNextAs, tick };
};

/** The entity a packet names, whether it keeps its fields on itself or in its payload. */
const entityOf = (packet: NetworkPacket<unknown>): bigint | undefined => {
    if (packet instanceof RemoveActorPacket) return packet.uniqueEntityId;
    if (packet instanceof MoveActorAbsolutePacket || packet instanceof SetActorDataPacket)
        return packet.runtimeEntityId;
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
        const identity = identityOf('Steve');
        const { actor } = await spawn(identity, (player) => {
            player.headYaw = 30;
        });

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
            // What a legacy player was shown with, in the same order.
            expect(
                viewer.sent
                    .filter(
                        (packet) => entityOf(packet) === actor.getRuntimeId() || packet instanceof UpdateAbilitiesPacket
                    )
                    .map((packet) => packet.getName())
            ).toEqual(['AddPlayerPacket', 'UpdateAbilitiesPacket', 'MobArmorEquipmentPacket', 'MobEquipmentPacket']);
        }
    });

    it('is never shown to the client whose own entity it is', async () => {
        const { viewers, spawn, spawnNextAs, tick, store, replicator } = fixture();
        const [own, other] = viewers;
        // C4h's session holds its store entity's id; a store entity given a legacy viewer's id
        // stands in.
        spawnNextAs(own!.player.getRuntimeId());
        const { entity } = await spawn(identityOf('Steve'));
        const ownId = BigInt(entity.id);
        // The periodic pass, which hands every viewer every entity.
        await replicator.reconcile();

        await tick(() =>
            store.runtime.applyClientMovement(entity.id, {
                position: { x: 3.5, y: FEET.y, z: 0.5 },
                yaw: 90,
                pitch: 0,
                onGround: true
            })
        );

        expect(ofType(own!.sent, AddPlayerPacket)).toHaveLength(0);
        expect(ofType(own!.sent, MoveActorAbsolutePacket, ownId)).toHaveLength(0);
        expect(ofType(other!.sent, AddPlayerPacket, ownId)).toHaveLength(1);
        expect(ofType(other!.sent, MoveActorAbsolutePacket, ownId)).toHaveLength(1);
    });

    it('sends at most one move a tick, from where the client last said it was', async () => {
        const { viewers, spawn, tick, store } = fixture();
        const { entity, actor } = await spawn(identityOf('Steve'));

        await tick(() => {
            for (const x of [2, 2.5, 3]) {
                store.runtime.applyClientMovement(entity.id, {
                    position: { x, y: FEET.y, z: 0.5 },
                    yaw: 45,
                    pitch: 10,
                    onGround: true
                });
            }
        });
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

    it('sends a move for a turn of the head alone', async () => {
        const { viewers, spawn, tick } = fixture();
        const { player, actor } = await spawn(identityOf('Steve'));
        for (const viewer of viewers) viewer.sent.length = 0;

        await tick(() => (player.headYaw = 30));
        await tick();

        for (const viewer of viewers) {
            const moves = ofType(viewer.sent, MoveActorAbsolutePacket, actor.getRuntimeId());
            expect(moves.map((move) => move.headYaw)).toEqual([30]);
        }
    });

    it('shows what it holds and wears when it comes into view, and each change after', async () => {
        const { viewers, spawn, tick } = fixture();
        const { player, actor } = await spawn(identityOf('Steve'), (spawned) => {
            const inventory = spawned.getInventory();
            inventory.setItem(inventory.getHandSlotIndex(), entryOf('minecraft:diamond_sword'));
            inventory.getArmor().setItem(1, entryOf('minecraft:iron_chestplate'));
        });

        const [alex] = viewers;
        const added = payloadOf(ofType(alex!.sent, AddPlayerPacket)[0]!);
        expect(itemName(added.carriedItem)).toBe('minecraft:diamond_sword');
        const armor = ofType(alex!.sent, MobArmorEquipmentPacket, actor.getRuntimeId());
        expect(armor.map((packet) => itemName(payloadOf(packet).chest))).toEqual(['minecraft:iron_chestplate']);

        alex!.sent.length = 0;
        await tick();
        // Nothing changed, so nothing is sent.
        expect(ofType(alex!.sent, MobArmorEquipmentPacket)).toHaveLength(0);

        const inventory = player.getInventory();
        await tick(() => inventory.setItem(inventory.getHandSlotIndex(), entryOf('minecraft:bow')));
        expect(ofType(alex!.sent, MobArmorEquipmentPacket, actor.getRuntimeId())).toHaveLength(1);
        // The main hand; the off hand follows in a packet of its own window.
        const held = ofType(alex!.sent, MobEquipmentPacket, actor.getRuntimeId()).filter(
            (packet) => payloadOf(packet).windowId === WindowIds.INVENTORY
        );
        expect(held.map((packet) => itemName(payloadOf(packet).item))).toEqual(['minecraft:bow']);
    });

    it("shows its game mode and abilities from its store player and the server's operator list", async () => {
        const { viewers, spawn } = fixture();
        await spawn(identityOf('Steve'), (player) => {
            player.gamemode = Gametype.CREATIVE;
        });

        const [alex] = viewers;
        expect(payloadOf(ofType(alex!.sent, AddPlayerPacket)[0]!).gamemode).toBe(Gametype.CREATIVE);
        const abilities = ofType(alex!.sent, UpdateAbilitiesPacket);
        expect(abilities).toHaveLength(1);
        const layer = abilities[0]!.abilityLayers[0]!;
        expect(layer.layerFlags.get(AbilityLayerFlag.INSTABUILD)).toBe(true);
        expect(layer.layerFlags.get(AbilityLayerFlag.OPERATOR_COMMANDS)).toBe(false);
    });

    it('sends its breath in steps, and its sprint and flight as they change', async () => {
        const { viewers, spawn, tick } = fixture();
        const [alex] = viewers;
        const { player, actor } = await spawn(identityOf('Steve'), (spawned) => {
            spawned.getComponents().set('vitals.air', 250);
            spawned.getComponents().set('abilities.gamemode', Gametype.CREATIVE);
        });
        const components = player.getComponents();
        expect([actor.metadata.air, actor.metadata.breathing, actor.metadata.canFly]).toEqual([250, true, true]);

        // Under the bar's step, nothing to send; across it, or a change of breathing, a send.
        const sends: number[] = [];
        const writes: (() => void)[] = [
            () => components.set('vitals.air', 249),
            () => components.set('vitals.air', 245),
            () => components.set('vitals.breathing', false),
            () => components.set('movement.sprinting', true),
            () => components.set('abilities.gamemode', Gametype.SURVIVAL)
        ];
        for (const write of writes) {
            alex!.sent.length = 0;
            await tick(write);
            sends.push(ofType(alex!.sent, SetActorDataPacket, actor.getRuntimeId()).length);
        }

        expect(sends).toEqual([1, 0, 1, 1, 1]);
        expect([actor.metadata.air, actor.metadata.sprinting, actor.metadata.canFly]).toEqual([245, true, false]);
    });

    it('is listed with the entry a legacy player is listed with', async () => {
        const { spawn } = fixture();
        const identity = identityOf('Steve');
        const { player, actor } = await spawn(identity);

        const entry = playerListEntryOf(actor);
        expect(entry.getUUID().equals(identity.uuid)).toBe(true);
        expect(entry.getName()).toBe('Steve');
        expect(entry.getXUID()).toBe(identity.xuid);
        expect(entry.getSkin()).toBe(player.skin);
        expect(entry.getRuntimeId()).toBe(actor.getRuntimeId());
    });

    it('stays on screen through its death and leaves every screen once when it leaves the store', async () => {
        const { viewers, spawn, tick, store } = fixture();
        const { player, entity, actor } = await spawn(identityOf('Steve'));

        // Death keeps a player in the store (ADR 0008), so nobody is told to remove it.
        await tick(() => store.runtime.hurt(entity, undefined, 'entity_attack', 50));
        for (const viewer of viewers) expect(ofType(viewer.sent, RemoveActorPacket)).toHaveLength(0);

        // A leave or a dimension change takes the player out of this store.
        await tick(() => leaveStore(store.runtime, player, 'left_world'));
        for (const viewer of viewers) {
            expect(ofType(viewer.sent, RemoveActorPacket, actor.getRuntimeId())).toHaveLength(1);
            expect(viewer.session.tracks(actor.getRuntimeId())).toBe(false);
            expect(ofType(viewer.sent, AddPlayerPacket)).toHaveLength(1);
        }
    });

    it('takes one update a tick, whichever actor it is updated through', async () => {
        const { spawn, actors } = fixture();
        const { entity, actor } = await spawn(identityOf('Steve'));
        expect(actor.claimUpdate(1)).toBe(true);

        // A dimension change mid-tick gives the player a new actor in a world ticked later.
        actors.remove(entity);
        actors.add(entity);
        const arrived = actors.actorOf(entity.id);
        expect(arrived).not.toBe(actor);
        expect(arrived?.claimUpdate(1)).toBe(false);
        expect(arrived?.claimUpdate(2)).toBe(true);
    });

    it('is shown as a plain actor when no store player is filed for it', () => {
        const { store, actors } = fixture();
        const entity = store.runtime.spawn(PLAYER_IDENTIFIER, FEET);
        if (entity === undefined) throw new Error('the fixture declares no player');
        actors.add(entity);
        expect(actors.actorOf(entity.id)).not.toBeInstanceOf(StorePlayerActor);
    });
});

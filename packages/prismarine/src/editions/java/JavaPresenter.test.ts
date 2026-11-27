import { Vector3 } from '@jsprismarine/math';
import { Difficulty, Gametype } from '@jsprismarine/minecraft';
import type { JavaPacketDefinition, JavaPayload } from '@jsprismarine/protocol/java/packet/JavaPacket';
import { BLOCK_STATES, CONFIGURATION, ENTITY_TYPES, ITEMS } from '@jsprismarine/protocol/java/versions/newest';
import { describe, expect, it } from 'vitest';

import { BlockRuntimeIds } from '../../block/state/BlockRuntimeIds';
import { EYE_HEIGHT } from '../../entity/playerEyes';
import { stub } from '../../testing/stub.test.helper';
import Chunk from '../../world/chunk/Chunk';
import type { World } from '../../world/World';
import type { WorldSystems } from '../../world/WorldSystems';
import type PlayerSession from '../../player/PlayerSession';
import type { ShownBossBar, ShownMessage } from '../../player/presenter/SessionPresenter';
import type { ShownEntity, ShownEntityFacts } from '../../world/ShownActor';
import { JavaBossBarColor, JavaBossBarOverlay, JavaBossEventOperation } from '@jsprismarine/protocol/java/packet/play';
import {
    bossBarUuidOf,
    javaBossBarTitleOf,
    javaGameModeOf,
    JavaPresenter,
    javaRawTextOf,
    javaTextOf
} from './JavaPresenter';

const message = (fields: Partial<ShownMessage>): ShownMessage => ({
    message: 'hello',
    kind: 'raw',
    parameters: [],
    needsTranslation: false,
    sourceName: '',
    xuid: '',
    ...fields
});

describe('javaTextOf', () => {
    it("draws a player's chat as vanilla's <name> line", () => {
        expect(javaTextOf(message({ kind: 'chat', sourceName: 'Steve' }))).toEqual({
            translate: 'chat.type.text',
            with: ['Steve', 'hello']
        });
    });

    it('turns a Bedrock translation into a Java one, without the % Bedrock marks keys with', () => {
        expect(
            javaTextOf(
                message({ message: '%multiplayer.player.joined', parameters: ['Steve'], needsTranslation: true })
            )
        ).toEqual({ translate: 'multiplayer.player.joined', with: ['Steve'] });
    });

    it('reads the text out of a rawtext object, and sends anything else as written', () => {
        expect(javaTextOf(message({ kind: 'rawText', message: '{"rawtext":[{"text":"a"},{"text":"b"}]}' }))).toBe('ab');
        expect(javaTextOf(message({ kind: 'rawText', message: 'not json' }))).toBe('not json');
        expect(javaTextOf(message({ kind: 'system' }))).toBe('hello');
    });
});

describe('JavaPresenter', () => {
    /** A presenter for player 7 that records what it sends, by packet name. */
    const presenter = () => {
        const sent: { name: string; value: unknown }[] = [];
        const send = <D extends JavaPacketDefinition>(definition: D, value: JavaPayload<D>) =>
            void sent.push({ name: definition.name, value });
        const java = new JavaPresenter(send, 7n);
        return { sent, java };
    };
    const overworld = { id: 'minecraft:overworld', seaLevel: 63 };
    const nether = { id: 'minecraft:the_nether', seaLevel: 32 };
    const dimensionTypes =
        CONFIGURATION.registries.find(({ registry }) => registry === 'minecraft:dimension_type')?.entries ?? [];

    it("moves its own player to the feet under the contract's eyes, and leaves another's move alone", async () => {
        const { sent, java } = presenter();
        const move = {
            position: new Vector3(1, 64 + EYE_HEIGHT, 2),
            pitch: 5,
            yaw: 90,
            headYaw: 90,
            onGround: true,
            mode: 'teleport' as const,
            inputTick: 0n
        };

        await java.sendMove({ ...move, runtimeId: 8n });
        await java.sendMove({ ...move, runtimeId: 7n });

        expect(sent).toHaveLength(1);
        expect(sent[0]).toMatchObject({
            name: 'Synchronize Player Position',
            value: { teleportId: 2, x: 1, y: 64, z: 2, yaw: 90, pitch: 5 }
        });
    });

    it("sends a section's lone change as a block update in Java's state ids, and a section's several as one", async () => {
        const { sent, java } = presenter();
        const stone = BlockRuntimeIds.getByName('minecraft:stone');
        const air = BlockRuntimeIds.getByName('minecraft:air');
        const javaStone = BLOCK_STATES.idOf('minecraft:stone');
        const javaAir = BLOCK_STATES.idOf('minecraft:air');

        await java.showBlocks([
            { x: -1, y: -60, z: 17, runtimeId: stone, waterlogged: false },
            { x: 0, y: 64, z: 0, runtimeId: stone, waterlogged: false },
            { x: 1, y: 65, z: 2, runtimeId: stone, waterlogged: false },
            { x: 0, y: 64, z: 0, runtimeId: air, waterlogged: false }
        ]);

        expect(sent).toEqual([
            { name: 'Block Update', value: { position: { x: -1, y: -60, z: 17 }, state: javaStone } },
            {
                name: 'Update Section Blocks',
                value: {
                    section: { x: 0, y: 4, z: 0 },
                    // The later change to (0, 64, 0) replaced the earlier one.
                    blocks: [
                        { state: javaAir, x: 0, y: 0, z: 0 },
                        { state: javaStone, x: 1, y: 1, z: 2 }
                    ]
                }
            }
        ]);
    });

    it('sends a block that shares its space with water as its waterlogged Java state', async () => {
        const { sent, java } = presenter();
        const slab = BlockRuntimeIds.tryGetByState('minecraft:oak_slab', {
            'minecraft:vertical_half': 'bottom'
        });
        if (slab === null) throw new Error('a bottom oak slab must be in the block palette');

        await java.showBlocks([{ x: 1, y: 2, z: 3, runtimeId: slab, waterlogged: true }]);

        expect(sent).toEqual([
            {
                name: 'Block Update',
                value: {
                    position: { x: 1, y: 2, z: 3 },
                    state: BLOCK_STATES.idOf('minecraft:oak_slab', { type: 'bottom', waterlogged: 'true' })
                }
            }
        ]);
    });

    it('fills the inventory window from the containers, translating items, and tells the client its held slot', async () => {
        const { sent, java } = presenter();
        const stone = { name: 'minecraft:stone', count: 64 };
        const inventory = new Array(36).fill(null);
        inventory[0] = stone;
        inventory[9] = { name: 'minecraft:web', count: 2 };
        inventory[10] = { name: 'minecraft:not_an_item', count: 1 };

        await java.showInventory({
            inventory,
            armor: [{ name: 'minecraft:iron_helmet', count: 1 }, null, null, null],
            offhand: stone,
            handSlot: 4
        });
        await java.showOwnSlot('inventory', 1, null);

        const [content, held, slot] = sent;
        const window = new Array(46).fill(null);
        window[36] = { item: ITEMS.idOf('minecraft:stone'), count: 64 };
        window[9] = { item: ITEMS.idOf('minecraft:cobweb'), count: 2 };
        // An item Java has nothing for, in slot 10, shows as an empty slot.
        window[5] = { item: ITEMS.idOf('minecraft:iron_helmet'), count: 1 };
        window[45] = { item: ITEMS.idOf('minecraft:stone'), count: 64 };
        expect(content).toEqual({
            name: 'Set Container Content',
            value: { window: 0, stateId: 1, items: window, carried: null }
        });
        expect(held).toEqual({ name: 'Set Held Item', value: { slot: 4 } });
        expect(slot).toMatchObject({ name: 'Set Container Slot', value: { window: 0, slot: 37, item: null } });
    });

    it('shows the vitals with a whole food level, a death on its own screen, and a respawn that waits for chunks', async () => {
        const { sent, java } = presenter();

        await java.showVitals({ health: 7.5, food: 17.6, saturation: 2 });
        await java.showDeath({ key: 'death.attack.generic', parameters: ['Steve'] });
        await java.showRespawn({
            gamemode: Gametype.SURVIVAL,
            dimension: overworld,
            feet: { x: 0.5, y: 64, z: 0.5 },
            keepData: false,
            replacesWorld: false
        });

        expect(sent.map(({ name }) => name)).toEqual(['Set Health', 'Combat Death', 'Respawn', 'Game Event']);
        expect(sent[0]?.value).toEqual({ health: 7.5, food: 18, saturation: 2 });
        expect(sent[1]?.value).toEqual({
            playerId: 7,
            message: { translate: 'death.attack.generic', with: ['Steve'] }
        });
        expect(sent[2]?.value).toMatchObject({ dimension: 'minecraft:overworld', gameMode: 0, dataToKeep: 0 });
    });

    it('spawns the player again into the dimension of the world it moved to, keeping its data, and centers its view afresh', async () => {
        const { sent, java } = presenter();
        await java.chunkWire.center(0, 0);
        sent.length = 0;

        await java.showRespawn({
            gamemode: Gametype.CREATIVE,
            dimension: nether,
            feet: { x: 4.5, y: 70, z: -3.5 },
            keepData: true,
            replacesWorld: false
        });

        expect(sent.map(({ name }) => name)).toEqual(['Respawn', 'Game Event']);
        expect(sent[0]?.value).toMatchObject({
            dimensionType: dimensionTypes.indexOf('minecraft:the_nether'),
            dimension: 'minecraft:the_nether',
            gameMode: 1,
            seaLevel: 32,
            dataToKeep: 3
        });

        // A client spawned again holds no chunks, so even the same center goes out again.
        await java.chunkWire.center(0, 0);
        expect(sent.at(-1)).toEqual({ name: 'Set Center Chunk', value: { x: 0, z: 0 } });
    });

    it('centers the view only when it moves, and sends chunks as one batch with their light', async () => {
        const { sent, java } = presenter();
        const session = stub<PlayerSession>({
            getWorld: () =>
                stub<World>({
                    getSystems: () => stub<WorldSystems>({ getSkyLight: () => 15, getBlockLight: () => 0 })
                })
        });

        await java.chunkWire.center(1, 2);
        await java.chunkWire.center(1, 2);
        await java.chunkWire.send([new Chunk(1, 2), new Chunk(0, 2)], session);

        expect(sent.map(({ name }) => name)).toEqual([
            'Set Center Chunk',
            'Chunk Batch Start',
            'Chunk Data and Update Light',
            'Chunk Data and Update Light',
            'Chunk Batch Finished'
        ]);
        expect(sent[2]?.value).toMatchObject({ x: 1, z: 2 });
        expect(sent.at(-1)?.value).toEqual({ batchSize: 2 });
    });

    it('takes a move between two worlds of one dimension through another, so the client drops the chunks it holds', async () => {
        const { sent, java } = presenter();

        await java.showRespawn({
            gamemode: Gametype.SURVIVAL,
            dimension: overworld,
            feet: { x: 0.5, y: 64, z: 0.5 },
            keepData: true,
            replacesWorld: true
        });

        expect(sent).toMatchObject([
            { name: 'Respawn', value: { dimension: 'minecraft:the_nether' } },
            { name: 'Respawn', value: { dimension: 'minecraft:overworld' } },
            { name: 'Game Event' }
        ]);
    });

    it("tells the client its game mode in Java's numbers", async () => {
        const { sent, java } = presenter();

        await java.sendGamemode(Gametype.SPECTATOR);

        expect(sent).toEqual([{ name: 'Game Event', value: { event: 3, value: 3 } }]);
        expect([Gametype.SURVIVAL, Gametype.CREATIVE, Gametype.ADVENTURE].map(javaGameModeOf)).toEqual([0, 1, 2]);
    });

    it('shows a player with its profile in the tab list first, and takes both away again', async () => {
        const { sent, java } = presenter();
        const steve = {
            getRuntimeId: () => 9n,
            getPosition: () => ({ getX: () => 1, getY: () => 65.62, getZ: () => 2 }),
            getTrackingRange: () => 8,
            spawnTo: async () => {},
            describe: () => ({
                type: 'minecraft:player',
                feet: { x: 1, y: 64, z: 2 },
                yaw: 90,
                pitch: 0,
                headYaw: 90,
                player: { uuid: '0f1e2d3c-4b5a-6978-8796-a5b4c3d2e1f0', name: 'Steve' }
            })
        };

        await java.showEntity(steve);
        await java.moveEntities([
            {
                runtimeId: 9n,
                position: { x: 3, y: 64 + EYE_HEIGHT, z: 2 },
                yaw: 0,
                pitch: 0,
                headYaw: 0,
                onGround: true
            }
        ]);
        await java.hideEntity(9n);

        expect(sent.map(({ name }) => name)).toEqual([
            'Player Info Update',
            'Spawn Entity',
            'Set Head Rotation',
            'Teleport Entity',
            'Set Head Rotation',
            'Remove Entities',
            'Player Info Remove'
        ]);
        expect(sent[1]?.value).toMatchObject({
            entityId: 9,
            uuid: '0f1e2d3c-4b5a-6978-8796-a5b4c3d2e1f0',
            x: 1,
            y: 64
        });
        // The move came in Bedrock's terms, at the eyes; the client is sent the feet.
        expect(sent[3]?.value).toMatchObject({ x: 3, y: 64, onGround: true });
    });

    it('lists a player with the signed textures its skin is drawn from, and one without as the default skin', async () => {
        const { sent, java } = presenter();
        const textures = { value: 'dGV4dHVyZXM=', signature: 'c2lnbmVk' };

        java.listProfile({ uuid: '0f1e2d3c-4b5a-6978-8796-a5b4c3d2e1f0', name: 'Notch', textures });
        java.listProfile({ uuid: '0f1e2d3c-4b5a-6978-8796-a5b4c3d2e1f1', name: 'Alex' });

        expect(sent.map(({ value }) => value)).toEqual([
            {
                actions: 0x09,
                players: [
                    {
                        uuid: '0f1e2d3c-4b5a-6978-8796-a5b4c3d2e1f0',
                        name: 'Notch',
                        properties: [{ name: 'textures', ...textures }],
                        listed: true
                    }
                ]
            },
            {
                actions: 0x09,
                players: [{ uuid: '0f1e2d3c-4b5a-6978-8796-a5b4c3d2e1f1', name: 'Alex', properties: [], listed: true }]
            }
        ]);
    });

    it("shows an entity's equipment with its spawn, the filled slots only, and every slot on a change", async () => {
        const { sent, java } = presenter();
        const zombie: ShownEntity = {
            getRuntimeId: () => 12n,
            getPosition: () => ({ getX: () => 0, getY: () => 64, getZ: () => 0 }),
            getTrackingRange: () => 8,
            spawnTo: async () => {},
            describe: () => ({
                type: 'minecraft:zombie',
                feet: { x: 0, y: 64, z: 0 },
                yaw: 0,
                pitch: 0,
                headYaw: 0,
                equipment: { head: { name: 'minecraft:iron_helmet', count: 1 } }
            })
        };

        await java.showEntity(zombie);
        await java.showEquipment(12n, { mainhand: { name: 'minecraft:stone', count: 1 } });

        const equipment = sent.filter(({ name }) => name === 'Set Equipment').map(({ value }) => value);
        expect(equipment[0]).toEqual({
            entityId: 12,
            equipment: [{ slot: 5, item: { item: ITEMS.idOf('minecraft:iron_helmet'), count: 1 } }]
        });
        expect(equipment[1]).toEqual({
            entityId: 12,
            equipment: [
                { slot: 0, item: { item: ITEMS.idOf('minecraft:stone'), count: 1 } },
                ...[1, 5, 4, 3, 2, 6].map((slot) => ({ slot, item: null }))
            ]
        });
    });

    it("sends an entity's flags and pose when they change, and nothing for a state the client already has", async () => {
        const { sent, java } = presenter();
        const standing = {
            onFire: false,
            sneaking: false,
            sprinting: false,
            swimming: false,
            invisible: false,
            gliding: false,
            sleeping: false
        };

        await java.showEntityState(9n, standing);
        await java.showEntityState(9n, { ...standing, sneaking: true, onFire: true });
        await java.showEntityState(9n, { ...standing, sneaking: true, onFire: true });
        await java.showEntityState(9n, { ...standing, sleeping: true, sneaking: true });

        expect(sent).toEqual([
            {
                name: 'Set Entity Metadata',
                value: {
                    entityId: 9,
                    entries: [
                        { index: 0, serializer: 0, value: 0x03 },
                        { index: 6, serializer: 20, value: 5 }
                    ]
                }
            },
            {
                name: 'Set Entity Metadata',
                value: {
                    entityId: 9,
                    // Asleep wins the pose; the crouch stays a flag.
                    entries: [
                        { index: 0, serializer: 0, value: 0x02 },
                        { index: 6, serializer: 20, value: 2 }
                    ]
                }
            }
        ]);
    });

    it('shows a mob under the Java type its Bedrock one comes from, and nothing for what it has no facts of', async () => {
        const { sent, java } = presenter();
        const mob = (describe: () => ShownEntityFacts | undefined): ShownEntity => ({
            getRuntimeId: () => 11n,
            getPosition: () => ({ getX: () => 0, getY: () => 64, getZ: () => 0 }),
            getTrackingRange: () => 8,
            spawnTo: async () => {},
            describe
        });

        await java.showEntity(mob(() => undefined));
        await java.showEntity(
            mob(() => ({ type: 'minecraft:cow', feet: { x: 0, y: 64, z: 0 }, yaw: 0, pitch: 0, headYaw: 0 }))
        );

        expect(sent.map(({ name }) => name)).toEqual(['Spawn Entity', 'Set Head Rotation']);
        expect(sent[0]?.value).toMatchObject({ type: ENTITY_TYPES.idOf('minecraft:cow') });
    });
});

describe('boss bars', () => {
    const bar: ShownBossBar = {
        id: 3,
        actorUniqueId: 7n,
        title: 'TPS 20.0',
        progress: 0.5,
        color: 'rebeccaPurple',
        style: 'notched12'
    };

    it('sends an add with the whole bar, drawing rebecca purple as purple and raising no flags', async () => {
        const sent: { name: string; value: unknown }[] = [];
        const java = new JavaPresenter((definition, value) => void sent.push({ name: definition.name, value }), 7n);

        await java.showBossBar('add', bar);
        await java.showBossBar('progress', { ...bar, progress: 0.75 });
        await java.showBossBar('name', { ...bar, title: 'TPS 19.9' });
        await java.showBossBar('remove', bar);

        const uuid = bossBarUuidOf(3);
        expect(sent).toEqual([
            {
                name: 'Boss Event',
                value: {
                    uuid,
                    operation: {
                        type: JavaBossEventOperation.Add,
                        title: 'TPS 20.0',
                        progress: 0.5,
                        color: JavaBossBarColor.Purple,
                        overlay: JavaBossBarOverlay.Notched12,
                        flags: 0
                    }
                }
            },
            {
                name: 'Boss Event',
                value: { uuid, operation: { type: JavaBossEventOperation.UpdateProgress, progress: 0.75 } }
            },
            {
                name: 'Boss Event',
                value: { uuid, operation: { type: JavaBossEventOperation.UpdateName, title: 'TPS 19.9' } }
            },
            { name: 'Boss Event', value: { uuid, operation: { type: JavaBossEventOperation.Remove } } }
        ]);
    });

    it('gives each bar its own UUID, the same every time', () => {
        expect(bossBarUuidOf(3)).toBe('00000000-0000-0000-0000-000000000003');
        expect(bossBarUuidOf(3)).not.toBe(bossBarUuidOf(4));
    });

    it('sends a title that is a translation key as a translation, and anything else as written', () => {
        expect(javaBossBarTitleOf('entity.minecraft.ender_dragon')).toEqual({
            translate: 'entity.minecraft.ender_dragon'
        });
        expect(javaBossBarTitleOf('§aTPS 20.0')).toBe('§aTPS 20.0');
        expect(javaBossBarTitleOf('1.5')).toBe('1.5');
        expect(javaBossBarTitleOf('Wither')).toBe('Wither');
    });
});

describe('titles', () => {
    it('sends each instruction as its own packet, reading a rawtext title for its text', async () => {
        const sent: { name: string; value: unknown }[] = [];
        const java = new JavaPresenter((definition, value) => void sent.push({ name: definition.name, value }), 7n);

        await java.showTitle({ kind: 'times', fadeIn: 5, stay: 40, fadeOut: 10 });
        await java.showTitle({ kind: 'subtitle', text: 'below' });
        await java.showTitle({ kind: 'title', text: '{"rawtext":[{"text":"Hi"}]}', raw: true });
        await java.showTitle({ kind: 'actionbar', text: '§cLow health' });
        await java.showTitle({ kind: 'clear' });
        await java.showTitle({ kind: 'reset' });

        expect(sent).toEqual([
            { name: 'Set Title Animation Times', value: { fadeIn: 5, stay: 40, fadeOut: 10 } },
            { name: 'Set Subtitle Text', value: { text: 'below' } },
            { name: 'Set Title Text', value: { text: 'Hi' } },
            { name: 'Set Action Bar Text', value: { text: '§cLow health' } },
            { name: 'Clear Titles', value: { resetTimes: false } },
            { name: 'Clear Titles', value: { resetTimes: true } }
        ]);
    });
});

describe('the scoreboard', () => {
    const kills = {
        name: 'kills',
        displayName: 'Kills',
        criterion: 'dummy',
        sortOrder: 'descending' as const,
        scores: [{ holder: 'Steve', identity: 1n, value: 3 }]
    };
    const presenter = () => {
        const sent: { name: string; value: unknown }[] = [];
        const java = new JavaPresenter((definition, value) => void sent.push({ name: definition.name, value }), 7n);
        return { sent, java };
    };

    it('adds an objective before a slot shows it, then sends every score in it', async () => {
        const { sent, java } = presenter();

        await java.showDisplaySlot('sidebar', kills);

        expect(sent).toEqual([
            {
                name: 'Update Objectives',
                value: {
                    objective: 'kills',
                    change: { method: 0, displayName: 'Kills', renderType: 0, numberFormat: null }
                }
            },
            { name: 'Display Objective', value: { slot: 1, objective: 'kills' } },
            {
                name: 'Update Score',
                value: { owner: 'Steve', objective: 'kills', score: 3, displayName: null, numberFormat: null }
            }
        ]);
    });

    it('adds an objective two slots show once, and renames it when its display name changes', async () => {
        const { sent, java } = presenter();

        await java.showDisplaySlot('sidebar', kills);
        await java.showDisplaySlot('list', kills);
        await java.showDisplaySlot('belowname', { ...kills, displayName: 'Kills!' });

        expect(sent.filter(({ name }) => name === 'Update Objectives').map(({ value }) => value)).toEqual([
            { objective: 'kills', change: { method: 0, displayName: 'Kills', renderType: 0, numberFormat: null } },
            { objective: 'kills', change: { method: 2, displayName: 'Kills!', renderType: 0, numberFormat: null } }
        ]);
        expect(sent.filter(({ name }) => name === 'Display Objective').map(({ value }) => value)).toEqual([
            { slot: 1, objective: 'kills' },
            { slot: 0, objective: 'kills' },
            { slot: 2, objective: 'kills' }
        ]);
    });

    it('empties a slot and takes off the objective once no slot shows it', async () => {
        const { sent, java } = presenter();
        await java.showDisplaySlot('sidebar', kills);
        sent.length = 0;

        await java.showDisplaySlot('sidebar', undefined);
        await java.showDisplaySlot('sidebar', undefined);
        await java.showScore('kills', { holder: 'Steve', identity: 1n }, 4);

        expect(sent).toEqual([
            { name: 'Display Objective', value: { slot: 1, objective: '' } },
            { name: 'Update Objectives', value: { objective: 'kills', change: { method: 1 } } }
        ]);
    });

    it("sends a shown objective's score changes and resets, and removes it when it goes", async () => {
        const { sent, java } = presenter();
        await java.showDisplaySlot('sidebar', kills);
        sent.length = 0;

        await java.showScore('kills', { holder: 'Alex', identity: 2n }, 5);
        await java.showScore('kills', { holder: 'Steve', identity: 1n }, undefined);
        await java.removeObjective('kills');
        await java.removeObjective('kills');

        expect(sent).toEqual([
            {
                name: 'Update Score',
                value: { owner: 'Alex', objective: 'kills', score: 5, displayName: null, numberFormat: null }
            },
            { name: 'Reset Score', value: { owner: 'Steve', objective: 'kills' } },
            { name: 'Update Objectives', value: { objective: 'kills', change: { method: 1 } } }
        ]);
    });

    it('shows nothing in a slot Java does not have', async () => {
        const { sent, java } = presenter();

        await java.showDisplaySlot('sidebar.team.red', kills);

        expect(sent).toEqual([]);
    });
});

describe('tab list game modes', () => {
    const steve = (gamemode?: Gametype) => ({
        getRuntimeId: () => 9n,
        getPosition: () => ({ getX: () => 1, getY: () => 65.62, getZ: () => 2 }),
        getTrackingRange: () => 8,
        spawnTo: async () => {},
        describe: () => ({
            type: 'minecraft:player',
            feet: { x: 1, y: 64, z: 2 },
            yaw: 0,
            pitch: 0,
            headYaw: 0,
            player: {
                uuid: '0f1e2d3c-4b5a-6978-8796-a5b4c3d2e1f0',
                name: 'Steve',
                ...(gamemode === undefined ? {} : { gamemode })
            }
        })
    });
    const gameModeUpdates = (sent: readonly { name: string; value: unknown }[]) =>
        sent.filter(({ name }) => name === 'Player Info Update (game mode)').map(({ value }) => value);

    it('lists another player with its game mode, and updates the entry when the mode changes', async () => {
        const sent: { name: string; value: unknown }[] = [];
        const java = new JavaPresenter((definition, value) => void sent.push({ name: definition.name, value }), 7n);

        await java.showEntity(steve(Gametype.CREATIVE));
        await java.sendPlayerGameMode(9n, Gametype.SPECTATOR);

        expect(gameModeUpdates(sent)).toEqual([
            { actions: 0x04, players: [{ uuid: '0f1e2d3c-4b5a-6978-8796-a5b4c3d2e1f0', gameMode: 1 }] },
            { actions: 0x04, players: [{ uuid: '0f1e2d3c-4b5a-6978-8796-a5b4c3d2e1f0', gameMode: 3 }] }
        ]);
    });

    it('updates its own entry once listed, and leaves a player it has no entry for alone', async () => {
        const sent: { name: string; value: unknown }[] = [];
        const java = new JavaPresenter((definition, value) => void sent.push({ name: definition.name, value }), 7n);
        const own = '00000000-0000-0000-0000-000000000007';

        await java.sendPlayerGameMode(7n, Gametype.CREATIVE);
        await java.sendPlayerGameMode(9n, Gametype.CREATIVE);
        java.listOwnProfile({ uuid: own, name: 'Alex' });
        await java.sendPlayerGameMode(7n, Gametype.ADVENTURE);

        expect(gameModeUpdates(sent)).toEqual([{ actions: 0x04, players: [{ uuid: own, gameMode: 2 }] }]);
    });
});

describe('javaRawTextOf', () => {
    it('turns translated parts into Java translations, with their arguments as strings or rawtext', () => {
        expect(javaRawTextOf('{"rawtext":[{"translate":"multiplayer.player.joined","with":["Alex"]}]}')).toEqual({
            translate: 'multiplayer.player.joined',
            with: ['Alex']
        });
        expect(
            javaRawTextOf('{"rawtext":[{"translate":"chat.type.text","with":{"rawtext":[{"text":"A"},{"text":"B"}]}}]}')
        ).toEqual({ translate: 'chat.type.text', with: ['A', 'B'] });
    });

    it('joins text with a translation as one format of %s per part', () => {
        expect(javaRawTextOf('{"rawtext":[{"text":"> "},{"translate":"gui.done"}]}')).toEqual({
            translate: '%s%s',
            with: ['> ', { translate: 'gui.done' }]
        });
        expect(javaRawTextOf('{"rawtext":[{"text":"a"},{"selector":"@p"},{"text":"b"}]}')).toBe('ab');
    });
});

describe('a scoreboard snapshot that drops holders', () => {
    const snapshot = (scores: readonly { holder: string; value: number }[]) => ({
        name: 'kills',
        displayName: 'Kills',
        criterion: 'dummy',
        sortOrder: 'descending' as const,
        scores: scores.map((score, index) => ({ ...score, identity: BigInt(index + 1) }))
    });

    it('resets the holders a later snapshot no longer has, and keeps the rest', async () => {
        const sent: { name: string; value: unknown }[] = [];
        const java = new JavaPresenter((definition, value) => void sent.push({ name: definition.name, value }), 7n);
        await java.showDisplaySlot(
            'sidebar',
            snapshot([
                { holder: 'Steve', value: 3 },
                { holder: 'Alex', value: 2 }
            ])
        );
        sent.length = 0;

        await java.showDisplaySlot('sidebar', snapshot([{ holder: 'Steve', value: 4 }]));
        await java.showDisplaySlot('sidebar', snapshot([]));

        expect(sent.filter(({ name }) => name !== 'Display Objective')).toEqual([
            { name: 'Reset Score', value: { owner: 'Alex', objective: 'kills' } },
            {
                name: 'Update Score',
                value: { owner: 'Steve', objective: 'kills', score: 4, displayName: null, numberFormat: null }
            },
            { name: 'Reset Score', value: { owner: 'Steve', objective: 'kills' } }
        ]);
    });
});

describe('the world state', () => {
    const presenter = () => {
        const sent: { name: string; value: unknown }[] = [];
        const java = new JavaPresenter((definition, value) => void sent.push({ name: definition.name, value }), 7n);
        return { sent, java };
    };
    const overworldClock = (
        CONFIGURATION.registries.find(({ registry }) => registry === 'minecraft:world_clock')?.entries ?? []
    ).indexOf('minecraft:overworld');

    it("sends the time as the game time and the Overworld's clock, held still while the day is", async () => {
        const { sent, java } = presenter();

        await java.sendTime({ dayTime: 18_000, gameTime: 30_000, advancing: true });
        await java.sendTime({ dayTime: 6000, gameTime: 30_020, advancing: false });

        expect(overworldClock).toBeGreaterThanOrEqual(0);
        expect(sent).toEqual([
            {
                name: 'Update Time',
                value: {
                    gameTime: 30_000n,
                    clocks: [{ clock: overworldClock, totalTicks: 18_000n, partialTick: 0, rate: 1 }]
                }
            },
            {
                name: 'Update Time',
                value: {
                    gameTime: 30_020n,
                    clocks: [{ clock: overworldClock, totalTicks: 6000n, partialTick: 0, rate: 0 }]
                }
            }
        ]);
    });

    it('starts the rain with its strength, adds the storm, and ends both, sending nothing for the same weather', async () => {
        const { sent, java } = presenter();

        await java.showWeather(undefined, 'rain');
        await java.showWeather('clear', 'rain');
        await java.showWeather('rain', 'thunder');
        await java.showWeather('thunder', 'clear');

        expect(sent.map(({ value }) => value)).toEqual([
            { event: 1, value: 0 },
            { event: 7, value: 1 },
            { event: 8, value: 0 },
            { event: 7, value: 1 },
            { event: 8, value: 1 },
            { event: 2, value: 0 },
            { event: 7, value: 0 },
            { event: 8, value: 0 }
        ]);
    });

    it('shows the weather again once a respawn gave the client a new level', async () => {
        const { sent, java } = presenter();
        await java.showWeather(undefined, 'rain');
        await java.showRespawn({
            gamemode: Gametype.SURVIVAL,
            dimension: { id: 'minecraft:overworld', seaLevel: 63 },
            feet: { x: 0, y: 64, z: 0 },
            keepData: false,
            replacesWorld: false
        });
        sent.length = 0;

        await java.showWeather('clear', 'rain');

        expect(sent.map(({ value }) => value)).toEqual([
            { event: 1, value: 0 },
            { event: 7, value: 1 },
            { event: 8, value: 0 }
        ]);
    });

    it('sends the difficulty, the world spawn and the ticking state', async () => {
        const { sent, java } = presenter();

        await java.showDifficulty(Difficulty.HARD);
        await java.showWorldSpawn({
            dimension: { id: 'minecraft:overworld', bedrockId: 0 },
            position: { x: 8, y: 64, z: -8 },
            yaw: 90
        });
        await java.showTicking({ rate: 10, frozen: true });
        await java.showTickStep(40);

        expect(sent).toEqual([
            { name: 'Change Difficulty', value: { difficulty: 3, locked: false } },
            {
                name: 'Set Default Spawn Position',
                value: { dimension: 'minecraft:overworld', position: { x: 8, y: 64, z: -8 }, yaw: 90, pitch: 0 }
            },
            { name: 'Set Ticking State', value: { tickRate: 10, frozen: true } },
            { name: 'Step Tick', value: { steps: 40 } }
        ]);
    });

    it('drops the chunks that left the view, and tells the client its new radius', async () => {
        const { sent, java } = presenter();

        await java.chunkWire.forget([
            { x: 3, z: -1 },
            { x: 4, z: -1 }
        ]);
        await java.chunkWire.radius(6);

        expect(sent).toEqual([
            { name: 'Unload Chunk', value: { x: 3, z: -1 } },
            { name: 'Unload Chunk', value: { x: 4, z: -1 } },
            { name: 'Set Render Distance', value: { radius: 6 } },
            { name: 'Set Simulation Distance', value: { distance: 6 } }
        ]);
    });
});

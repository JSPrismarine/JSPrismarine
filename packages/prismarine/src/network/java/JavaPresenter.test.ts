import { Vector3 } from '@jsprismarine/math';
import { Gametype } from '@jsprismarine/minecraft';
import type { JavaPacketDefinition } from '@jsprismarine/protocol/java/packet/JavaPacket';
import { BLOCK_STATES } from '@jsprismarine/protocol/java/versions/26.3/blockStates';
import { CONFIGURATION } from '@jsprismarine/protocol/java/versions/26.3/configuration';
import { ENTITY_TYPES, ITEMS } from '@jsprismarine/protocol/java/versions/26.3/registries';
import { describe, expect, it } from 'vitest';

import { BlockRuntimeIds } from '../../block/state/BlockRuntimeIds';
import { EYE_HEIGHT } from '../../entity/playerEyes';
import type { ShownMessage } from '../presenter/SessionPresenter';
import type { ShownEntity, ShownEntityFacts } from '../../world/ShownActor';
import { javaGameModeOf, JavaPresenter, javaTextOf } from './JavaPresenter';

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
        const send = <T>(definition: JavaPacketDefinition<T>, value: T) =>
            void sent.push({ name: definition.name, value });
        const respawns: { x: number; y: number; z: number }[] = [];
        const java = new JavaPresenter(send, 7n, undefined, undefined, (feet) => void respawns.push(feet));
        return { sent, respawns, java };
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

    it('spawns the player again into the dimension of the world it moved to, keeping its data, and says where it stands', async () => {
        const { sent, respawns, java } = presenter();

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
        expect(respawns).toEqual([{ x: 4.5, y: 70, z: -3.5 }]);
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

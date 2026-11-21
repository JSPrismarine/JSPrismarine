import { Vector3 } from '@jsprismarine/math';
import { Gametype } from '@jsprismarine/minecraft';
import type { JavaPacketDefinition } from '@jsprismarine/protocol/java/packet/JavaPacket';
import { BLOCK_STATES } from '@jsprismarine/protocol/java/versions/26.3/blockStates';
import { ENTITY_TYPES } from '@jsprismarine/protocol/java/versions/26.3/registries';
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
        return { sent, java: new JavaPresenter(send, 7n) };
    };

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
            { x: -1, y: -60, z: 17, runtimeId: stone },
            { x: 0, y: 64, z: 0, runtimeId: stone },
            { x: 1, y: 65, z: 2, runtimeId: stone },
            { x: 0, y: 64, z: 0, runtimeId: air }
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

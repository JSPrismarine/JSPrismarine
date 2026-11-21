import { Vector3 } from '@jsprismarine/math';
import { Gametype } from '@jsprismarine/minecraft';
import type { JavaPacketDefinition } from '@jsprismarine/protocol/java/packet/JavaPacket';
import { describe, expect, it } from 'vitest';

import { EYE_HEIGHT } from '../../entity/playerEyes';
import type { ShownMessage } from '../presenter/SessionPresenter';
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

    it("tells the client its game mode in Java's numbers", async () => {
        const { sent, java } = presenter();

        await java.sendGamemode(Gametype.SPECTATOR);

        expect(sent).toEqual([{ name: 'Game Event', value: { event: 3, value: 3 } }]);
        expect([Gametype.SURVIVAL, Gametype.CREATIVE, Gametype.ADVENTURE].map(javaGameModeOf)).toEqual([0, 1, 2]);
    });
});

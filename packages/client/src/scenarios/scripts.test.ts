// @module-tag integration

/**
 * What a joined player sees of a behavior pack script: the client e2e scenarios
 * `script-client-feedback`, `script-custom-command`, `script-rotation` and `script-teleport`,
 * played over a loopback pipe against a server stepped by hand. One server loads one script pack
 * that holds every scenario's handler, as the cinnabar suite's server does.
 *
 * `script-form` and `script-world-message` are covered by `ScriptForm.test.ts` and
 * `ScriptMessage.test.ts`, so the pack here leaves their handlers out.
 *
 * A machine without the script host library runs no scripts, so each test skips there unless
 * `JSP_SCRIPT_HOST_REQUIRE=1` asks for a failure instead, as CI does on Linux x64.
 *
 * `script-client-feedback` spawns a pig, which needs the Bedrock pack's entity types, so it is
 * tagged `real-data`.
 */
import { LevelEvent } from '@jsprismarine/minecraft';
import { MovePlayerPacket } from '@jsprismarine/protocol';
import AvailableCommandsPacket from '@jsprismarine/protocol/bedrock/packet/AvailableCommandsPacket';
import CameraInstructionPacket from '@jsprismarine/protocol/bedrock/packet/CameraInstructionPacket';
import CameraPresetsPacket from '@jsprismarine/protocol/bedrock/packet/CameraPresetsPacket';
import LevelEventGenericPacket from '@jsprismarine/protocol/bedrock/packet/LevelEventGenericPacket';
import PlayerUpdateEntityOverridesPacket, {
    EntityOverrideUpdateType
} from '@jsprismarine/protocol/bedrock/packet/PlayerUpdateEntityOverridesPacket';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { CameraInstructionPayload } from '@jsprismarine/protocol/bedrock/packet/CameraInstructionPacket';
import type { PlayerUpdateEntityOverrides } from '@jsprismarine/protocol/bedrock/packet/PlayerUpdateEntityOverridesPacket';
import type { TestContext } from 'vitest';
import type Client from '../Client';
import type { DecodedPacket, PacketConstructor } from '../net/ClientPacketRegistry';
import type { LoopbackPlayer, LoopbackServer } from '../testing/loopbackServer.test-utils';
import { startLoopbackServer } from '../testing/loopbackServer.test-utils';

/** The custom command the pack registers in `startup`. */
const COMMAND = 'e2e:greet';
/** What the custom command answers, followed by the word passed and the type of the entity that ran it. */
const COMMAND_MESSAGE = 'client-e2e command: greeted ';
/** How far east, in blocks, the pack teleports every player when it thunders. */
const TELEPORT_DISTANCE = 12;
/** The `/scriptevent` id that makes the pack turn every player. */
const LOOK_EVENT = 'e2e:look';
/** Where the pack turns a player to look: `x` the pitch, `y` the yaw, in degrees. */
const LOOK_ROTATION = { x: 30, y: 90 } as const;
/** The `/scriptevent` id that sends music, a property override and a camera spline; `end` stops them. */
const FEEDBACK_EVENT = 'e2e:feedback';
/** How long the pack's camera spline runs, in seconds. */
const SPLINE_SECONDS = 30;

const MANIFEST = {
    format_version: 2,
    header: {
        name: 'Loopback scripts',
        description: 'Scripts the loopback script scenarios drive',
        uuid: '5b0e7c1a-3f2d-4e8a-9c6b-7d1e2f3a4b50',
        version: [1, 0, 0],
        min_engine_version: [1, 21, 0]
    },
    modules: [
        {
            type: 'script',
            language: 'javascript',
            uuid: '5b0e7c1a-3f2d-4e8a-9c6b-7d1e2f3a4b51',
            version: [1, 0, 0],
            entry: 'scripts/main.js'
        }
    ],
    // 2.6.0 is the first version with camera splines.
    dependencies: [{ module_name: '@minecraft/server', version: '2.6.0' }]
};

/** The cinnabar suite's script pack, without the form, weather message and visit counter. */
const SCRIPT = `import { CommandPermissionLevel, CustomCommandParamType, CustomCommandStatus, LinearSpline, system, world } from '@minecraft/server';

system.beforeEvents.startup.subscribe(({ customCommandRegistry }) => {
    customCommandRegistry.registerCommand(
        {
            name: '${COMMAND}',
            description: 'Greets whoever runs it',
            permissionLevel: CommandPermissionLevel.Any,
            mandatoryParameters: [{ name: 'word', type: CustomCommandParamType.String }]
        },
        (origin, word) => ({
            status: CustomCommandStatus.Success,
            message: \`${COMMAND_MESSAGE}\${word} by \${origin.sourceEntity?.typeId}\`
        })
    );
});

system.afterEvents.scriptEventReceive.subscribe((event) => {
    if (event.id !== '${LOOK_EVENT}') return;
    for (const player of world.getAllPlayers()) {
        player.setRotation({ x: ${LOOK_ROTATION.x}, y: ${LOOK_ROTATION.y} });
    }
});

let feedbackPig;
system.afterEvents.scriptEventReceive.subscribe((event) => {
    if (event.id !== '${FEEDBACK_EVENT}') return;
    for (const player of world.getAllPlayers()) {
        if (event.message === 'end') {
            player.stopMusic();
            player.camera.clear();
            if (feedbackPig?.isValid) player.clearPropertyOverridesForEntity(feedbackPig);
            continue;
        }
        player.playMusic('music.game', { fade: 1, loop: true, volume: 0.5 });
        const { x, y, z } = player.location;
        feedbackPig = player.dimension.spawnEntity('minecraft:pig', { x: x + 2, y, z });
        player.setPropertyOverrideForEntity(feedbackPig, 'minecraft:climate_variant', 'cold');
        player.camera.setCamera('minecraft:free', { location: { x, y: y + 2, z }, rotation: { x: 30, y: 0 } });
        const spline = new LinearSpline();
        spline.controlPoints = [{ x, y: y + 2, z }, { x, y: y + 5, z: z + 3 }, { x, y: y + 8, z: z + 6 }];
        player.camera.playAnimation(spline, {
            totalTimeSeconds: ${SPLINE_SECONDS},
            animation: {
                progressKeyFrames: [{ alpha: 0, timeSeconds: 0 }, { alpha: 1, timeSeconds: ${SPLINE_SECONDS} }],
                rotationKeyFrames: [{ rotation: { x: 30, y: 0, z: 0 }, timeSeconds: 0 }]
            }
        });
    }
    if (event.message === 'end') feedbackPig?.remove();
});

world.afterEvents.weatherChange.subscribe((event) => {
    if (event.newWeather !== 'Thunder') return;
    for (const player of world.getAllPlayers()) {
        const { x, y, z } = player.location;
        player.teleport({ x: x + ${TELEPORT_DISTANCE}, y, z });
    }
});
`;

let jsp: LoopbackServer;

// Booting the server builds its content and loads the script host, the slow part, so it happens once for the file.
beforeAll(async () => {
    jsp = await startLoopbackServer({
        name: 'script-scenarios',
        files: { 'pack/manifest.json': JSON.stringify(MANIFEST), 'pack/scripts/main.js': SCRIPT },
        config: (stateRoot) => ({ 'content-world-packs': [path.join(stateRoot, 'pack')] })
    });
}, 900_000);

afterAll(async () => {
    await jsp?.close();
}, 60_000);

/**
 * Skips the test on a server that loaded no scripts, unless `JSP_SCRIPT_HOST_REQUIRE=1` asks for
 * the script host, in which case the test fails.
 */
const requireScripts = (context: TestContext): void => {
    const scripted = jsp.server.getScripts() !== undefined;
    if (!scripted && process.env.JSP_SCRIPT_HOST_REQUIRE !== '1') context.skip();
    expect(scripted).toBe(true);
};

/** Registers packet classes the client's registry lacks, so it decodes them instead of dropping them. */
const decode = (client: Client, packets: readonly PacketConstructor[]): void => {
    const registry = client.getRegistry();
    for (const packet of packets) if (!registry.has(new packet().getId())) registry.register(packet);
};

/**
 * Joins a player that decodes `packets` from its first packet on, for state the server sends only
 * during the join, and keeps every decoded packet it receives.
 * @param name - The player's display name.
 * @param packets - The packet classes to decode besides the client's and `ClientWorld`'s own.
 * @returns The joined player and the packets it has received, in order.
 */
const joinRecording = async (
    name: string,
    packets: readonly PacketConstructor[]
): Promise<{ player: LoopbackPlayer; received: DecodedPacket['packet'][] }> => {
    const { player, joined } = jsp.connect(name);
    decode(player.client, packets);
    const received: DecodedPacket['packet'][] = [];
    player.client.on('packet', ({ packet }: DecodedPacket) => void received.push(packet));
    let done = false;
    void joined.finally(() => {
        done = true;
    });
    await jsp.until(() => done, `${name} never joined`, 120);
    await joined;
    await jsp.until(() => player.session()?.getConnection().hasSpawned() === true, `${name} never entered the world`);
    return { player, received };
};

/** The decoded packets of one class, in the order they arrived. */
const ofType = <P>(received: readonly unknown[], type: abstract new (...args: never[]) => P): P[] =>
    received.filter((packet): packet is P => packet instanceof type);

/** The camera instructions among the packets, as their payloads. */
const cameraInstructions = (received: readonly unknown[]): CameraInstructionPayload['cameraInstruction'][] =>
    ofType(received, CameraInstructionPacket).flatMap((packet) => packet.getPacketData()?.cameraInstruction ?? []);

/** The entity property overrides among the packets, as their payloads. */
const overrides = (received: readonly unknown[]): PlayerUpdateEntityOverrides[] =>
    ofType(received, PlayerUpdateEntityOverridesPacket).flatMap((packet) => packet.getPacketData() ?? []);

/** The custom music events among the packets. */
const musicEvents = (received: readonly unknown[]): number[] =>
    ofType(received, LevelEventGenericPacket)
        .map((packet) => packet.eventId)
        .filter((id) => id === LevelEvent.PLAY_CUSTOM_MUSIC || id === LevelEvent.STOP_CUSTOM_MUSIC);

describe('script-client-feedback', { tags: ['real-data'] }, () => {
    it("sends the player the script's music, property override, free camera and spline, then stops them", async (context) => {
        requireScripts(context);
        const { player, received } = await joinRecording('Watcher', [
            CameraPresetsPacket,
            CameraInstructionPacket,
            LevelEventGenericPacket,
            PlayerUpdateEntityOverridesPacket
        ]);
        // A set instruction names its preset by its index in the list the join sent.
        const presets = ofType(received, CameraPresetsPacket).flatMap(
            (packet) => packet.getPacketData()?.cameraPresets.map((preset) => preset.name) ?? []
        );
        const free = presets.indexOf('minecraft:free');
        expect(free).toBeGreaterThanOrEqual(0);

        await jsp.command(`scriptevent ${FEEDBACK_EVENT} start`);
        await jsp.until(
            () => cameraInstructions(received).some((instruction) => instruction.spline !== undefined),
            'the client was never sent the camera spline'
        );

        expect(musicEvents(received)).toEqual([LevelEvent.PLAY_CUSTOM_MUSIC]);
        const [pig] = player.world.actorsOfType('minecraft:pig');
        expect(pig).toBeDefined();
        expect(overrides(received)).toEqual([
            expect.objectContaining({
                targetId: pig!.runtimeId,
                update: expect.objectContaining({ type: EntityOverrideUpdateType.SetIntOverride })
            })
        ]);
        // The client follows the free camera with its pose overridden, as cinnabar reports `pose_override`.
        const set = cameraInstructions(received).flatMap((instruction) => instruction.set ?? []);
        expect(set).toHaveLength(1);
        expect(set[0]!.preset).toBe(free);
        expect(set[0]!.position).toBeDefined();
        expect(set[0]!.rotation?.x).toBeCloseTo(30);
        // Three points and a key frame on each track, which cinnabar plays rather than counting it invalid.
        const spline = cameraInstructions(received).flatMap((instruction) => instruction.spline ?? []);
        expect(spline).toHaveLength(1);
        expect(spline[0]!.totalTime).toBe(SPLINE_SECONDS);
        // The curve starts where the camera was set and climbs 3 blocks a point.
        const cameraY = set[0]!.position!.y;
        expect(spline[0]!.curve.map((point) => point.y - cameraY)).toEqual([0, 3, 6]);
        expect(spline[0]!.progressKeyFrames.length).toBeGreaterThan(0);
        expect(spline[0]!.rotationKeyFrames.length).toBeGreaterThan(0);
        expect(player.world.getDisconnectReason()).toBeUndefined();

        await jsp.command(`scriptevent ${FEEDBACK_EVENT} end`);
        await jsp.until(
            () => cameraInstructions(received).some((instruction) => instruction.clear === true),
            'the client was never told to clear its camera'
        );
        await jsp.tick();
        expect(musicEvents(received)).toEqual([LevelEvent.PLAY_CUSTOM_MUSIC, LevelEvent.STOP_CUSTOM_MUSIC]);
        expect(overrides(received).at(-1)?.update.type).toBe(EntityOverrideUpdateType.ClearOverrides);
        expect(player.world.actorsOfType('minecraft:pig')).toEqual([]);
        expect(player.world.getDisconnectReason()).toBeUndefined();
        expect(player.session()?.isConnected()).toBe(true);
        player.leave();
        await jsp.tick();
    });
});

describe('script-custom-command', () => {
    it("lists the script's command for the player and answers it with the callback's message", async (context) => {
        requireScripts(context);
        const { player, received } = await joinRecording('Greeter', [AvailableCommandsPacket]);
        const listed = ofType(received, AvailableCommandsPacket).flatMap((packet) =>
            packet.commandData.map((command) => command.commandName)
        );
        expect(listed).toContain(COMMAND);

        await player.runCommand(`/${COMMAND} hello`);
        const expected = `${COMMAND_MESSAGE}hello by minecraft:player`;
        const shown = (): string[] => [
            ...player.world.chat().map((text) => text.message),
            ...player.world
                .commandOutput()
                .flatMap((output) => output.outputMessages.map((message) => message.rawMessage ?? message.messageId))
        ];
        await jsp.until(
            () => shown().some((line) => line.includes(expected)),
            `the player was never shown "${expected}"`
        );
        player.leave();
        await jsp.tick();
    });
});

describe('script-rotation', () => {
    it("turns the player to the script's Entity.setRotation", async (context) => {
        requireScripts(context);
        const player = await jsp.join('Turner');
        const ownId = player.client.getStartGame()?.runtimeEntityId;
        const turns: { yaw: number; pitch: number }[] = [];
        player.client.on('packet', ({ packet }: DecodedPacket) => {
            if (!(packet instanceof MovePlayerPacket)) return;
            const move = packet.getPacketData();
            if (move !== null && move.runtimeEntityId === ownId) turns.push({ yaw: move.yaw, pitch: move.pitch });
        });

        await jsp.command(`scriptevent ${LOOK_EVENT}`);
        await jsp.until(() => turns.length > 0, 'the client was never turned');

        const { yaw, pitch } = turns.at(-1)!;
        // Yaw wraps, so compare the shortest way around.
        expect(Math.abs(((((yaw - LOOK_ROTATION.y) % 360) + 540) % 360) - 180)).toBeLessThan(1);
        expect(pitch).toBeCloseTo(LOOK_ROTATION.x, 0);
        player.leave();
        await jsp.tick();
    });
});

describe('script-teleport', () => {
    it("moves the player east to the script's Entity.teleport when it thunders", async (context) => {
        requireScripts(context);
        const player = await jsp.join('Jumper');
        const start = player.world.getPosition()!;
        // Creative, so the player is not hurt landing from the teleport, as the cinnabar scenario does.
        await jsp.command('gamemode creative Jumper');
        const teleports = player.world.getTeleportCount();

        await jsp.command('weather thunder');
        try {
            await jsp.until(() => player.world.getTeleportCount() > teleports, 'the client was never teleported');
            const position = player.world.getPosition();
            expect(position?.x).toBeCloseTo(start.x + TELEPORT_DISTANCE, 0);
            expect(position?.z).toBeCloseTo(start.z, 0);

            await player.input();
            await jsp.tick();
            const server = player.session()?.getPlayer().getPosition();
            expect(server?.getX()).toBeCloseTo(start.x + TELEPORT_DISTANCE, 0);
            expect(server?.getZ()).toBeCloseTo(start.z, 0);
        } finally {
            await jsp.command('weather clear');
        }
        player.leave();
        await jsp.tick();
    });
});

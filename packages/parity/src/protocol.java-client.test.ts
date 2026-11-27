import { Difficulty, Gametype } from '@jsprismarine/minecraft';
import { JAVA_HANDLERS } from '@jsprismarine/prismarine/editions/java/JavaConnections';
import { JavaPresenter } from '@jsprismarine/prismarine/editions/java/JavaPresenter';
import { javaBlockTranslation, javaItemTranslation } from '@jsprismarine/prismarine/editions/java/editionTranslation';
import { JavaChunkTranslator } from '@jsprismarine/prismarine/editions/java/javaChunk';
import type PlayerSession from '@jsprismarine/prismarine/player/PlayerSession';
import type { SessionPresenter } from '@jsprismarine/prismarine/player/presenter/SessionPresenter';
import { stub } from '@jsprismarine/prismarine/testing/stub.test.helper';
import Chunk from '@jsprismarine/prismarine/world/chunk/Chunk';
import { Position } from '@jsprismarine/prismarine/world/Position';
import * as chunkPackets from '@jsprismarine/protocol/java/chunk/levelChunk';
import * as configurationPackets from '@jsprismarine/protocol/java/packet/configuration';
import * as handshakePackets from '@jsprismarine/protocol/java/packet/handshake';
import type { JavaPacketDefinition, JavaPacketPath, JavaPayload } from '@jsprismarine/protocol/java/packet/JavaPacket';
import * as loginPackets from '@jsprismarine/protocol/java/packet/login';
import * as playPackets from '@jsprismarine/protocol/java/packet/play';
import {
    CHANGE_GAME_MODE,
    ClientCommand,
    ClientCommandAction,
    PlayerAction,
    PlayerActionStatus,
    PlayerCommand,
    PlayerCommandAction,
    PlayerInfoAction,
    PlayerInput,
    PlayerInputFlag,
    RAIN_LEVEL_CHANGE,
    START_RAINING,
    STOP_RAINING,
    THUNDER_LEVEL_CHANGE
} from '@jsprismarine/protocol/java/packet/play';
import * as statusPackets from '@jsprismarine/protocol/java/packet/status';
import { NEWEST_JAVA_RELEASE } from '@jsprismarine/protocol/java/versions/javaReleases';
import { expect, it } from 'vitest';

import type { BehaviorScenario } from './behaviorScenarios.ts';
import { measureScenarios, scenarioGroup } from './behaviorScenarios.ts';
import { FAMILIES } from './families.ts';
import { isRecord } from './isRecord.ts';
import { describeFamily } from './measure.ts';

/**
 * The `protocol.java-client` row: what a Java Edition client can do on the server and is shown
 * of the world, one row per behavior, against the packets the pinned Java release has for it.
 *
 * Every packet of every phase in the release's packet table belongs to one behavior below, so a
 * Java release that adds a packet fails the run until a behavior claims it. A behavior passes
 * when the server does each thing it needs:
 *
 * - A serverbound packet is read when the server's Java handler table has a handler for it. A
 *   packet whose actions mean different things, such as `Player Action`'s mining and dropping,
 *   needs the action itself: the handler is run with that payload and has to queue an intent.
 * - A clientbound packet that a presenter call carries is sent when driving the real
 *   `JavaPresenter` through that call sends it. A clientbound packet the behavior needs for a
 *   case no presenter call covers yet, such as `Game Event`'s weather, is not sent.
 * - Any other clientbound packet, which the connection sends for the join, the configuration and
 *   the chunks, is sent when the protocol package defines its layout; `JavaConnections.test.ts`
 *   drives those exchanges.
 *
 * A behavior the server lacks is a `deferred` gap that names the issue tracking its area.
 */

/** The pinned release whose packet table is the universe of rows. */
const RELEASE = NEWEST_JAVA_RELEASE;

/** The issue tracking each area's missing behaviors; an area with none is fully supported. */
const AREA_ISSUES = {
    connection: undefined,
    join: undefined,
    movement: undefined,
    chunks: undefined,
    chat: undefined,
    blocks: undefined,
    inventory: undefined,
    entities: undefined,
    vitals: undefined,
    combat: 'https://github.com/JSPrismarine/JSPrismarine/issues/3767',
    items: 'https://github.com/JSPrismarine/JSPrismarine/issues/3768',
    containers: 'https://github.com/JSPrismarine/JSPrismarine/issues/3769',
    hud: 'https://github.com/JSPrismarine/JSPrismarine/issues/3770',
    world: 'https://github.com/JSPrismarine/JSPrismarine/issues/3771',
    player: 'https://github.com/JSPrismarine/JSPrismarine/issues/3772',
    commands: 'https://github.com/JSPrismarine/JSPrismarine/issues/3773',
    services: 'https://github.com/JSPrismarine/JSPrismarine/issues/3774',
    tools: 'https://github.com/JSPrismarine/JSPrismarine/issues/3775'
} as const satisfies Record<string, string | undefined>;

type Area = keyof typeof AREA_ISSUES;

/** One handler of the server's Java handler table. */
type Handler = Extract<ReturnType<typeof JAVA_HANDLERS.lookup>, { kind: 'handled' }>['handler'];

/** What a Java handler is handed beside the packet. */
type Context = Parameters<Handler['handle']>[1];

/** A call of the presenter contract a clientbound packet is checked through, made on the Java presenter. */
type PresenterCall = (presenter: SessionPresenter) => Promise<void>;

/** One thing a behavior needs of one packet. */
type Need =
    | { readonly kind: 'read'; readonly path: JavaPacketPath }
    | {
          readonly kind: 'decoded';
          readonly path: string;
          readonly variant: string;
          /** The case's payload, which tells two claims of one packet apart. */
          readonly payloadKey: string;
          /**
           * The fields of the intent the case has to queue, as the handler contract names them, or
           * undefined for a case the server has no intent for yet, where any intent counts.
           */
          readonly expected: Readonly<Record<string, unknown>> | undefined;
          /** The packet the handler has to answer the case with, once the intent applied. */
          readonly answers?: JavaPacketPath;
          readonly handle: () => Promise<Handled | undefined>;
      }
    | { readonly kind: 'sent'; readonly path: JavaPacketPath }
    | {
          readonly kind: 'shown';
          readonly path: JavaPacketPath;
          readonly variant: string;
          /** The presenter call that sends it, or undefined when none does yet. */
          readonly call: PresenterCall | undefined;
          /** Whether a sent packet's payload is the case the behavior needs; absent, any is. */
          readonly carries?: (payload: unknown) => boolean;
      };

/** One thing a Java client does or is shown. */
interface Behavior {
    readonly id: string;
    readonly area: Area;
    /** What Java does, in one sentence. */
    readonly java: string;
    readonly needs: readonly Need[];
    /**
     * Packets Java also uses for the behavior that the server does without, because one it sends
     * does the same job, such as the relative entity moves a `Teleport Entity` stands in for.
     */
    readonly equivalents?: readonly JavaPacketPath[];
}

/** The path of a definition, as the release's table names it. */
const pathOf = ({ phase, bound, key }: JavaPacketDefinition): string => `${phase}/${bound}/${key}`;

/** Whether a module export is a Java packet definition. */
const isDefinition = (value: unknown): value is JavaPacketDefinition =>
    isRecord(value) && typeof value.phase === 'string' && typeof value.bound === 'string' && 'key' in value;

/** Every packet the protocol package has a layout for, by path. */
const DEFINED: ReadonlySet<string> = new Set(
    [chunkPackets, configurationPackets, handshakePackets, loginPackets, playPackets, statusPackets]
        .flatMap((module) => Object.values(module))
        .filter(isDefinition)
        .map(pathOf)
);

/** The phases of the release, which a handler is looked up in. */
const PHASES: readonly string[] = Object.keys(RELEASE.packets);

/** Whether a phase is one a connection can be in. */
const isPhase = (phase: string): phase is Context['connection']['phase'] => PHASES.includes(phase);

/** Splits a path into its phase, direction and Mojang's name. */
const partsOf = (path: string) => {
    const [phase = '', bound = '', ...name] = path.split('/');
    return { phase, bound, key: name.join('/') };
};

/** The handler the server reads a serverbound packet with, if any. */
const handlerOf = (path: string): Handler | undefined => {
    const { phase, bound, key } = partsOf(path);
    if (bound !== 'serverbound') return undefined;
    const id = RELEASE.packets[phase]?.serverbound?.[key];
    if (id === undefined || !isPhase(phase)) return undefined;
    const lookup = JAVA_HANDLERS.lookup(RELEASE, phase, id);
    return lookup.kind === 'handled' ? lookup.handler : undefined;
};

/** What a handler did with one packet: the intents it queued and the packets it answered with. */
interface Handled {
    readonly intents: readonly Readonly<Record<string, unknown>>[];
    readonly answers: readonly string[];
}

/**
 * Runs a play handler for a survival player in the world, as the connection runs it, and returns
 * what it did once its queued work settled, or undefined when no handler reads the packet.
 */
const handledOf = async <D extends JavaPacketDefinition>(
    definition: D,
    payload: JavaPayload<D>
): Promise<Handled | undefined> => {
    const handler = handlerOf(pathOf(definition));
    if (handler === undefined) return undefined;
    const intents: Record<string, unknown>[] = [];
    const answers: string[] = [];
    const queued: Promise<void>[] = [];
    const session = stub<PlayerSession>({
        getPlayer: () => stub<ReturnType<PlayerSession['getPlayer']>>({ gamemode: Gametype.SURVIVAL })
    });
    const context: Context = {
        connection: stub<Context['connection']>({
            session,
            pose: { x: 0, y: 64, z: 0, yaw: 0, pitch: 0, onGround: true },
            queue: (applied) => void queued.push(applied),
            send: (answer) => void answers.push(pathOf(answer))
        }),
        services: stub<Context['services']>({
            options: stub<Context['services']['options']>({
                world: stub<NonNullable<Context['services']['options']['world']>>({
                    players: stub<NonNullable<Context['services']['options']['world']>['players']>({
                        intent: async (_session, intent) =>
                            void intents.push(Object.fromEntries(Object.entries(intent)))
                    })
                })
            })
        })
    };
    await handler.handle(payload, context);
    await Promise.all(queued);
    return { intents, answers };
};

const read = (path: JavaPacketPath): Need => ({ kind: 'read', path });
const sent = (path: JavaPacketPath): Need => ({ kind: 'sent', path });
const shown = (
    path: JavaPacketPath,
    variant: string,
    call?: PresenterCall,
    carries?: (payload: unknown) => boolean
): Need => ({ kind: 'shown', path, variant, call, ...(carries === undefined ? {} : { carries }) });
const decoded = <D extends JavaPacketDefinition>(
    definition: D,
    variant: string,
    payload: JavaPayload<D>,
    expected?: Readonly<Record<string, unknown>>,
    answers?: JavaPacketPath
): Need => ({
    kind: 'decoded',
    path: pathOf(definition),
    variant,
    payloadKey: JSON.stringify(payload),
    expected,
    ...(answers === undefined ? {} : { answers }),
    handle: () => handledOf(definition, payload)
});

const playerAction = (
    status: PlayerActionStatus,
    variant: string,
    expected?: Readonly<Record<string, unknown>>,
    answers?: JavaPacketPath
): Need =>
    decoded(
        PlayerAction,
        variant,
        { status, position: { x: 0, y: 64, z: 0 }, face: 1, sequence: 1 },
        expected,
        answers
    );
const playerCommand = (
    action: PlayerCommandAction,
    variant: string,
    expected?: Readonly<Record<string, unknown>>
): Need => decoded(PlayerCommand, variant, { entityId: 1, action, data: 0 }, expected);
const clientCommand = (
    action: ClientCommandAction,
    variant: string,
    expected?: Readonly<Record<string, unknown>>
): Need => decoded(ClientCommand, variant, { action }, expected);

/** Whether an intent has every field the case expects. */
const matches = (intent: Readonly<Record<string, unknown>>, expected: Readonly<Record<string, unknown>>): boolean =>
    Object.entries(expected).every(([field, value]) => intent[field] === value);

/** A chunk batch of one empty chunk, sent to a session whose world is lit by the sky alone. */
const sendChunkBatch: PresenterCall = async (presenter) => {
    const session = stub<PlayerSession>({
        getWorld: () =>
            stub<ReturnType<PlayerSession['getWorld']>>({
                getSystems: () =>
                    stub<ReturnType<ReturnType<PlayerSession['getWorld']>['getSystems']>>({
                        getSkyLight: () => 15,
                        getBlockLight: () => 0
                    })
            })
    });
    await presenter.chunkWire?.send([new Chunk(1, 2)], session);
};

/** Whether a `Game Event` payload is the change of game mode to Java's creative, 1. */
const changesToCreative = (payload: unknown): boolean =>
    isRecord(payload) && payload.event === CHANGE_GAME_MODE && payload.value === 1;

/** An entity of a Bedrock type, shown to a Java client through its plain facts. */
const showEntityOf =
    (type: string): PresenterCall =>
    (presenter) =>
        presenter.showEntity(
            stub<Parameters<SessionPresenter['showEntity']>[0]>({
                getRuntimeId: () => 9n,
                describe: () => ({ type, feet: { x: 0, y: 64, z: 0 }, yaw: 0, pitch: 0, headYaw: 0 })
            }),
            stub<PlayerSession>({})
        );

/** Another player coming into view and leaving it, which lists them in the tab list and takes them off. */
const showAndHidePlayer: PresenterCall = async (presenter) => {
    await presenter.showEntity(
        stub<Parameters<SessionPresenter['showEntity']>[0]>({
            getRuntimeId: () => 2n,
            describe: () => ({
                type: 'minecraft:player',
                feet: { x: 0, y: 64, z: 0 },
                yaw: 0,
                pitch: 0,
                headYaw: 0,
                player: { uuid: '00000000-0000-0000-0000-000000000002', name: 'Alex' }
            })
        }),
        stub<PlayerSession>({})
    );
    await presenter.hideEntity(2n);
};

/** Another player coming into view, then changing game mode, which its tab list entry shows. */
const showPlayerChangingMode: PresenterCall = async (presenter) => {
    await presenter.showEntity(
        stub<Parameters<SessionPresenter['showEntity']>[0]>({
            getRuntimeId: () => 2n,
            describe: () => ({
                type: 'minecraft:player',
                feet: { x: 0, y: 64, z: 0 },
                yaw: 0,
                pitch: 0,
                headYaw: 0,
                player: { uuid: '00000000-0000-0000-0000-000000000002', name: 'Alex' }
            })
        }),
        stub<PlayerSession>({})
    );
    await presenter.sendPlayerGameMode(2n, Gametype.CREATIVE, 0n);
};

/** Whether a `Player Info Update` is the game mode change that sets Alex's entry to Java's creative, 1. */
const changesAlexToCreative = (payload: unknown): boolean =>
    isRecord(payload) &&
    payload.actions === PlayerInfoAction.UpdateGameMode &&
    Array.isArray(payload.players) &&
    payload.players.some(
        (player: unknown) =>
            isRecord(player) && player.uuid === '00000000-0000-0000-0000-000000000002' && player.gameMode === 1
    );

/** A change of the client's view distance, which the session tells its chunk wire. */
const changeViewDistance: PresenterCall = async (presenter) => presenter.chunkWire?.radius(6);

/** The `Game Event`s that start and stop the rain and set its and the storm's strength. */
const WEATHER_EVENTS: ReadonlySet<unknown> = new Set([
    START_RAINING,
    STOP_RAINING,
    RAIN_LEVEL_CHANGE,
    THUNDER_LEVEL_CHANGE
]);

/** Whether a `Game Event` payload is one of {@link WEATHER_EVENTS}. */
const changesWeather = (payload: unknown): boolean => isRecord(payload) && WEATHER_EVENTS.has(payload.event);

/** An objective with one score, shown in the sidebar. */
const showSidebar: PresenterCall = (presenter) =>
    presenter.showDisplaySlot('sidebar', {
        name: 'kills',
        displayName: 'Kills',
        criterion: 'dummy',
        sortOrder: 'descending',
        scores: [{ holder: 'Steve', identity: 1n, value: 3 }]
    });

/**
 * Java's entity data index of what an item entity holds and how much experience an orb is
 * worth, both the first index after `Entity`'s own eight.
 */
const FIRST_SUBCLASS_DATA = 8;

/** Whether a `Set Entity Metadata` payload carries the first entry of the entity's own class. */
const carriesSubclassData = (payload: unknown): boolean =>
    isRecord(payload) &&
    Array.isArray(payload.entries) &&
    payload.entries.some((entry: unknown) => isRecord(entry) && entry.index === FIRST_SUBCLASS_DATA);

const BEHAVIORS: readonly Behavior[] = [
    // The status, login and configuration exchanges, which put a client in the world.
    {
        id: 'server-list-ping',
        area: 'connection',
        java: 'A client in the server list is told the server status and answered its ping.',
        needs: [
            read('handshake/serverbound/intention'),
            read('status/serverbound/status_request'),
            sent('status/clientbound/status_response'),
            read('status/serverbound/ping_request'),
            sent('status/clientbound/pong_response')
        ]
    },
    {
        id: 'login',
        area: 'connection',
        java: 'A client logs in with encryption and compression, verified by the session server.',
        needs: [
            read('login/serverbound/hello'),
            sent('login/clientbound/hello'),
            read('login/serverbound/key'),
            sent('login/clientbound/login_compression'),
            sent('login/clientbound/login_finished'),
            read('login/serverbound/login_acknowledged'),
            sent('login/clientbound/login_disconnect')
        ]
    },
    {
        id: 'login-plugin-query',
        area: 'services',
        java: 'A server can ask a logging-in client a plugin query, which a proxy answers for the player.',
        needs: [sent('login/clientbound/custom_query'), read('login/serverbound/custom_query_answer')]
    },
    {
        id: 'configuration',
        area: 'connection',
        java: 'A client is configured with the registries, tags, feature flags and known packs before play.',
        needs: [
            sent('configuration/clientbound/select_known_packs'),
            read('configuration/serverbound/select_known_packs'),
            sent('configuration/clientbound/registry_data'),
            sent('configuration/clientbound/update_tags'),
            sent('configuration/clientbound/update_enabled_features'),
            sent('configuration/clientbound/custom_payload'),
            sent('configuration/clientbound/finish_configuration'),
            read('configuration/serverbound/finish_configuration'),
            sent('configuration/clientbound/disconnect')
        ]
    },
    {
        id: 'configuration-keep-alive',
        area: 'services',
        java: 'A client in the configuration phase is pinged and timed out as one in play is.',
        needs: [
            sent('configuration/clientbound/keep_alive'),
            read('configuration/serverbound/keep_alive'),
            sent('configuration/clientbound/ping'),
            read('configuration/serverbound/pong')
        ]
    },
    {
        id: 'client-information',
        area: 'services',
        java: "The client's language, view distance, skin parts, main hand and chat settings reach the server.",
        needs: [read('configuration/serverbound/client_information'), read('play/serverbound/client_information')]
    },
    {
        id: 'plugin-channels',
        area: 'services',
        java: 'The server and client exchange plugin channel messages, such as the brand, in play.',
        needs: [
            read('configuration/serverbound/custom_payload'),
            sent('play/clientbound/custom_payload'),
            read('play/serverbound/custom_payload')
        ]
    },
    {
        id: 'resource-packs',
        area: 'services',
        java: 'A server pushes resource packs a client downloads, and hears whether it loaded them.',
        needs: [
            sent('configuration/clientbound/resource_pack_push'),
            sent('configuration/clientbound/resource_pack_pop'),
            read('configuration/serverbound/resource_pack'),
            sent('play/clientbound/resource_pack_push'),
            sent('play/clientbound/resource_pack_pop'),
            read('play/serverbound/resource_pack')
        ]
    },
    {
        id: 'cookies',
        area: 'services',
        java: 'A server stores cookies on a client and reads them back in any phase.',
        needs: [
            sent('login/clientbound/cookie_request'),
            read('login/serverbound/cookie_response'),
            sent('configuration/clientbound/cookie_request'),
            sent('configuration/clientbound/store_cookie'),
            read('configuration/serverbound/cookie_response'),
            sent('play/clientbound/cookie_request'),
            sent('play/clientbound/store_cookie'),
            read('play/serverbound/cookie_response')
        ]
    },
    {
        id: 'transfer',
        area: 'services',
        java: 'A server sends a client to another server, as `/transfer` does.',
        needs: [sent('configuration/clientbound/transfer'), sent('play/clientbound/transfer')]
    },
    {
        id: 'server-links',
        area: 'services',
        java: "A client lists the server's links on its pause screen and disconnect screen.",
        needs: [sent('configuration/clientbound/server_links'), sent('play/clientbound/server_links')]
    },
    {
        id: 'dialogs',
        area: 'services',
        java: 'A server shows a client dialogs, as `/dialog` does, and hears the actions their buttons run.',
        needs: [
            sent('configuration/clientbound/show_dialog'),
            sent('configuration/clientbound/clear_dialog'),
            read('configuration/serverbound/custom_click_action'),
            sent('play/clientbound/show_dialog'),
            sent('play/clientbound/clear_dialog'),
            read('play/serverbound/custom_click_action')
        ]
    },
    {
        id: 'code-of-conduct',
        area: 'services',
        java: "A client is shown the server's code of conduct and has to accept it before play.",
        needs: [
            sent('configuration/clientbound/code_of_conduct'),
            read('configuration/serverbound/accept_code_of_conduct')
        ]
    },
    {
        id: 'report-details',
        area: 'services',
        java: "A server adds its own details to the client's crash and abuse reports.",
        needs: [sent('configuration/clientbound/custom_report_details'), sent('play/clientbound/custom_report_details')]
    },
    {
        id: 'reset-chat',
        area: 'services',
        java: 'A server clears the chat a reconfigured client keeps from before.',
        needs: [sent('configuration/clientbound/reset_chat')]
    },
    {
        id: 'post-effects',
        area: 'services',
        java: "A server sets the client's post-processing shader, as a spectated creeper or enderman does.",
        needs: [sent('configuration/clientbound/post_effects'), sent('play/clientbound/post_effects')]
    },
    {
        id: 'reconfiguration',
        area: 'services',
        java: 'A server takes a client in play back to the configuration phase, to change its packs or registries.',
        needs: [
            sent('play/clientbound/start_configuration'),
            read('play/serverbound/configuration_acknowledged'),
            sent('play/clientbound/update_tags')
        ]
    },
    {
        id: 'play-ping',
        area: 'services',
        java: "A client's ping in play and the debug screen's ping chart are answered, and a server can ping the client.",
        needs: [
            read('play/serverbound/ping_request'),
            sent('play/clientbound/pong_response'),
            sent('play/clientbound/ping'),
            read('play/serverbound/pong')
        ]
    },
    {
        id: 'server-data',
        area: 'services',
        java: "A client in play is told the server's description and icon.",
        needs: [sent('play/clientbound/server_data')]
    },
    {
        id: 'low-disk-space',
        area: 'services',
        java: 'A server warns its operators when its disk runs low.',
        needs: [sent('play/clientbound/low_disk_space_warning')]
    },

    // In the world.
    {
        id: 'join-world',
        area: 'join',
        java: 'A client joins the world it is told of, is kept alive and is told why it is disconnected.',
        needs: [
            sent('play/clientbound/login'),
            read('play/serverbound/player_loaded'),
            sent('play/clientbound/keep_alive'),
            read('play/serverbound/keep_alive'),
            sent('play/clientbound/disconnect')
        ]
    },
    {
        id: 'chunks',
        area: 'chunks',
        java: 'A client is sent the chunks around it with their light, in batches, centered on where it is.',
        needs: [
            shown('play/clientbound/chunk_batch_start', 'the start of a batch', sendChunkBatch),
            shown('play/clientbound/level_chunk_with_light', 'a chunk with its light', sendChunkBatch),
            shown('play/clientbound/chunk_batch_finished', 'the end of a batch', sendChunkBatch),
            shown(
                'play/clientbound/set_chunk_cache_center',
                'the chunk the view is centered on',
                (presenter) => presenter.chunkWire?.center(3, 4) ?? Promise.resolve()
            )
        ]
    },
    {
        id: 'chunk-rate',
        area: 'world',
        java: "A server sends chunks at the rate each client's batch acknowledgments ask for.",
        needs: [read('play/serverbound/chunk_batch_received')]
    },
    {
        id: 'chunk-unload',
        area: 'world',
        java: 'A client forgets each chunk that leaves its view, and is told the view and simulation distance.',
        needs: [
            shown('play/clientbound/forget_level_chunk', 'a chunk that left the view', async (presenter) =>
                presenter.chunkWire?.forget([{ x: 3, z: 4 }])
            ),
            shown('play/clientbound/set_chunk_cache_radius', 'the view distance', changeViewDistance),
            shown('play/clientbound/set_simulation_distance', 'the simulation distance', changeViewDistance)
        ]
    },
    {
        id: 'light-updates',
        area: 'world',
        java: 'A client is sent the light that changed in a chunk it holds.',
        needs: [sent('play/clientbound/light_update')]
    },
    {
        id: 'biome-updates',
        area: 'world',
        java: 'A client is sent the biomes `/fillbiome` changed in chunks it holds.',
        needs: [sent('play/clientbound/chunks_biomes')]
    },
    {
        id: 'own-movement',
        area: 'movement',
        java: 'A client moves itself and confirms the teleports the server sends it.',
        needs: [
            read('play/serverbound/move_player_pos'),
            read('play/serverbound/move_player_pos_rot'),
            read('play/serverbound/move_player_rot'),
            read('play/serverbound/move_player_status_only'),
            decoded(PlayerInput, 'hold jump', { flags: PlayerInputFlag.Jump }, { kind: 'holdButtons', jump: true }),
            read('play/serverbound/accept_teleportation'),
            shown('play/clientbound/player_position', 'a teleport of its own player', (presenter) =>
                presenter.sendMove({
                    runtimeId: 7n,
                    position: Position.fromObject({ x: 0, y: 66, z: 0 }),
                    pitch: 0,
                    yaw: 0,
                    headYaw: 0,
                    onGround: true,
                    mode: 'teleport',
                    inputTick: 0n
                })
            )
        ],
        equivalents: ['play/clientbound/player_rotation']
    },
    {
        id: 'sprint-and-sneak',
        area: 'movement',
        java: 'A client sprints, sneaks and gets out of bed, and others see it.',
        needs: [
            playerCommand(PlayerCommandAction.StartSprinting, 'start sprinting', {
                kind: 'setSprinting',
                sprinting: true
            }),
            playerCommand(PlayerCommandAction.StopSprinting, 'stop sprinting', {
                kind: 'setSprinting',
                sprinting: false
            }),
            decoded(
                PlayerInput,
                'hold sneak',
                { flags: PlayerInputFlag.Shift },
                { kind: 'setSneaking', sneaking: true }
            ),
            decoded(PlayerInput, 'let go of sneak', { flags: 0 }, { kind: 'setSneaking', sneaking: false }),
            playerCommand(PlayerCommandAction.StopSleeping, 'get out of bed', { kind: 'setSleeping', sleeping: false })
        ]
    },
    {
        id: 'elytra',
        area: 'player',
        java: 'A client in the air with an elytra starts gliding.',
        needs: [playerCommand(PlayerCommandAction.StartFallFlying, 'start gliding')]
    },
    {
        id: 'look-at',
        area: 'player',
        java: 'A client turns to face a position or entity, as `/teleport ... facing` does.',
        needs: [sent('play/clientbound/player_look_at')]
    },
    {
        id: 'chat',
        area: 'chat',
        java: 'A client chats and runs commands, and is shown system messages.',
        needs: [
            read('play/serverbound/chat'),
            read('play/serverbound/chat_command'),
            sent('play/clientbound/system_chat')
        ]
    },
    {
        id: 'signed-chat',
        area: 'commands',
        java: "A client's chat is signed, acknowledged and shown to others as player chat, which can be deleted.",
        needs: [
            read('play/serverbound/chat_session_update'),
            read('play/serverbound/chat_ack'),
            read('play/serverbound/chat_command_signed'),
            sent('play/clientbound/player_chat'),
            sent('play/clientbound/disguised_chat'),
            sent('play/clientbound/delete_chat')
        ]
    },
    {
        id: 'command-tree',
        area: 'commands',
        java: 'A client is sent the command tree, which it completes and checks commands against as they are typed.',
        needs: [
            sent('play/clientbound/commands'),
            read('play/serverbound/command_suggestion'),
            sent('play/clientbound/command_suggestions'),
            sent('play/clientbound/custom_chat_completions')
        ]
    },
    {
        id: 'advancements',
        area: 'commands',
        java: 'A client is shown its advancements, with toasts, and opens their tabs.',
        needs: [
            sent('play/clientbound/update_advancements'),
            sent('play/clientbound/select_advancements_tab'),
            read('play/serverbound/seen_advancements')
        ]
    },
    {
        id: 'statistics',
        area: 'commands',
        java: 'A client opens its statistics screen and is sent its statistics.',
        needs: [
            clientCommand(ClientCommandAction.RequestStats, 'request statistics'),
            sent('play/clientbound/award_stats')
        ]
    },
    {
        id: 'game-rules',
        area: 'commands',
        java: "An operator's client reads and edits the game rules from its game rules screen.",
        needs: [
            clientCommand(ClientCommandAction.RequestGameRuleValues, 'request game rules'),
            sent('play/clientbound/game_rule_values'),
            read('play/serverbound/set_game_rule')
        ]
    },
    {
        id: 'difficulty',
        area: 'world',
        java: 'A client is shown the difficulty, and an operator changes or locks it from the options screen.',
        needs: [
            shown('play/clientbound/change_difficulty', 'the difficulty', (presenter) =>
                presenter.showDifficulty(Difficulty.HARD)
            ),
            read('play/serverbound/change_difficulty'),
            read('play/serverbound/lock_difficulty')
        ]
    },
    {
        id: 'game-mode-switcher',
        area: 'player',
        java: "An operator's client changes its game mode from the F3+F4 switcher.",
        needs: [read('play/serverbound/change_game_mode')]
    },

    // Blocks.
    {
        id: 'mine-blocks',
        area: 'blocks',
        java: 'A client mines blocks, which breaks them, and its predictions are acknowledged.',
        needs: [
            playerAction(PlayerActionStatus.StartDestroyBlock, 'start mining', { kind: 'mineBlock', step: 'start' }),
            playerAction(PlayerActionStatus.AbortDestroyBlock, 'stop mining', { kind: 'mineBlock', step: 'abort' }),
            playerAction(
                PlayerActionStatus.StopDestroyBlock,
                'finish mining',
                { kind: 'mineBlock', step: 'finish' },
                'play/clientbound/block_changed_ack'
            )
        ]
    },
    {
        id: 'place-blocks',
        area: 'blocks',
        java: 'A client uses an item on a block, which places it or uses the block.',
        needs: [read('play/serverbound/use_item_on')]
    },
    {
        id: 'block-changes',
        area: 'blocks',
        java: 'A client is shown each block that changes in its view.',
        needs: [
            shown('play/clientbound/block_update', 'one changed block', (presenter) =>
                presenter.showBlocks([{ x: 1, y: 64, z: 1, runtimeId: 0, waterlogged: false }])
            ),
            shown('play/clientbound/section_blocks_update', 'several changed blocks of a section', (presenter) =>
                presenter.showBlocks([
                    { x: 1, y: 64, z: 1, runtimeId: 0, waterlogged: false },
                    { x: 2, y: 64, z: 1, runtimeId: 0, waterlogged: false }
                ])
            )
        ]
    },
    {
        id: 'mining-progress',
        area: 'world',
        java: 'A client sees the cracks of a block another player is mining.',
        needs: [sent('play/clientbound/block_destruction')]
    },
    {
        id: 'block-entities',
        area: 'world',
        java: "A client is sent a block entity's data when it changes, such as a sign's text or a banner's patterns.",
        needs: [sent('play/clientbound/block_entity_data')]
    },
    {
        id: 'block-events',
        area: 'world',
        java: 'A client sees block events: chests opening, note blocks playing, pistons moving and bells ringing.',
        needs: [sent('play/clientbound/block_event')]
    },
    {
        id: 'level-events',
        area: 'world',
        java: 'A client sees level events and particles: break particles, doors, dispensers, fireworks and potions.',
        needs: [sent('play/clientbound/level_event'), sent('play/clientbound/level_particles')]
    },
    {
        id: 'sounds',
        area: 'world',
        java: 'A client hears sounds at positions and from entities, and `/stopsound` stops them.',
        needs: [
            sent('play/clientbound/sound'),
            sent('play/clientbound/sound_entity'),
            sent('play/clientbound/stop_sound')
        ]
    },
    {
        id: 'explosions',
        area: 'world',
        java: 'A client sees an explosion, its particles and sound, and is knocked back by it.',
        needs: [sent('play/clientbound/explode')]
    },
    {
        id: 'transient-blocks',
        area: 'world',
        java: 'A client is shown the block a landing falling block becomes, before the block update reaches it.',
        needs: [sent('play/clientbound/add_transient_block')]
    },
    {
        id: 'time',
        area: 'world',
        java: 'A client is told the time of day, which draws the sun and the sky.',
        needs: [
            shown('play/clientbound/set_time', 'the time of day', (presenter) =>
                presenter.sendTime({ dayTime: 6000, gameTime: 6000, advancing: true })
            )
        ]
    },
    {
        id: 'weather',
        area: 'world',
        java: 'A client is shown rain, thunder and their strength through game events.',
        needs: [
            shown(
                'play/clientbound/game_event',
                'begin and end rain, rain and thunder level',
                async (presenter) => {
                    await presenter.showWeather(undefined, 'thunder');
                    await presenter.showWeather('thunder', 'clear');
                },
                changesWeather
            )
        ]
    },
    {
        id: 'game-events',
        area: 'world',
        java: 'A client is told the game events with no packet of their own: no respawn block, the end credits, arrow hits, the pufferfish sting, the elder guardian curse, immediate respawn and limited crafting.',
        needs: [shown('play/clientbound/game_event', 'every event other than the game mode and waiting for chunks')]
    },
    {
        id: 'world-spawn',
        area: 'world',
        java: "A client is told the world's spawn, which compasses point to.",
        needs: [
            shown('play/clientbound/set_default_spawn_position', "the world's spawn", (presenter) =>
                presenter.showWorldSpawn({
                    dimension: { id: 'minecraft:overworld', bedrockId: 0 },
                    position: { x: 0, y: 64, z: 0 },
                    yaw: 0
                })
            )
        ]
    },
    {
        id: 'world-border',
        area: 'world',
        java: 'A client is shown the world border, its center, size, growth and warnings.',
        needs: [
            sent('play/clientbound/initialize_border'),
            sent('play/clientbound/set_border_center'),
            sent('play/clientbound/set_border_lerp_size'),
            sent('play/clientbound/set_border_size'),
            sent('play/clientbound/set_border_warning_delay'),
            sent('play/clientbound/set_border_warning_distance')
        ]
    },
    {
        id: 'tick-rate',
        area: 'world',
        java: 'A client runs at the tick rate `/tick` sets, and steps when the game is frozen.',
        needs: [
            shown('play/clientbound/ticking_state', 'the tick rate', (presenter) =>
                presenter.showTicking({ rate: 10, frozen: true })
            ),
            shown('play/clientbound/ticking_step', 'a step', (presenter) => presenter.showTickStep(20))
        ]
    },
    {
        id: 'maps',
        area: 'world',
        java: "A client holding a filled map is sent the map's colors and decorations.",
        needs: [sent('play/clientbound/map_item_data')]
    },

    // Inventory and containers.
    {
        id: 'hotbar',
        area: 'inventory',
        java: 'A client chooses its hotbar slot, and the server sets it.',
        needs: [
            read('play/serverbound/set_carried_item'),
            shown('play/clientbound/set_held_slot', 'the held slot', (presenter) =>
                presenter.showInventory({ inventory: [], armor: [], offhand: null, handSlot: 2 })
            )
        ]
    },
    {
        id: 'inventory-content',
        area: 'inventory',
        java: "A client is shown its inventory's content and each slot that changes.",
        needs: [
            shown('play/clientbound/container_set_content', 'the whole inventory', (presenter) =>
                presenter.showInventory({ inventory: [], armor: [], offhand: null, handSlot: 0 })
            ),
            shown('play/clientbound/container_set_slot', 'one slot', (presenter) =>
                presenter.showOwnSlot('inventory', 3, null)
            )
        ]
    },
    {
        id: 'creative-inventory',
        area: 'inventory',
        java: 'A creative client takes any item into its inventory.',
        needs: [read('play/serverbound/set_creative_mode_slot')]
    },
    {
        id: 'inventory-clicks',
        area: 'containers',
        java: 'A survival client moves, splits, drags and crafts stacks by clicking slots, and closes the window.',
        needs: [
            read('play/serverbound/container_click'),
            read('play/serverbound/container_close'),
            sent('play/clientbound/set_cursor_item'),
            sent('play/clientbound/set_player_inventory')
        ]
    },
    {
        id: 'open-containers',
        area: 'containers',
        java: "A client opens a block's or an entity's container, sees its progress bars and is told when it closes.",
        needs: [
            sent('play/clientbound/open_screen'),
            sent('play/clientbound/container_set_data'),
            sent('play/clientbound/container_close'),
            read('play/serverbound/container_button_click'),
            read('play/serverbound/container_slot_state_changed')
        ]
    },
    {
        id: 'offhand-swap',
        area: 'containers',
        java: 'A client swaps the items in its hands.',
        needs: [playerAction(PlayerActionStatus.SwapItemWithOffhand, 'swap hands')]
    },
    {
        id: 'use-items',
        area: 'containers',
        java: 'A client uses the item in its hand in the air, eats, drinks, draws a bow and lets it go, and stabs with a spear.',
        needs: [
            read('play/serverbound/use_item'),
            playerAction(PlayerActionStatus.ReleaseUseItem, 'release a used item'),
            playerAction(PlayerActionStatus.Stab, 'stab'),
            sent('play/clientbound/cooldown')
        ]
    },
    {
        id: 'pick-block',
        area: 'containers',
        java: 'A client picks the block or entity it looks at into its hand.',
        needs: [read('play/serverbound/pick_item_from_block'), read('play/serverbound/pick_item_from_entity')]
    },
    {
        id: 'bundles',
        area: 'containers',
        java: 'A client chooses the stack a bundle gives out.',
        needs: [read('play/serverbound/bundle_item_selected')]
    },
    {
        id: 'recipe-book',
        area: 'containers',
        java: 'A client is sent the recipes it knows, fills the crafting grid from its recipe book and keeps its settings.',
        needs: [
            sent('play/clientbound/update_recipes'),
            sent('play/clientbound/recipe_book_add'),
            sent('play/clientbound/recipe_book_remove'),
            sent('play/clientbound/recipe_book_settings'),
            read('play/serverbound/place_recipe'),
            sent('play/clientbound/place_ghost_recipe'),
            read('play/serverbound/recipe_book_change_settings'),
            read('play/serverbound/recipe_book_seen_recipe')
        ]
    },
    {
        id: 'anvil',
        area: 'containers',
        java: 'A client names the item in an anvil.',
        needs: [read('play/serverbound/rename_item')]
    },
    {
        id: 'trading',
        area: 'containers',
        java: "A client is shown a villager's offers and chooses one.",
        needs: [sent('play/clientbound/merchant_offers'), read('play/serverbound/select_trade')]
    },
    {
        id: 'beacon',
        area: 'containers',
        java: "A client chooses a beacon's effects.",
        needs: [read('play/serverbound/set_beacon')]
    },
    {
        id: 'books',
        area: 'tools',
        java: 'A client opens a written book and writes and signs a book and quill.',
        needs: [sent('play/clientbound/open_book'), read('play/serverbound/edit_book')]
    },
    {
        id: 'signs',
        area: 'tools',
        java: 'A client is opened the sign editor and writes the sign.',
        needs: [sent('play/clientbound/open_sign_editor'), read('play/serverbound/sign_update')]
    },

    // Items on the ground and experience.
    {
        id: 'drop-items',
        area: 'items',
        java: 'A client drops the item it holds, or the whole stack, with the drop key.',
        needs: [
            playerAction(PlayerActionStatus.DropItem, 'drop one item'),
            playerAction(PlayerActionStatus.DropAllItems, 'drop the stack')
        ]
    },
    {
        id: 'item-entities',
        area: 'items',
        java: 'A client sees the stack a dropped item entity holds.',
        needs: [
            shown(
                'play/clientbound/set_entity_data',
                'the stack an item entity holds',
                showEntityOf('minecraft:item'),
                carriesSubclassData
            )
        ]
    },
    {
        id: 'pick-up-items',
        area: 'items',
        java: 'A client sees an item, an arrow or an orb fly to the entity that picks it up.',
        needs: [sent('play/clientbound/take_item_entity')]
    },
    {
        id: 'experience',
        area: 'items',
        java: 'A client is shown its experience bar and level, and the size of experience orbs.',
        needs: [
            sent('play/clientbound/set_experience'),
            shown(
                'play/clientbound/set_entity_data',
                'the value of an experience orb',
                showEntityOf('minecraft:xp_orb'),
                carriesSubclassData
            )
        ]
    },

    // Entities.
    {
        id: 'see-entities',
        area: 'entities',
        java: 'A client sees the entities and players around it, what they hold and wear and how they carry themselves.',
        needs: [
            shown('play/clientbound/add_entity', 'an entity coming into view', showEntityOf('minecraft:pig')),
            shown('play/clientbound/rotate_head', "an entity's head", showEntityOf('minecraft:pig')),
            shown('play/clientbound/remove_entities', 'an entity leaving view', (presenter) =>
                presenter.hideEntity(9n)
            ),
            shown('play/clientbound/set_equipment', "an entity's equipment", (presenter) =>
                presenter.showEquipment(9n, {})
            ),
            shown('play/clientbound/set_entity_data', "an entity's flags and pose", (presenter) =>
                presenter.showEntityState(9n, {
                    onFire: true,
                    sneaking: false,
                    sprinting: false,
                    swimming: false,
                    gliding: false,
                    sleeping: false,
                    invisible: false
                })
            ),
            shown('play/clientbound/player_info_update', 'a player listed as it comes into view', showAndHidePlayer),
            shown('play/clientbound/player_info_remove', 'a player unlisted as it leaves view', showAndHidePlayer)
        ],
        // A bundle keeps a spawn's packets on one client tick; the server sends them unbundled.
        equivalents: ['play/clientbound/bundle_delimiter']
    },
    {
        id: 'entity-movement',
        area: 'entities',
        java: 'A client sees entities move and turn.',
        needs: [
            shown('play/clientbound/teleport_entity', "an entity's move", (presenter) =>
                presenter.moveEntities([
                    { runtimeId: 9n, position: { x: 1, y: 64, z: 1 }, yaw: 0, pitch: 0, headYaw: 0, onGround: true }
                ])
            )
        ],
        equivalents: [
            'play/clientbound/move_entity_pos',
            'play/clientbound/move_entity_pos_rot',
            'play/clientbound/move_entity_rot',
            'play/clientbound/entity_position_sync'
        ]
    },
    {
        id: 'entity-velocity',
        area: 'combat',
        java: "A client is told an entity's velocity, which moves the player itself when it is knocked back.",
        needs: [sent('play/clientbound/set_entity_motion'), sent('play/clientbound/projectile_power')]
    },
    {
        id: 'attack-entities',
        area: 'combat',
        java: 'A client attacks the entity it hits, and swings its arm at an entity or at the air.',
        needs: [read('play/serverbound/attack'), read('play/serverbound/punch')]
    },
    {
        id: 'interact-entities',
        area: 'combat',
        java: 'A client uses the item in its hand on an entity, or the entity itself: breeding, riding, trading and the like.',
        needs: [read('play/serverbound/interact')]
    },
    {
        id: 'hurt-feedback',
        area: 'combat',
        java: 'A client sees an entity hurt, the direction it was hurt from, and the arm swings and critical hits of others.',
        needs: [
            sent('play/clientbound/hurt_animation'),
            sent('play/clientbound/damage_event'),
            sent('play/clientbound/animate'),
            sent('play/clientbound/swing_animation')
        ]
    },
    {
        id: 'entity-events',
        area: 'combat',
        java: 'A client sees entity events: deaths, totems, taming hearts, eating and the like.',
        needs: [sent('play/clientbound/entity_event')]
    },
    {
        id: 'combat-tracking',
        area: 'combat',
        java: 'A client is told when it enters and leaves combat, for its narrator and death message.',
        needs: [sent('play/clientbound/player_combat_enter'), sent('play/clientbound/player_combat_end')]
    },
    {
        id: 'riding',
        area: 'player',
        java: 'A client rides an entity, steers it, jumps a horse, opens its inventory and paddles a boat.',
        needs: [
            sent('play/clientbound/set_passengers'),
            read('play/serverbound/move_vehicle'),
            sent('play/clientbound/move_vehicle'),
            read('play/serverbound/paddle_boat'),
            playerCommand(PlayerCommandAction.StartRidingJump, 'start a riding jump'),
            playerCommand(PlayerCommandAction.StopRidingJump, 'stop a riding jump'),
            playerCommand(PlayerCommandAction.OpenInventory, "open the mount's inventory"),
            sent('play/clientbound/mount_screen_open'),
            sent('play/clientbound/move_minecart_along_track')
        ]
    },
    {
        id: 'leashes',
        area: 'player',
        java: 'A client sees a leash between a mob and what holds it.',
        needs: [sent('play/clientbound/set_entity_link')]
    },

    // The player's own state.
    {
        id: 'vitals',
        area: 'vitals',
        java: 'A client is shown its health and food, and its death screen, and respawns from it.',
        needs: [
            shown('play/clientbound/set_health', 'health and food', (presenter) =>
                presenter.showVitals({ health: 20, food: 20, saturation: 5 })
            ),
            shown('play/clientbound/player_combat_kill', 'the death screen', (presenter) =>
                presenter.showDeath({ key: 'death.attack.generic', parameters: ['Steve'] })
            ),
            clientCommand(ClientCommandAction.PerformRespawn, 'press respawn', { kind: 'pressRespawn' }),
            shown('play/clientbound/respawn', 'the respawn after death', (presenter) =>
                presenter.showRespawn({
                    gamemode: Gametype.SURVIVAL,
                    dimension: { id: 'minecraft:overworld', seaLevel: 63 },
                    feet: { x: 0, y: 64, z: 0 },
                    keepData: false,
                    replacesWorld: false
                })
            )
        ]
    },
    {
        id: 'own-game-mode',
        area: 'vitals',
        java: 'A client is told its own game mode.',
        needs: [
            shown(
                'play/clientbound/game_event',
                'the change of game mode',
                (presenter) => presenter.sendGamemode(Gametype.CREATIVE),
                changesToCreative
            )
        ]
    },
    {
        id: 'abilities',
        area: 'player',
        java: 'A client is told whether it may fly and build, how fast it flies, and starts and stops flying.',
        needs: [
            shown('play/clientbound/player_abilities', "the player's abilities", (presenter) =>
                presenter.sendAbilities(stub<Parameters<SessionPresenter['sendAbilities']>[0]>({}))
            ),
            read('play/serverbound/player_abilities')
        ]
    },
    {
        id: 'attributes',
        area: 'player',
        java: 'A client is told its attributes, such as its speed, reach and scale.',
        needs: [sent('play/clientbound/update_attributes')]
    },
    {
        id: 'effects',
        area: 'player',
        java: 'A client is shown the effects it has, with their icons and the time they have left.',
        needs: [sent('play/clientbound/update_mob_effect'), sent('play/clientbound/remove_mob_effect')]
    },

    // What the screen shows beside the world.
    {
        id: 'tab-list-game-modes',
        area: 'hud',
        java: "A client's tab list shows each player's game mode, latency and display name.",
        needs: [
            shown(
                'play/clientbound/player_info_update',
                "another player's game mode",
                showPlayerChangingMode,
                changesAlexToCreative
            ),
            shown('play/clientbound/player_info_update', "a player's latency"),
            shown('play/clientbound/player_info_update', "a player's display name")
        ]
    },
    {
        id: 'tab-list-header',
        area: 'hud',
        java: "A client's tab list shows the server's header and footer.",
        needs: [sent('play/clientbound/tab_list')]
    },
    {
        id: 'boss-bars',
        area: 'hud',
        java: "A client is shown boss bars: the dragon's, the wither's, a raid's and `/bossbar`'s.",
        needs: [
            shown('play/clientbound/boss_event', 'a bar added', (presenter) =>
                presenter.showBossBar('add', {
                    id: 1,
                    actorUniqueId: 1n,
                    title: 'TPS',
                    progress: 1,
                    color: 'green',
                    style: 'progress'
                })
            ),
            shown('play/clientbound/boss_event', "a bar's progress", (presenter) =>
                presenter.showBossBar('progress', {
                    id: 1,
                    actorUniqueId: 1n,
                    title: 'TPS',
                    progress: 0.5,
                    color: 'green',
                    style: 'progress'
                })
            )
        ]
    },
    {
        id: 'titles',
        area: 'hud',
        java: 'A client is shown titles and subtitles with their timing, as `/title` sends them.',
        needs: [
            shown('play/clientbound/set_title_text', 'a title', (presenter) =>
                presenter.showTitle({ kind: 'title', text: 'Hi' })
            ),
            shown('play/clientbound/set_subtitle_text', 'a subtitle', (presenter) =>
                presenter.showTitle({ kind: 'subtitle', text: 'there' })
            ),
            shown('play/clientbound/set_titles_animation', "a title's timing", (presenter) =>
                presenter.showTitle({ kind: 'times', fadeIn: 10, stay: 70, fadeOut: 20 })
            ),
            shown('play/clientbound/clear_titles', 'titles cleared', (presenter) =>
                presenter.showTitle({ kind: 'clear' })
            )
        ]
    },
    {
        id: 'action-bar',
        area: 'hud',
        java: 'A client is shown action bar text above its hotbar.',
        needs: [
            shown('play/clientbound/set_action_bar_text', 'action bar text', (presenter) =>
                presenter.showTitle({ kind: 'actionbar', text: 'Hi' })
            )
        ]
    },
    {
        id: 'scoreboard',
        area: 'hud',
        java: 'A client is shown scoreboard objectives in the sidebar, the tab list and below names.',
        needs: [
            shown('play/clientbound/set_objective', 'an objective shown', showSidebar),
            shown('play/clientbound/set_display_objective', 'a slot shown', showSidebar),
            shown('play/clientbound/set_score', 'its scores', showSidebar),
            shown('play/clientbound/reset_score', 'a score reset', async (presenter) => {
                await showSidebar(presenter);
                await presenter.showScore('kills', { holder: 'Steve', identity: 1n }, undefined);
            })
        ]
    },
    {
        id: 'teams',
        area: 'hud',
        java: 'A client is shown teams: their colors, prefixes, name tag visibility and collision.',
        needs: [sent('play/clientbound/set_player_team')]
    },
    {
        id: 'waypoints',
        area: 'hud',
        java: "A client's locator bar shows the waypoints of other players.",
        needs: [sent('play/clientbound/waypoint')]
    },

    // Spectating, operator tools and debugging.
    {
        id: 'spectator',
        area: 'tools',
        java: 'A spectator teleports to a player it picks from its menu and sees through the eyes of the entity it spectates.',
        needs: [
            read('play/serverbound/teleport_to_entity'),
            read('play/serverbound/spectator_action'),
            sent('play/clientbound/set_camera')
        ]
    },
    {
        id: 'command-blocks',
        area: 'tools',
        java: "An operator's client edits command blocks and command block minecarts.",
        needs: [read('play/serverbound/set_command_block'), read('play/serverbound/set_command_minecart')]
    },
    {
        id: 'structure-blocks',
        area: 'tools',
        java: "An operator's client edits structure blocks and jigsaw blocks, and generates from a jigsaw.",
        needs: [
            read('play/serverbound/set_structure_block'),
            read('play/serverbound/set_jigsaw_block'),
            read('play/serverbound/jigsaw_generate')
        ]
    },
    {
        id: 'test-blocks',
        area: 'tools',
        java: "An operator's client edits test blocks and test instance blocks, and is shown their results.",
        needs: [
            read('play/serverbound/set_test_block'),
            read('play/serverbound/test_instance_block_action'),
            sent('play/clientbound/test_instance_block_status'),
            sent('play/clientbound/game_test_highlight_pos')
        ]
    },
    {
        id: 'nbt-queries',
        area: 'tools',
        java: "The debug screen's copy of a block's or entity's data asks the server for it.",
        needs: [
            read('play/serverbound/block_entity_tag_query'),
            read('play/serverbound/entity_tag_query'),
            sent('play/clientbound/tag_query')
        ]
    },
    {
        id: 'debug',
        area: 'tools',
        java: "A client with the debug screen open is sent the server's tick samples and the debug values it subscribes to.",
        needs: [
            read('play/serverbound/debug_subscription_request'),
            sent('play/clientbound/debug_sample'),
            sent('play/clientbound/debug/block_value'),
            sent('play/clientbound/debug/chunk_value'),
            sent('play/clientbound/debug/entity_value'),
            sent('play/clientbound/debug/event')
        ]
    },
    {
        id: 'client-tick',
        area: 'services',
        java: 'A client says when each of its ticks ends, which the server times its movement checks by.',
        needs: [read('play/serverbound/client_tick_end')]
    }
];

/** One packet a presenter call sent. */
interface SentPacket {
    readonly path: string;
    readonly payload: unknown;
}

/** What the presenter calls sent, by call, filled before the rows run. */
const presenterSends = new Map<PresenterCall, readonly SentPacket[]>();

/** What the handlers did with each decoded case, filled before the rows run. */
const handlerResults = new Map<Need, Handled | undefined>();

/** The translations every presenter of the run shares, as every Java session on a server does. */
const BLOCKS = javaBlockTranslation();
const ITEM_TRANSLATION = javaItemTranslation();
const COLUMNS = new JavaChunkTranslator(BLOCKS);

/** Drives a fresh presenter for player 7 through a call and records the packets it sent. */
const record = async (call: PresenterCall): Promise<readonly SentPacket[]> => {
    const sentPackets: SentPacket[] = [];
    const presenter = new JavaPresenter(
        (definition, payload) => void sentPackets.push({ path: pathOf(definition), payload }),
        7n,
        BLOCKS,
        ITEM_TRANSLATION,
        COLUMNS
    );
    await call(presenter);
    return sentPackets;
};

/** Why a need is not met, or undefined when it is. */
const unmet = (need: Need): string | undefined => {
    switch (need.kind) {
        case 'read':
            return handlerOf(need.path) === undefined ? `${need.path} is not read` : undefined;
        case 'decoded': {
            const handled = handlerResults.get(need);
            if (handled === undefined) return `${need.path} is not read`;
            const { expected, answers } = need;
            if (handled.intents.length === 0) return `${need.path} (${need.variant}) decodes into nothing`;
            if (expected !== undefined && !handled.intents.some((intent) => matches(intent, expected))) {
                return `${need.path} (${need.variant}) decodes into ${JSON.stringify(handled.intents)}, not ${JSON.stringify(expected)}`;
            }
            if (answers !== undefined && !handled.answers.includes(answers)) {
                return `${need.path} (${need.variant}) is not answered with ${answers}`;
            }
            return undefined;
        }
        case 'sent':
            return DEFINED.has(need.path) ? undefined : `${need.path} has no layout`;
        case 'shown': {
            if (need.call === undefined) return `${need.path} (${need.variant}) has no presenter call that sends it`;
            const { path, carries = () => true } = need;
            const sentPackets = presenterSends.get(need.call) ?? [];
            return sentPackets.some((packet) => packet.path === path && carries(packet.payload))
                ? undefined
                : `${path} (${need.variant}) is not sent`;
        }
    }
};

const scenarios: readonly BehaviorScenario<Behavior>[] = BEHAVIORS.map((behavior) => ({
    name: behavior.area,
    java: behavior.java,
    reference: `Java ${RELEASE.minecraftVersion}'s packets report and ServerGamePacketListenerImpl`,
    subjects: () => [behavior],
    idOf: ({ id }) => id,
    covers: () => undefined,
    run: ({ needs }) => {
        const missing = needs.map(unmet).filter((reason) => reason !== undefined);
        return missing.length === 0 ? undefined : missing.join('; ');
    },
    classify: ({ area, java }, difference) => {
        const issue: string | undefined = AREA_ISSUES[area];
        return issue === undefined
            ? undefined
            : {
                  kind: 'deferred',
                  reason: `In Java: ${java} For a Java client here: ${difference}.`,
                  reference: issue
              };
    }
}));

/** Every packet of the release, by path. */
const releasePaths = (): string[] =>
    Object.entries(RELEASE.packets).flatMap(([phase, bounds]) =>
        Object.entries(bounds).flatMap(([bound, ids]) =>
            Object.keys(ids ?? {}).map((key) => `${phase}/${bound}/${key}`)
        )
    );

describeFamily(FAMILIES.protocolJavaClient, [], () => {
    it(`gives every packet of Java ${RELEASE.minecraftVersion}, or each of its cases, to one behavior`, () => {
        // Each claim of a packet: a whole packet, or one case of it, which a decoded case names by
        // its payload and a shown case by what it shows.
        const claims = BEHAVIORS.flatMap(({ id, needs, equivalents = [] }) => {
            const caseOf = (need: Need): string | undefined =>
                need.kind === 'decoded' ? need.payloadKey : need.kind === 'shown' ? need.variant : undefined;
            const own = [
                ...needs.map((need) => ({ path: need.path, case: caseOf(need) })),
                ...needs.flatMap((need) =>
                    need.kind === 'decoded' && need.answers !== undefined
                        ? [{ path: need.answers, case: undefined }]
                        : []
                ),
                ...equivalents.map((path) => ({ path, case: undefined }))
            ];
            const unique = new Map(own.map((claim) => [`${claim.path}#${claim.case ?? ''}`, claim]));
            return [...unique.values()].map((claim) => ({ id, ...claim }));
        });
        const paths = releasePaths();
        const claimed = new Set(claims.map(({ path }) => path));

        // A new release's packet fails here until a behavior below claims it, and a packet the
        // release dropped fails until its claim goes; the rows then record what the server lacks.
        expect(
            paths.filter((path) => !claimed.has(path)),
            'packets of the release no behavior claims'
        ).toEqual([]);
        expect(
            [...claimed].filter((path) => !paths.includes(path)),
            'claimed packets the release does not have'
        ).toEqual([]);
        // Several behaviors share a packet only through its distinct cases, such as `Player Action`'s
        // statuses; a whole packet, or one case, has one owner.
        const owners = Map.groupBy(claims, ({ path }) => path);
        expect(
            [...owners]
                .filter(
                    ([, owned]) =>
                        (owned.length > 1 && owned.some((claim) => claim.case === undefined)) ||
                        new Set(owned.map((claim) => claim.case)).size < owned.length
                )
                .map(
                    ([path, owned]) =>
                        `${path}: ${owned.map(({ id, case: c }) => `${id} (${c ?? 'whole'})`).join(', ')}`
                ),
            'packets or cases more than one claim owns'
        ).toEqual([]);
        expect(new Set(BEHAVIORS.map(({ id }) => id)).size).toBe(BEHAVIORS.length);
    });

    it('measures what a Java client can do and is shown, against the real handlers and presenter', async () => {
        for (const { needs } of BEHAVIORS) {
            for (const need of needs) {
                if (need.kind === 'shown' && need.call !== undefined && !presenterSends.has(need.call)) {
                    presenterSends.set(need.call, await record(need.call));
                }
                if (need.kind === 'decoded') handlerResults.set(need, await need.handle());
            }
        }
        const rows = measureScenarios(FAMILIES.protocolJavaClient, import.meta.filename, scenarioGroup(scenarios));

        // The milestone the Java plan has reached passes whole: joining, moving, chunks, chat,
        // blocks, the inventory, entities and vitals.
        const supported = new Set(
            BEHAVIORS.filter(({ area }) => AREA_ISSUES[area] === undefined).map(({ area, id }) => `${area}:${id}`)
        );
        const supportedRows = rows.filter(({ id }) => supported.has(id));
        expect(supportedRows.length).toBe(supported.size);
        expect(
            supportedRows
                .filter(({ difference }) => difference !== undefined)
                .map(({ id, difference }) => `${id}: ${difference}`)
        ).toEqual([]);
    });
});

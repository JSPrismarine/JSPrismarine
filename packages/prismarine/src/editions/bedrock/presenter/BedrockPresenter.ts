import { Gametype } from '@jsprismarine/minecraft';
import { PositionMode, SetTimePacket, TextPacketType } from '@jsprismarine/protocol';
import ContainerClosePacket from '@jsprismarine/protocol/bedrock/packet/ContainerClosePacket';
import MovePlayerPacket from '@jsprismarine/protocol/bedrock/packet/MovePlayerPacket';
import RemoveActorPacket from '@jsprismarine/protocol/bedrock/packet/RemoveActorPacket';
import SetDefaultGameTypePacket from '@jsprismarine/protocol/bedrock/packet/SetDefaultGameTypePacket';
import SetPlayerGameTypePacket from '@jsprismarine/protocol/bedrock/packet/SetPlayerGameTypePacket';
import TextPacket from '@jsprismarine/protocol/bedrock/packet/TextPacket';
import UpdateAdventureSettingsPacket from '@jsprismarine/protocol/bedrock/packet/UpdateAdventureSettingsPacket';
import UpdatePlayerGameTypePacket from '@jsprismarine/protocol/bedrock/packet/UpdatePlayerGameTypePacket';

import type ClientConnection from '../../../network/ClientConnection';
import type PlayerSession from '../../../player/PlayerSession';
import type { ShownEntity } from '../../../world/ShownActor';
import type { ListedPlayer } from '../../../network/playerListEntry';
import type { AbilityTarget } from '../../../network/replica/firstSight';
import { abilitiesPacket } from '../../../network/replica/firstSight';
import { bossEventOf } from './bedrockBossBar';
import { playerListAddOf } from './bedrockPlayerList';
import type {
    BossBarChange,
    MessageKind,
    MoveMode,
    SessionPresenter,
    ShownBossBar,
    ShownMessage,
    ShownMove
} from '../../../player/presenter/SessionPresenter';

/**
 * The `Text` type that shows each kind of message. `rawText` is `TextObject`, the one type whose
 * message the client parses as a JSON text object.
 */
const TEXT_TYPE: Readonly<Record<MessageKind, TextPacketType>> = {
    raw: TextPacketType.Raw,
    chat: TextPacketType.Chat,
    translation: TextPacketType.Translate,
    system: TextPacketType.SystemMessage,
    announcement: TextPacketType.Announcement,
    whisper: TextPacketType.Whisper,
    rawText: TextPacketType.TextObject
};

/** The `MovePlayer` mode for each kind of movement. */
const POSITION_MODE: Readonly<Record<MoveMode, PositionMode>> = {
    normal: PositionMode.Normal,
    respawn: PositionMode.Respawn,
    teleport: PositionMode.Teleport,
    headRotation: PositionMode.OnlyHeadRot
};

/** The part of a connection a presenter sends through. */
export type PresenterConnection = Pick<ClientConnection, 'sendDataPacket'>;

/** The outbound contract in Bedrock packets, over one client's connection. */
export class BedrockPresenter implements SessionPresenter {
    public readonly edition = 'bedrock';
    private readonly connection: PresenterConnection;

    /**
     * @param connection - The connection the session's client is on.
     */
    public constructor(connection: PresenterConnection) {
        this.connection = connection;
    }

    /** Sends `SetTime`. */
    public async sendTime(tick: number): Promise<void> {
        await this.connection.sendDataPacket(new SetTimePacket({ time: tick }));
    }

    /** Sends `SetPlayerGameType`. */
    public async sendGamemode(gamemode: Gametype): Promise<void> {
        await this.connection.sendDataPacket(new SetPlayerGameTypePacket({ gametype: gamemode }));
    }

    /** Sends `SetDefaultGameType`. */
    public async sendDefaultGameMode(gamemode: Gametype): Promise<void> {
        const reply = new SetDefaultGameTypePacket();
        reply.gamemode = gamemode;
        await this.connection.sendDataPacket(reply);
    }

    /**
     * Sends `UpdatePlayerGameType`, which the docs have the server send to every client after it
     * accepts a game type change, because each client caches the game type and permission flags
     * of every player it knows about.
     */
    public async sendPlayerGameMode(runtimeId: bigint, gamemode: Gametype, inputTick: bigint): Promise<void> {
        await this.connection.sendDataPacket(
            new UpdatePlayerGameTypePacket({ playerGameType: gamemode, targetPlayer: runtimeId, tick: inputTick })
        );
    }

    /**
     * Sends `UpdateAdventureSettings`. It names no actor and describes the client receiving it,
     * so it goes to that client alone: a spectator's `worldImmutable` sent to everyone froze the
     * world for every other client.
     */
    public async sendInteractionSettings(gamemode: Gametype): Promise<void> {
        const spectator = gamemode === Gametype.SPECTATOR;
        await this.connection.sendDataPacket(
            new UpdateAdventureSettingsPacket({
                worldImmutable: spectator,
                noAttackingPlayers: spectator,
                noAttackingMobs: spectator,
                autoJump: true,
                showNameTags: true
            })
        );
    }

    /** Sends `UpdateAbilities` (`abilitiesPacket`). */
    public async sendAbilities(target: AbilityTarget): Promise<void> {
        await this.connection.sendDataPacket(abilitiesPacket(target));
    }

    /** Queues the entity's own first-sight batch, which it builds once a flush for each codec. */
    public showEntity(entity: ShownEntity, session: PlayerSession): Promise<void> {
        return entity.spawnTo(session);
    }

    /** Sends `RemoveActor`; the server gives an entity one id for its runtime and unique ids. */
    public async hideEntity(runtimeId: bigint): Promise<void> {
        const packet = new RemoveActorPacket();
        packet.uniqueEntityId = runtimeId;
        await this.connection.sendDataPacket(packet);
    }

    /** Sends nothing: a Bedrock client's moves go in the replicator's shared batches. */
    public async moveEntities(): Promise<void> {}

    /** Sends nothing: a Bedrock client's block changes go in the replicator's shared batches. */
    public async showBlocks(): Promise<void> {}

    /** Sends nothing: the session sends a Bedrock client its inventory, with the stack ids it names stacks by. */
    public async showInventory(): Promise<void> {}

    /** Sends nothing: the session sends a Bedrock client its slots, with the stack ids it names stacks by. */
    public async showOwnSlot(): Promise<void> {}

    /** Sends nothing: a Bedrock client's entity data goes in the replicator's shared batches. */
    public async showEntityState(): Promise<void> {}

    /** Sends nothing: a Bedrock client's equipment goes in the replicator's shared batches. */
    public async showEquipment(): Promise<void> {}

    /** Sends nothing: a Bedrock client's vitals are attributes, which the session sends. */
    public async showVitals(): Promise<void> {}

    /** Sends nothing: the session runs Bedrock's respawn exchange, whose first half opens the screen. */
    public async showDeath(): Promise<void> {}

    /** Sends nothing: the session runs Bedrock's respawn exchange and dimension change. */
    public async showRespawn(): Promise<void> {}

    /** Sends one `PlayerList` Add with every entry. */
    public async sendPlayerList(players: readonly ListedPlayer[]): Promise<void> {
        await this.connection.sendDataPacket(playerListAddOf(players));
    }

    /** Sends `MovePlayer`. */
    public async sendMove({
        runtimeId,
        position,
        pitch,
        yaw,
        headYaw,
        onGround,
        mode,
        inputTick
    }: ShownMove): Promise<void> {
        await this.connection.sendDataPacket(
            new MovePlayerPacket({
                runtimeEntityId: runtimeId,
                position,
                pitch,
                yaw,
                headYaw,
                mode: POSITION_MODE[mode],
                onGround,
                // "If client bound this has no meaning", so it is always zero here.
                ridingEntityRuntimeId: 0n,
                // The server does not model why a teleport happened, so the cause is Unknown (0)
                // and the source actor type is 0.
                teleportData: mode === 'teleport' ? { cause: 0, sourceActorType: 0 } : null,
                tick: inputTick
            })
        );
    }

    /**
     * Sends `ContainerClose` back with the id and type the client sent, and `Server Initiated
     * Close` false, since the player closed this one. A Bedrock client takes its screen down
     * first and waits for this answer before it opens the next container.
     */
    public async containerClosed(window: number, clientContainerType: number): Promise<void> {
        const pk = new ContainerClosePacket();
        pk.containerId = window;
        pk.containerType = clientContainerType;
        pk.serverInitiatedClose = false;
        await this.connection.sendDataPacket(pk);
    }

    /**
     * Sends `Text`, with `Filtered Message` empty: it is the text after chat filtering, which a
     * dedicated server leaves empty for its own messages. Repeating the message there doubled
     * the payload.
     */
    public async sendMessage({
        message,
        kind,
        parameters,
        needsTranslation,
        sourceName,
        xuid
    }: ShownMessage): Promise<void> {
        await this.connection.sendDataPacket(
            new TextPacket({
                type: TEXT_TYPE[kind],
                needsTranslation,
                sourceName,
                message,
                parameters: [...parameters],
                xuid,
                platformChatId: '',
                filtered: ''
            })
        );
    }

    /** Sends `BossEvent`; see {@link bossEventOf}. */
    public async showBossBar(change: BossBarChange, bar: ShownBossBar): Promise<void> {
        await this.connection.sendDataPacket(bossEventOf(change, bar));
    }
}

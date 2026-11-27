import type { Weather } from '@jsprismarine/engine-systems';
import type { Difficulty } from '@jsprismarine/minecraft';
import { Gametype } from '@jsprismarine/minecraft';
import { PositionMode, SetTimePacket, TakeItemActorPacket, TextPacketType } from '@jsprismarine/protocol';
import ContainerClosePacket from '@jsprismarine/protocol/bedrock/packet/ContainerClosePacket';
import SetDifficultyPacket from '@jsprismarine/protocol/bedrock/packet/SetDifficultyPacket';
import SetSpawnPositionPacket, {
    SpawnPositionType
} from '@jsprismarine/protocol/bedrock/packet/SetSpawnPositionPacket';
import MovePlayerPacket from '@jsprismarine/protocol/bedrock/packet/MovePlayerPacket';
import RemoveActorPacket from '@jsprismarine/protocol/bedrock/packet/RemoveActorPacket';
import SetDefaultGameTypePacket from '@jsprismarine/protocol/bedrock/packet/SetDefaultGameTypePacket';
import SetPlayerGameTypePacket from '@jsprismarine/protocol/bedrock/packet/SetPlayerGameTypePacket';
import TextPacket from '@jsprismarine/protocol/bedrock/packet/TextPacket';
import TransferPacket from '@jsprismarine/protocol/bedrock/packet/TransferPacket';
import UpdateAdventureSettingsPacket from '@jsprismarine/protocol/bedrock/packet/UpdateAdventureSettingsPacket';
import UpdatePlayerGameTypePacket from '@jsprismarine/protocol/bedrock/packet/UpdatePlayerGameTypePacket';
import UnlockedRecipesPacket, {
    UnlockedRecipesType
} from '@jsprismarine/protocol/bedrock/packet/UnlockedRecipesPacket';

import type ClientConnection from '../../../network/ClientConnection';
import type PlayerSession from '../../../player/PlayerSession';
import type { ShownEntity } from '../../../world/ShownActor';
import type { ListedPlayer } from '../../../network/playerListEntry';
import type { AbilityTarget } from '../../../network/replica/firstSight';
import { abilitiesPacket } from '../../../network/replica/firstSight';
import { bossEventOf } from './bedrockBossBar';
import { displaySlotPacketsOf, removeObjectivePacketOf, scorePacketOf } from './bedrockScoreboard';
import { titlePacketOf } from './bedrockTitle';
import { weatherPacketsOf } from './bedrockWeather';
import { playerListAddOf } from './bedrockPlayerList';
import type {
    BossBarChange,
    MessageKind,
    MoveMode,
    RecipeBookChange,
    SessionPresenter,
    ShownBossBar,
    ShownMessage,
    ShownMove,
    ShownObjective,
    ShownScore,
    ShownTime,
    ShownTitle,
    ShownWorldSpawn
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

/**
 * The `CraftingDataPacket` entries a Java recipe unlocks in the client's book. A recipe with none
 * is not in the book. Without one, a recipe is named by its own id, which is the id its entry
 * goes out under unless it is a transmute.
 */
export type RecipeBookEntries = (recipe: string) => readonly string[];

const UNLOCKED_RECIPES_TYPE = {
    initial: UnlockedRecipesType.INITIALLY_UNLOCKED_RECIPES,
    unlocked: UnlockedRecipesType.NEWLY_UNLOCKED_RECIPES,
    locked: UnlockedRecipesType.REMOVE_UNLOCKED_RECIPES
} as const;

/** The outbound contract in Bedrock packets, over one client's connection. */
export class BedrockPresenter implements SessionPresenter {
    public readonly edition = 'bedrock';
    private readonly connection: PresenterConnection;
    private readonly bookEntries: RecipeBookEntries;

    /**
     * @param connection - The connection the session's client is on.
     * @param bookEntries - The book entries of each recipe; see {@link RecipeBookEntries}.
     */
    public constructor(connection: PresenterConnection, bookEntries: RecipeBookEntries = (recipe) => [recipe]) {
        this.connection = connection;
        this.bookEntries = bookEntries;
    }

    /** Sends `SetTime`. */
    public async sendTime({ dayTime }: ShownTime): Promise<void> {
        await this.connection.sendDataPacket(new SetTimePacket({ time: dayTime }));
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

    /** Sends nothing: a Bedrock client's experience is two attributes, which the session sends. */
    public async showExperience(): Promise<void> {}

    /** Sends nothing: the world's `UPDATE_STACK_SIZE` actor event tells a Bedrock client. */
    public async showItemCount(): Promise<void> {}

    /** Sends `TakeItemActor`, which carries no count: the client animates the whole stack. */
    public async showPickUp(item: bigint, collector: bigint): Promise<void> {
        const take = new TakeItemActorPacket();
        take.itemRuntimeEntityId = item;
        take.takerRuntimeEntityId = collector;
        await this.connection.sendDataPacket(take);
    }

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

    /** Sends `SetTitle`; see {@link titlePacketOf}. */
    public async showTitle(title: ShownTitle): Promise<void> {
        await this.connection.sendDataPacket(titlePacketOf(title));
    }

    /** Sends `SetDisplayObjective`, then `SetScore` with every score the slot shows. */
    public async showDisplaySlot(slot: string, objective: ShownObjective | undefined): Promise<void> {
        // Queued together, so no other packet comes between the header and its scores.
        await Promise.all(
            displaySlotPacketsOf(slot, objective).map((packet) => this.connection.sendDataPacket(packet))
        );
    }

    /** Sends `SetScore` with the holder's new score, or its removal. */
    public async showScore(
        objective: string,
        holder: Omit<ShownScore, 'value'>,
        value: number | undefined
    ): Promise<void> {
        await this.connection.sendDataPacket(scorePacketOf(objective, holder, value));
    }

    /** Sends `RemoveObjective`. */
    public async removeObjective(objective: string): Promise<void> {
        await this.connection.sendDataPacket(removeObjectivePacketOf(objective));
    }

    /** Sends the level events that take the client's sky to the weather; see {@link weatherPacketsOf}. */
    public async showWeather(from: Weather | undefined, to: Weather): Promise<void> {
        await Promise.all(weatherPacketsOf(from, to).map((packet) => this.connection.sendDataPacket(packet)));
    }

    /** Sends `SetDifficulty`. */
    public async showDifficulty(difficulty: Difficulty): Promise<void> {
        await this.connection.sendDataPacket(new SetDifficultyPacket({ difficulty }));
    }

    /** Sends `SetSpawnPosition` as the world's spawn. */
    public async showWorldSpawn({ dimension, position }: ShownWorldSpawn): Promise<void> {
        const blockPosition = { x: position.x, y: position.y, z: position.z };
        await this.connection.sendDataPacket(
            new SetSpawnPositionPacket({
                type: SpawnPositionType.WorldSpawn,
                position: blockPosition,
                dimension: dimension.bedrockId,
                blockPosition
            })
        );
    }

    /** Not shown: a Bedrock client follows the server's ticks and has no tick rate of its own. */
    public async showTicking(): Promise<void> {}

    /** Not shown: a Bedrock client follows the server's ticks and has no tick rate of its own. */
    public async showTickStep(): Promise<void> {}

    /**
     * Sends `UnlockedRecipes` with the book entries of the recipes. A delta that names no entry
     * is not sent; the whole book is, so a player with none still gets an empty book.
     */
    public async showRecipeBook(change: RecipeBookChange): Promise<void> {
        const recipes = change.recipes.flatMap(this.bookEntries);
        if (recipes.length === 0 && change.kind !== 'initial') return;

        await this.connection.sendDataPacket(
            new UnlockedRecipesPacket({ type: UNLOCKED_RECIPES_TYPE[change.kind], recipes })
        );
    }

    /** Sends `Transfer`, which keeps the world the client has loaded until the other server's arrives. */
    public async transfer(host: string, port: number): Promise<void> {
        await this.connection.sendDataPacket(
            new TransferPacket({
                address: host,
                port,
                reloadWorld: false,
                gatheringsConfig: null,
                transferSettings: null
            })
        );
    }
}

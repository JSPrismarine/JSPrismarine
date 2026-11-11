import { Vector3 } from '@jsprismarine/math';
import type { EntityPosition } from '@jsprismarine/entities';
import type { Gametype } from '@jsprismarine/minecraft';
import { ActorEvent, DisconnectReason } from '@jsprismarine/minecraft';
import type { InetAddress } from '@jsprismarine/raknet';
import assert from 'node:assert';
import { Chat, ChatType } from './chat/Chat';
import { chatRecipientOf } from './chat/ChatManager';
import type { ChatRecipient } from './chat/ChatManager';
import { AttributeIds } from '@jsprismarine/protocol/wire/structures/Attribute';
import type { DamageSource } from './entity/DamageSource';
import { deathMessage } from './entity/DeathMessages';
import { DamageCause } from './entity/DamageCause';
import type { EntityPositionOptions } from './entity/Entity';
import type { DataEntity } from './entity/data/DataEntity';
import { boxOf } from './entity/data/facts';
import type { EntityBox } from './entity/data/facts';
import type { EntityRuntime } from './entity/data/EntityRuntime';
import type { LiveEntityRuntime } from './entity/data/live';
import { DetachedPlayerView, moveStorePlayer, StorePlayerActor } from './entity/data/storePlayers';
import { entityIds } from './entity/entityIds';
import type { StatusEffect, StatusEffectInput } from './entity/StatusEffect';
import type { ViewableEquipment } from './entity/predicateView';
import { EYE_HEIGHT, eyePositionAt } from './entity/playerEyes';
import { mayFlyIn } from './entity/playerComponents';
import { PLAYER_IDENTIFIER } from './entity/playerOverlay';
import { PORTAL_COOLDOWN_TICKS } from './entity/PortalContact';
import { StorePlayer } from './entity/storePlayer';
import { survivalReaches } from './entity/survivalPlayer';
import PlayerSetGamemodeEvent from './events/player/PlayerSetGamemodeEvent';
import PlayerToggleFlightEvent from './events/player/PlayerToggleFlightEvent';
import PlayerToggleSprintEvent from './events/player/PlayerToggleSprintEvent';
import type PlayerSession from './network/PlayerSession';
import { PositionMode, TextPacketType } from '@jsprismarine/protocol';
import { loadAdvancements } from './advancement/progress';
import { advancementPlayerTick } from './advancement/triggers';
import { enchantmentSeedOf } from './enchantment/enchantingTable';
import type Device from './utils/Device';
import Timer from './utils/Timer';
import type UUID from '@jsprismarine/protocol/wire/structures/UUID';
import type Skin from '@jsprismarine/protocol/wire/structures/skin/Skin';
import type { World } from './world/';
import { Position } from './world/Position';
import type { ShownPlayer } from './world/ShownPlayer';
import { requestedSpawnPosition } from './world/SpawnPlacement';
import type { respawnPoint } from './world/SpawnPlacement';
import type { StoredSpawnPoint } from './world/RespawnPoint';
import type { RespawnAnswer, RespawnRequest, RespawnSearch } from './world/RespawnSearch';
import { lastPlayerRecord } from './world/PlayerRecords';
import { applyPlayerRecord, recordedPosition } from './world/playerRecord';
import { keyOfPlayer } from './playerIdentity';
import type { PlayerSpawn } from './world/SpawnPlacement';
import type { BlockMining } from './world/BlockMining';
import { blockMiningOf, playerMiningOf } from './world/BlockMining';
import type { ExperienceHolder } from './entity/Experience';
import type { PlayerComponents } from './entity/playerComponents';
import { addFood, setSaturation } from './entity/playerHunger';
import type { PlainRecord } from './world/changelog/PlainData';
import type Server from './Server';
import type HumanInventory from './inventory/HumanInventory';
import type CraftingInput from './crafting/CraftingInput';
import type { Metadata } from '@jsprismarine/protocol/wire/structures/Metadata';
import type { Attributes } from '@jsprismarine/protocol/wire/structures/Attribute';

/** How often the two per-player triggers are checked, which is Java's one second. */
const ADVANCEMENT_CHECK_TICKS = 20;

/**
 * Everything the login handshake said about who is connecting.
 *
 * Passed whole to the constructor rather than assigned field by field afterwards: a player
 * built without a name or an xuid was briefly reachable in that state, and the ban and
 * online-mode checks that read them ran against whatever had been set so far.
 */
export interface PlayerIdentity {
    uuid: UUID;
    name: string;
    xuid: string;
    randomId: number;
    locale: string;
    skin: Skin | null;
    device: Device | null;
}

/**
 * Where a player comes back after a death: the world, and the three positions the respawn
 * exchange needs in it. See {@link respawnPoint} for what each position is.
 */
export type RespawnDestination = ReturnType<typeof respawnPoint> & { readonly world: World };

export default class Player {
    private readonly address: InetAddress;

    /**
     * This player as a store entity: the `minecraft:player` entity while it is in a store, and
     * everything the store does not model yet beside it, from the inventory to the identity. The
     * player keeps no entity state of its own. See {@link StorePlayer}.
     */
    private readonly store: StorePlayer;

    /** The world this player is in, or is about to enter: its store holds the player's entity. */
    private world: World;

    /** The server, which a player keeps whichever of its worlds it is in. */
    private readonly server: Server;

    /** What the player's own client is shown while the player is in no store. */
    private readonly detached: DetachedPlayerView;

    /**
     * The client this player speaks through, or null before one has been attached.
     *
     * Null until {@link Player.attachNetworkSession}, because the session cannot be built
     * until the player exists and the player must not build its own: doing that handed a
     * half-constructed `this` to the session's constructor and made the two modules import
     * each other at runtime.
     */
    private networkSession: PlayerSession | null = null;

    /**
     * Timer used for various metrics.
     */
    private timer: Timer;
    private connected = false;

    /** This player as the chat fan-out reaches them, held so `disable` leaves with the same object. */
    private readonly chatRecipient: ChatRecipient;

    public randomId = 0;

    public locale = '';

    public viewDistance = 0;

    /** The XUID the login carried, or an empty string when it carried none. */
    public get xuid(): string {
        return this.store.getXUID() ?? '';
    }

    /** The skin the login carried, which a skin change replaces. */
    public get skin(): Skin | null {
        return this.store.skin;
    }
    public set skin(skin: Skin | null) {
        this.store.skin = skin;
    }

    /** The device the login named, or null when it said nothing. */
    public get device(): Device | null {
        return this.store.device;
    }
    public set device(device: Device | null) {
        this.store.device = device;
    }

    /** The platform chat id, which the login handler does not read yet and leaves empty. */
    public get platformChatId(): string {
        return this.store.platformChatId;
    }

    /** The game mode, a logged component field of the store player that its systems read. */
    public get gamemode(): Gametype {
        return this.store.gamemode;
    }
    public set gamemode(gamemode: Gametype) {
        this.store.gamemode = gamemode;
    }

    /**
     * Vitals, experience, abilities, movement flags, the spawn point and an item use in progress,
     * each written through a setter the change log hears. The store player keeps them.
     */
    private get components(): PlayerComponents {
        return this.store.getComponents();
    }

    private get flying(): boolean {
        return this.components.get('abilities.flying');
    }
    private set flying(flying: boolean) {
        this.components.set('abilities.flying', flying);
    }
    private get sleeping(): boolean {
        return this.components.get('movement.sleeping');
    }
    private set sleeping(sleeping: boolean) {
        this.components.set('movement.sleeping', sleeping);
    }

    /**
     * Where this player was placed on joining, or null when they came back to a saved position;
     * see {@link PlayerSession.getJoinSpawn}.
     */
    public getJoinSpawn(): PlayerSpawn | null {
        return this.getNetworkSession().getJoinSpawn();
    }

    /** The block this player is mining, whose cracks are animated every tick; null when none. */
    private get mining(): BlockMining | null {
        const mining = this.components.get('mining.block');
        return mining === null ? null : blockMiningOf(mining);
    }
    private set mining(mining: BlockMining | null) {
        this.components.set('mining.block', mining === null ? null : playerMiningOf(mining));
    }

    /** The block this player is mining, or null. */
    public getMining(): BlockMining | null {
        return this.mining;
    }

    /**
     * Sets what this player is mining, whose cracks the player systems animate every tick.
     * @param {BlockMining | null} mining - The block, or null when the player stopped or broke it.
     */
    public setMining(mining: BlockMining | null): void {
        this.runtime().setPlayerMining(this.store, mining === null ? null : playerMiningOf(mining));
    }

    /**
     * Stops the cracks on the block this player was mining, if any, and forgets it.
     *
     * For whatever ends the mining without the client saying so: a disconnect, a change of game
     * mode or of world. A death is the player systems', inside the blow. Left alone, the cracks
     * would go out every tick for good.
     */
    public async stopMining(): Promise<void> {
        const mining = this.mining;
        if (mining === null) return;

        this.mining = null;
        await this.getWorld().stopBlockCracking(mining.position);
    }

    /**
     * Where this player comes back after a death, or undefined for the world spawn.
     *
     * Set by `/spawnpoint`, by sleeping in a bed and by using a respawn anchor, and carried
     * across a logout on the player record. See {@link Player.getRespawnPoint} for when a
     * stored point stops being used.
     */
    private get spawnPoint(): StoredSpawnPoint | undefined {
        return this.components.get('respawn.spawnPoint') ?? undefined;
    }
    private set spawnPoint(spawn: StoredSpawnPoint | undefined) {
        this.components.set('respawn.spawnPoint', spawn ?? null);
    }

    /**
     * Whether this player has watched the end credits, Java's `seenCredits` and Bedrock's
     * `HasSeenCredits`.
     *
     * Set when the credits start on a first exit through the End's portal and kept on the
     * player record, so every later exit transfers at once.
     */
    private get seenCredits(): boolean {
        return this.components.get('respawn.seenCredits');
    }
    private set seenCredits(seen: boolean) {
        this.components.set('respawn.seenCredits', seen);
    }

    /**
     * Player's constructor.
     *
     * @remarks Inert on purpose. It assigns fields and nothing else: no session is built, no
     * listener is registered and nothing server-wide is told this player exists. A player
     * that is constructed and then rejected - by online-mode or by a ban - therefore leaves
     * nothing behind, which is what the chat listener and the chunk scheduler entry used to
     * do when both were claimed here and released only in {@link Player.disable}. Its store
     * player draws its entity id here, and enters a store only at `SetLocalPlayerAsInitialized`.
     * @param {object} options - The player options.
     * @param {Position} options.position - Where the player's eyes are, and in which world.
     * @param {InetAddress} options.address - The address the client connected from.
     * @param {PlayerIdentity} options.identity - Who the login handshake said this is.
     */
    public constructor({
        position,
        address,
        identity
    }: {
        position: Position;
        address: InetAddress;
        identity: PlayerIdentity;
    }) {
        this.store = new StorePlayer(entityIds.next(), {
            uuid: identity.uuid,
            name: identity.name,
            xuid: identity.xuid
        });
        this.store.skin = identity.skin;
        this.store.device = identity.device;
        this.store.standAt({ x: position.getX(), y: position.getY() - EYE_HEIGHT, z: position.getZ() });
        this.world = position.getWorld();
        this.server = this.world.getServer();
        this.detached = new DetachedPlayerView(this.store, { box: () => this.getBox(), isOp: () => this.isOp() });

        this.timer = new Timer();

        this.address = address;
        this.randomId = identity.randomId;
        this.locale = identity.locale;

        // Built once and kept, because the fan-out only lets the recipient that joined leave.
        this.chatRecipient = chatRecipientOf(
            {
                runtimeId: this.getRuntimeId(),
                identity: { name: identity.name, xuid: identity.xuid, uuid: identity.uuid.toString() }
            },
            this.server
        );
    }

    /**
     * The store player this player is: its entity while it is in a store, and the rest beside it.
     */
    public getStorePlayer(): StorePlayer {
        return this.store;
    }

    /**
     * The player's entity and its runtime while the entity is in the store of the player's world,
     * or undefined from the login to its spawn and between two worlds.
     */
    private placed(): { readonly live: LiveEntityRuntime; readonly entity: DataEntity } | undefined {
        if (this.store.entity === undefined) return undefined;
        const live = this.world.dataEntities();
        const entity = live.runtime.entityOfPlayer(this.store);
        return entity === undefined ? undefined : { live, entity };
    }

    /**
     * The entity runtime of the player's world, whose player inputs write what the client reports:
     * through its player systems while the player is in its store, and onto the store player's
     * components while it is in none.
     */
    private runtime(): EntityRuntime {
        return this.world.dataEntities().runtime;
    }

    /**
     * Gives this player the client it speaks through. Called once, by the composition helper
     * that builds the pair - see `createConnectedPlayer`.
     * @param {PlayerSession} session - The session built for this player.
     */
    public attachNetworkSession(session: PlayerSession): void {
        assert(this.networkSession === null, 'Player already has a network session');
        this.networkSession = session;
    }

    /**
     * On enable hook: loads what the server knows about this player and marks them connected.
     *
     * @remarks Sends nothing. This runs from `LoginHandler`, before the client has been told
     * its login succeeded, and a retail client at protocol 2193 that is handed game packets in
     * that state drops the connection with `InitialConnection-90` (bad packet). It used to send
     * the gamemode, adventure settings and abilities from here, and a `MovePlayer` for every
     * other player in the world - the first three now go out from the join burst after
     * `StartGame`, and the last was never needed: `AddPlayer` carries each player's position
     * when they come into view.
     * @group Lifecycle
     */
    public async enable(): Promise<void> {
        // The world of the dimension the record was written in, which is not always the one
        // the login built them in: a player who logged out of the nether used to come back in
        // the default world. Moved before anything reads the record, and without a packet:
        // nothing has been told where this player is yet. The level builds the world when its
        // stem is lazy and nobody has been there since the boot.
        const record = await lastPlayerRecord(this, this.getWorld().getLevel());
        this.world = record.world;

        const playerData = record.data;

        // Before anything can be earned, so a returning player keeps what they
        // had rather than earning their first advancement twice.
        loadAdvancements(this, playerData.advancements);
        enchantmentSeedOf(this, playerData.enchantmentSeed);

        // Onto the store player while it is in no store, so the load logs nothing.
        applyPlayerRecord(
            this.store,
            playerData,
            this.getServer().getConfig().getGamemode(),
            this.getServer().getContent()
        );

        // A returning player goes back where they were; a new one is placed the way BDS
        // places them, which may not be the spawn point itself.
        const recorded = recordedPosition(playerData);
        let position: Vector3;
        if (recorded) {
            this.getNetworkSession().setJoinSpawn(null);
            position = Vector3.fromObject(recorded);
        } else {
            const placed = await this.getWorld().placePlayerSpawn();
            this.getNetworkSession().setJoinSpawn(placed);
            position = eyePositionAt(placed.position);
        }

        // Not broadcast: `StartGame` carries the position, so the client has no use for a
        // `MovePlayer` here. Awaited, where it was not, because the move this used to send went
        // out after `PlayStatus(LoginSuccess)` had already been written.
        await this.setPlayerPosition(
            {
                position,
                pitch: recorded?.pitch ?? 0,
                yaw: recorded?.yaw ?? 0,
                headYaw: recorded?.headYaw ?? 0,
                type: PositionMode.Respawn
            },
            false
        );

        // Joined here rather than in the constructor, and only once the rest has succeeded: a
        // player whose join failed part way through would otherwise stay in the fan-out for the
        // life of the process, because the connection has no session to reach `disable` through
        // until the join completes.
        this.getServer().getChatManager().join(this.chatRecipient);

        // Finally mark the player as connected.
        this.getServer().getLogger().debug(`(Complete player creation took ${this.timer.stop()} ms)`);
        this.connected = true;
    }

    /**
     * Writes health without the death path, which is how a record puts it back: restoring a
     * player who logged out on half a heart would otherwise announce a death they already had.
     * Nothing is sent; the join burst sends the attributes once the client is ready for them.
     * @param health - The health to hold.
     */
    public restoreHealth(health: number): void {
        this.store.restoreHealth(health);
    }

    /**
     * Writes the flying flag without asking the client or raising an event, which is how a
     * record puts it back before the client has been told its login succeeded.
     * @param flying - Whether the player is flying.
     */
    public restoreFlying(flying: boolean): void {
        this.flying = flying;
    }

    /**
     * On disable hook.
     *
     * @remarks Idempotent, and paired with {@link Player.enable}: everything enable claimed
     * is released here and nothing else is. Taking the session out of the chunk scheduler is
     * the session's own business - see `PlayerSession.disable` - so that a player and its
     * client are torn down by whoever owns each.
     * @group Lifecycle
     */
    public async disable(): Promise<void> {
        // A player that never finished joining has nothing to take down: it was never added
        // to a world, never put in the player list, and announcing its departure would name
        // somebody who never arrived. `enable` is also what joins the chat fan-out, so there
        // is nothing to leave either.
        if (!this.connected) return;

        await this.stopMining();

        // Whether or not they have an XUID. An offline player has none by construction, this
        // server accepts offline players, and `keyOfPlayer` already falls back to the
        // name for them - so the guard that used to be here threw away the inventory of every
        // player on a server with online mode off.
        await this.getWorld().savePlayerData(this);
        await this.getWorld().removePlayer(this);
        this.getServer().getStorePlayers().delete(this.store.id);

        // `removePlayer` above already told everyone who could see this player to take them
        // away, world-scoped and only the clients that actually had them. The loop that used
        // to be here went over every player on the server, in every world, and included the
        // leaving player itself.
        await this.getNetworkSession().removeFromPlayerList();

        // Announce disconnection. The leaving player is still in the fan-out here, as it was
        // still subscribed when this went through the event alone.
        const chat = this.getServer().getChatManager();
        await chat.send(
            new Chat({
                sender: this.getServer().getConsoleSender(),
                // The bare translation key, for the reason given in ResourcePackClientResponseHandler.
                message: `%multiplayer.player.left`,
                parameters: [this.getName()],
                needsTranslation: true,
                type: ChatType.TRANSLATION
            })
        );

        this.connected = false;
        chat.leave(this.chatRecipient);
    }

    /** Queues the chunks around this player that a join starts with; see {@link PlayerSession.sendInitialSpawnChunks}. */
    public async sendInitialSpawnChunks(): Promise<void> {
        await this.getNetworkSession().sendInitialSpawnChunks();
    }

    /**
     * Moves the player to another world, arriving at that world's spawn.
     *
     * The stored spawn is the block under a joining player's feet, so the feet go one block
     * above it, centered, as {@link requestedSpawnPosition} says before the terrain is
     * consulted. The sequence lives in {@link PlayerSession.changeWorld}; this is the entry
     * point for callers that have a world and no arrival of their own, such as a teleport
     * between worlds, which moves the player again once the change completes.
     * @param {World} world - the new world
     */
    public async setWorld(world: World): Promise<void> {
        return this.getNetworkSession().changeWorld({
            world,
            position: requestedSpawnPosition(await world.getSpawnPosition()),
            yaw: this.yaw,
            pitch: this.pitch
        });
    }

    public isOnline(): boolean {
        return this.connected;
    }

    /**
     * Runs one tick of this player while it is in a store: its actor's, as an entity, and then
     * its own; see {@link StorePlayerActor.update}.
     * @param tick - The current world-tick.
     */
    public async update(tick: number): Promise<void> {
        const actor = this.getActor();
        if (actor === undefined) await this.updatePlayer(tick);
        else await actor.update(tick);
    }

    /**
     * This player's own part of a tick, which its actor runs after the entity's part: the
     * session, the attribute sync and the triggers. Breath, hunger, a meal, the void and the
     * mining cracks are the store's, in its entity pass.
     * @param tick - The current world-tick.
     * @internal
     */
    public async updatePlayer(tick: number): Promise<void> {
        await this.getNetworkSession().update(tick);

        // Anything that moved an attribute this tick - hunger, most of the time - goes out
        // here, as a single packet holding just what changed. The health is the entity's, so it
        // is copied into the client's table first.
        this.showOwnHealth();
        await this.getNetworkSession().syncAttributes();

        // Every second, which is Java's own period for this pair. The
        // `location` conditions are about where the player is standing rather
        // than about anything that happened, so there is nothing else to hang
        // the 67 vanilla criteria that use them on.
        if (tick % ADVANCEMENT_CHECK_TICKS === 0) advancementPlayerTick(this);

        // TODO: get documentation about timings from vanilla
        // 1 second / 20 = 1 tick, 20 * 5 = 1 second
        // 1 second * 60 = 1 minute
        if (tick % (20 * 5 * 60 * 1) === 0) {
            await this.getNetworkSession().sendTime(tick);
        }
    }

    /**
     * Removes the player from the server and tells the client why.
     *
     * @remarks Torn down through the connection rather than by calling `disable` directly, so
     * that the player and its session are released together and exactly once, and so the
     * RakNet session is hung up on rather than left for the client to close.
     *
     * That last part used to be left out: a kick sent the `DisconnectPacket` and stopped
     * there, on the assumption the client would hang up on seeing it. A vanilla client does.
     * Anything that does not - the bot harness, which after the login sequence has nobody
     * subscribed to the packet, and which keeps pinging - held its slot and its place in the
     * player count for as long as the process ran, because the pings kept the session from
     * ever timing out.
     * @param {string} [reason='unknown reason'] - Shown to the client.
     * @param {DisconnectReason} [code=DisconnectReason.KICKED] - The code the client shows
     * beside the reason. `Server.shutdown` passes `SHUTDOWN`.
     */
    public async kick(reason = 'unknown reason', code: DisconnectReason = DisconnectReason.KICKED): Promise<void> {
        await this.getNetworkSession().getConnection().disconnect(reason, false, code);
        this.getServer().getLogger().verbose(`Player with id §b${this.getRuntimeId()}§r was kicked: ${reason}`);
    }

    /**
     * Sends this player's gamemode, adventure settings and abilities where each belongs; see
     * {@link PlayerSession.announceSettings}.
     */
    public async sendSettings(): Promise<void> {
        await this.getNetworkSession().announceSettings();
    }

    /** Finishes bringing this player into the game; see {@link PlayerSession.completeSpawn}. */
    public async completeSpawn(): Promise<void> {
        await this.getNetworkSession().completeSpawn();
    }

    /**
     * Sends a line of text to this player's client.
     *
     * `type` picks how the client renders it. A JSON text object goes as `TextPacketType.TextObject`;
     * a translation key with its parameters as `TextPacketType.Translate`.
     * @param message - The text, or the translation key for a translated type.
     * @param type - How the client renders the message. Raw by default.
     * @param parameters - The values a translated type fills its key with.
     * @param needsTranslation - Whether the client should translate the message.
     */
    public async sendMessage(
        message: string,
        type: TextPacketType = TextPacketType.Raw,
        parameters: string[] = [],
        needsTranslation = false
    ): Promise<void> {
        await this.getNetworkSession().sendMessage({
            message,
            parameters,
            needsTranslation,
            type
        });
    }

    public async setGamemode(mode?: Gametype): Promise<void> {
        mode ??= this.gamemode;

        const event = new PlayerSetGamemodeEvent(this, mode);
        this.getServer().post(['playerSetGamemode', event]);
        if (event.isCanceled()) return;

        // A new game mode changes how, or whether, the player breaks blocks, so the mining in
        // progress does not carry over into it.
        if (event.getGamemode() !== this.gamemode) await this.stopMining();

        // A logged component field, which the store's player systems and the actor read.
        this.runtime().setPlayerGamemode(this.store, event.getGamemode());
        await this.getNetworkSession().sendGameTypeChange();
        if (!mayFlyIn(this.gamemode)) await this.setFlying(false);
        await this.getNetworkSession().sendAbilityChange();
    }

    /**
     * The player's actor while its entity is in the store of its world: what entity code is handed
     * in the player's place, such as a blow's attacker, the portal touch and the entity events.
     * Undefined from the login to the spawn and between two worlds, when nothing can reach the
     * player.
     */
    public getActor(): StorePlayerActor | undefined {
        const placed = this.placed();
        const actor = placed?.live.actors.actorOf(placed.entity.id);
        return actor instanceof StorePlayerActor ? actor : undefined;
    }

    /**
     * The player as clients are shown it: its actor while it is in a store, and otherwise what
     * its own client is shown of it before its spawn and between two worlds.
     */
    public getBody(): ShownPlayer {
        return this.getActor() ?? this.detached;
    }

    /** The id of this player's entity, which its session and every entity query know it by. */
    public getRuntimeId(): bigint {
        return BigInt(this.store.id);
    }

    /** The type of this player's entity, `minecraft:player`. */
    public getType(): string {
        return PLAYER_IDENTIFIER;
    }

    /** Where this player is, which is their eyes, as the client reports it. */
    public getPosition(): Position {
        return Position.fromVector3(this.store.getPosition(), this.world);
    }

    /** The world this player is in. */
    public getWorld(): World {
        return this.world;
    }

    /** The server this player is on. */
    public getServer(): Server {
        return this.server;
    }

    /** What this player carries. */
    public getInventory(): HumanInventory {
        return this.store.getInventory();
    }

    /** What is sitting in this player's crafting slots. */
    public getCraftingInput(): CraftingInput {
        return this.store.getCraftingInput();
    }

    /** This player's entity metadata, which their own client and every viewer are sent. */
    public get metadata(): Metadata {
        return this.getBody().metadata;
    }

    /** The client's attribute table: food, experience and the rest, and a copy of the health. */
    public get attributes(): Attributes {
        return this.store.attributes;
    }

    public get pitch(): number {
        return this.store.pitch;
    }

    public get yaw(): number {
        return this.store.yaw;
    }

    public get headYaw(): number {
        return this.store.headYaw;
    }

    /** The box the player's body takes up, from the type's collision box. */
    public getBox(): EntityBox {
        return boxOf(this.getServer().getContent().entities.registry, PLAYER_IDENTIFIER);
    }

    /** The player's health, in half-hearts. */
    public getHealth(): number {
        return this.store.getHealth();
    }

    /** The player's maximum health. */
    public getMaxHealth(): number {
        return this.store.getMaxHealth();
    }

    /** Whether the player is alive. */
    public isAlive(): boolean {
        return this.getHealth() > 0;
    }

    /**
     * Sets the player's health. A lower health in a store is a blow for the difference through
     * the store's damage pipeline, and a higher one a heal; in no store it is written as it is.
     * @param health - The health to hold.
     * @param source - What did it, when the health went down.
     */
    public async setHealth(health: number, source?: DamageCause | DamageSource): Promise<void> {
        const actor = this.getActor();
        if (actor === undefined) this.store.restoreHealth(health);
        else await actor.setHealth(health, source);
    }

    /**
     * Heals the player, up to their maximum health.
     * @param amount - Half-hearts to restore.
     * @returns Whether any health was restored.
     */
    public async heal(amount: number): Promise<boolean> {
        return (await this.getActor()?.heal(amount)) ?? false;
    }

    /** The bottom of the player's body, the eye height below what they report. */
    public getFeetY(): number {
        return this.getPosition().getY() - EYE_HEIGHT;
    }

    /** What this player wears and holds. */
    public getEquipment(): ViewableEquipment {
        return this.store.getInventory().getEquipment();
    }

    /** The `/tag` tags this player carries, in the order they were added. */
    public getTags(): readonly string[] {
        return this.getActor()?.getTags() ?? this.store.heldEntity.tags;
    }

    /** The status effects on this player. */
    public getStatusEffects(): readonly StatusEffect[] {
        return this.getActor()?.getStatusEffects() ?? this.store.heldEntity.statusEffects;
    }

    /** One status effect on this player, or undefined. */
    public getStatusEffect(identifier: string): StatusEffect | undefined {
        return this.getActor()?.getStatusEffect(identifier);
    }

    /** Gives this player a status effect, which only a player in a store can take. */
    public addStatusEffect(input: StatusEffectInput, notify = true): boolean {
        return this.getActor()?.addStatusEffect(input, notify) ?? false;
    }

    /** Takes a status effect off this player. */
    public removeStatusEffect(identifier: string, notify = true): boolean {
        return this.getActor()?.removeStatusEffect(identifier, notify) ?? false;
    }

    /** Ticks left before this player takes a portal again. */
    public getPortalCooldown(): number {
        return this.store.getPortalCooldown();
    }

    /**
     * Holds this player off portals for a while, by default for a dimension change's cooldown.
     * @param ticks - How long.
     */
    public setPortalCooldown(ticks: number = PORTAL_COOLDOWN_TICKS.player): void {
        this.store.setPortalCooldown(ticks);
    }

    /** How far above the feet the position this player reports is. */
    public getEyeHeight(): number {
        return EYE_HEIGHT;
    }

    public getNetworkSession(): PlayerSession {
        assert(this.networkSession !== null, 'Player has no network session attached');
        return this.networkSession;
    }

    public getAddress(): InetAddress {
        return this.address;
    }

    public getName(): string {
        return this.store.getName();
    }

    public getFormattedUsername(): string {
        return `<${this.getName()}>`;
    }

    /**
     * Get the player's current permissions, read from the permission manager on every call so
     * a revoked operator status or grant applies at once.
     * @returns The player's effective permissions.
     */
    public getPermissions(): string[] {
        return this.server.getPermissionManager().permissionsOf(this);
    }

    /**
     * Get the XUID of the player.
     * @returns {string | null} XUID of the player or null if not available
     */
    public getXUID(): string | null {
        return this.store.getXUID();
    }

    /**
     * Get the identity the client logged in with.
     * @returns {UUID} The player's UUID.
     * @example
     * ```typescript
     * console.log(player.getUUID().toString());
     * ```
     */
    public getUUID(): UUID {
        return this.store.getUUID();
    }

    /**
     * Check if the `Player` is an operator.
     * @returns `true` if this player is an operator otherwise `false`.
     */
    public isOp(): boolean {
        return this.getServer().getPermissionManager().isOp(this.getUUID().toString());
    }

    /**
     * What happens when the player runs out of health, which the store's damage pipeline calls
     * inside the blow that killed them, after the player systems ended the drowning and the
     * mining and after the `entityDeath` event and the kill triggers.
     *
     * The client puts up its own death screen as soon as health reaches zero, so the work
     * here is telling everyone else and waiting: the player stays dead, in the store, until
     * they ask to come back, which arrives as a `RESPAWN` player action.
     * @param {DamageSource} source - What killed them, and who is answerable for it.
     * @internal
     */
    public async die(source: DamageSource): Promise<void> {
        const actor = this.getActor();
        if (actor === undefined) return;

        // The bare translation key, as with the join and leave messages: the client renders
        // it in its own language. Which key it is depends on whether anybody is to blame - see
        // `DeathMessages`.
        const message = deathMessage(actor, source);
        const { key, parameters } = message;

        // Where they will come back. The client will not offer the respawn button until it
        // knows, which is why a death screen that never became a respawn screen was stuck on
        // "Respawning". The search may load chunks or build a dimension, so the death files it
        // before its first wait and the next input step sends the death screen
        // (`world/RespawnRequests.ts`), unless the player came back or left before then.
        this.getServer()
            .getRespawnRequests()
            .request(this.getWorld().getLevel().getRespawnSearch().find(this.respawnRequest()), async (answer) => {
                if (this.isAlive() || !this.isOnline()) return;
                await this.forgetLostSpawnPoint(answer);
                await this.getNetworkSession().sendDeathScreen(Vector3.fromObject(answer.announced), message);
            });

        this.showOwnHealth();
        await this.getNetworkSession().sendAttributes();
        await this.getWorld().sendActorEvent(actor, ActorEvent.DEATH_ANIMATION);

        await this.getServer()
            .getChatManager()
            .send(
                new Chat({
                    sender: this.getServer().getConsoleSender(),
                    message: key,
                    parameters,
                    needsTranslation: true,
                    type: ChatType.TRANSLATION
                })
            );
    }

    /**
     * Copies the entity's health into the client's attribute table, which the player's own
     * client is sent, so a change goes out with the next attribute sync.
     */
    private showOwnHealth(): void {
        this.store.attributes.setValue(AttributeIds.Health, this.getHealth());
    }

    /**
     * This player's experience, as the level and the bar the client is sent, written through
     * setters the change log hears.
     */
    public getExperience(): ExperienceHolder {
        return this.components.experience();
    }

    /** This player's component fields as plain data. */
    public componentSnapshot(): PlainRecord {
        return this.components.snapshot();
    }

    /** Sets an attribute, through the component field it is kept in when it has one, so the write is logged. */
    public setAttributeValue(name: string, value: number): boolean {
        const before = this.attributes.getValue(name);
        if (!this.components.setAttribute(name, value)) return this.attributes.setValue(name, value);
        return this.attributes.getValue(name) !== before;
    }

    /** This player's own spawn point, or undefined when they come back at the world spawn. */
    public getSpawnPoint(): StoredSpawnPoint | undefined {
        return this.spawnPoint;
    }

    /**
     * Moves this player's own spawn point, or clears it back to the world spawn.
     *
     * @param spawn - The block that holds it, or undefined to go back to the world spawn.
     */
    public setSpawnPoint(spawn: StoredSpawnPoint | undefined): void {
        this.spawnPoint = spawn;
    }

    /** Whether this player has watched the end credits, so a later End exit skips them. */
    public hasSeenCredits(): boolean {
        return this.seenCredits;
    }

    /**
     * Records whether this player has watched the end credits.
     *
     * Set when the credits start rather than when they finish, as Java's `showEndCredits`
     * does: a client that disconnects mid-credits comes back in the End with the flag kept,
     * and its next exit transfers without a replay.
     * @param seen - False puts the credits back on the next End exit.
     */
    public setSeenCredits(seen: boolean): void {
        this.seenCredits = seen;
    }

    /**
     * Where this player comes back after a death, given as a Bedrock Dedicated Server gives it.
     *
     * Their own spawn point when they have one that still holds, in the world it was set in,
     * which need not be the one they died in: a player who dies in the Nether with an Overworld
     * bed comes back in the Overworld, as Java's `findRespawnPositionAndUseSpawnBlock` has it.
     * Otherwise the Overworld spawn of the default level, which is Java's `server.overworld()`.
     * A bed or a respawn anchor only holds a spawn while the block is still there with somewhere
     * free to stand beside it, and a point `/spawnpoint` set is used whatever is standing there.
     * The level's {@link RespawnSearch} answers the question from plain data. A spawn that
     * stopped holding is cleared here, so the player is told once rather than on every death.
     *
     * The caller compares `world` with the player's own and changes world first when they
     * differ: see `RespawnHandler`.
     *
     * @see {@link respawnPoint} for the three positions the exchange needs.
     */
    public async getRespawnPoint(): Promise<RespawnDestination> {
        const level = this.getWorld().getLevel();
        const answer = await level.getRespawnSearch().find(this.respawnRequest());
        await this.forgetLostSpawnPoint(answer);

        return {
            world:
                answer.spawn === 'own'
                    ? await level.world(answer.dimension)
                    : this.getServer().getWorldManager().getDefaultWorld(),
            announced: Vector3.fromObject(answer.announced),
            block: Vector3.fromObject(answer.block),
            eyes: Vector3.fromObject(answer.eyes)
        };
    }

    /**
     * Clears a spawn point the search found no longer holds, and tells the player once.
     *
     * Java's "Your home bed was missing or obstructed", which is a message this server has no
     * translation path for yet. Cleared so the next death goes straight to the world spawn rather
     * than walking the bed's neighbors again.
     */
    private async forgetLostSpawnPoint(answer: RespawnAnswer): Promise<void> {
        if (!answer.spawnPointLost) return;

        this.spawnPoint = undefined;
        await this.getNetworkSession().sendMessage({
            message: 'tile.bed.notValid',
            type: TextPacketType.Translate,
            needsTranslation: true
        });
    }

    /** What the level's respawn search is asked for this player; see {@link RespawnSearch}. */
    private respawnRequest(): RespawnRequest {
        const { width, height } = this.getBox();
        return {
            player: keyOfPlayer(this),
            spawnPoint: this.spawnPoint,
            body: { width, height, eyeHeight: this.getEyeHeight() }
        };
    }

    /**
     * Brings the player back after a death, at the world spawn and in one piece.
     *
     * @remarks Called when the client asks, not when the player dies - the death screen is
     * the client's, and it decides how long it stays up. The client reports
     * `ClientReadyToSpawn` before it sends this, and has already put itself where the answer
     * to that said: see `RespawnHandler`.
     */
    public async respawn(): Promise<void> {
        // A player the server does not consider dead is put back where they already are, and
        // keeps everything. The answer still goes out: the client repeats the request once a
        // second until it gets one, and silence is what leaves it on the death screen.
        if (!this.isAlive()) {
            // The entity never left the store: the revival brings it back with the same id at
            // full health, and the player systems reset the attributes, the lungs and the movement
            // flags. Each write is logged.
            this.runtime().revivePlayer(this.store);
            this.showOwnHealth();
            // Full lungs and no sprint, in the metadata the respawned client is sent.
            this.getActor()?.showPlayerState();

            // Where the `ReadyToSpawn` put the client, and without a `MovePlayer`: a Bedrock
            // Dedicated Server sends none here, and the client is already there.
            await this.setPlayerPosition(
                { position: (await this.getRespawnPoint()).eyes, type: PositionMode.Respawn },
                false
            );
        }

        await this.getNetworkSession().sendRespawned();
        await this.getNetworkSession().releaseChangeHeldOverDeath();
    }

    /**
     * Hurts the player through the store's damage pipeline, whose `game_mode` guard keeps a
     * creative or spectator player out of reach. A player in no store cannot be hurt.
     * @param {number} amount - Half-hearts of damage.
     * @param {DamageCause | DamageSource} [source=DamageCause.Generic] - What did it, and who.
     * @returns {Promise<boolean>} `true` if any damage was actually taken.
     */
    public async damage(amount: number, source: DamageCause | DamageSource = DamageCause.Generic): Promise<boolean> {
        return (await this.getActor()?.damage(amount, source)) ?? false;
    }

    /**
     * Asks the client to apply a world-space impulse, including nonstandard vertical lift.
     *
     * The client owns a player's movement (ADR 0008), so the store logs the shove as an `impulse`
     * occurrence and sends it to the client, and the player's state is unchanged until the client
     * reports where it took them.
     */
    public applyImpulse(impulse: EntityPosition): void {
        if (!this.connected) return;
        this.getActor()?.applyImpulse(impulse);
    }

    /**
     * Whether the world can hurt this player at all.
     *
     * Creative and spectator players do not drown, starve or take damage in vanilla, which
     * is one condition and not three.
     * @returns {boolean} `true` if the player can be harmed.
     */
    public isVulnerable(): boolean {
        return survivalReaches(this.gamemode);
    }

    /**
     * Whether the player's actions cost food at all.
     *
     * Creative and spectator players are fed by definition in vanilla, and draining their
     * bar would only show up as a client-side flicker: the bar is not even drawn for them.
     * @returns {boolean} `true` if hunger applies to this player.
     */
    public consumesFood(): boolean {
        return this.isVulnerable();
    }

    /**
     * The player's food level, out of 20 - two per drumstick on the client's bar.
     * @returns {number} The food level.
     */
    public getFood(): number {
        return this.components.get('vitals.food');
    }

    /**
     * Set the player's food level. Clamped to `0..20`, and sent on the next tick.
     * @param {number} food - The wanted food level.
     */
    public setFood(food: number): void {
        this.components.set('vitals.food', food);
    }

    /**
     * The player's saturation - the hidden buffer that is spent before food is.
     * @returns {number} The saturation level.
     */
    public getSaturation(): number {
        return this.components.get('vitals.saturation');
    }

    /**
     * Set the player's saturation. Saturation never exceeds the current food level in
     * vanilla, so it is capped there as well as at the attribute's own maximum.
     * @param {number} saturation - The wanted saturation.
     */
    public setSaturation(saturation: number): void {
        setSaturation(this.components, saturation);
    }

    /**
     * Feed the player, as eating does.
     * @param {number} food - Food points to restore.
     * @param {number} [saturation=0] - Saturation points to restore.
     */
    public addFood(food: number, saturation = 0): void {
        addFood(this.components, food, saturation);
    }

    /**
     * Make the player hungrier, through the store's player systems.
     *
     * Exhaustion is a counter, not something the player has: every four points spend one
     * point of saturation, or - once saturation is gone - one point of food. Everything that
     * costs hunger in vanilla (moving, jumping, attacking, healing) does it through here.
     * @param {number} amount - Exhaustion to add.
     * @example
     * ```typescript
     * player.addExhaustion(0.1); // one meter sprinted
     * ```
     */
    public addExhaustion(amount: number): void {
        this.runtime().exhaustPlayer(this.store, amount);
    }

    /**
     * Charges the player for a jump. Sprint-jumping is what actually empties a food bar in
     * vanilla, at four times the cost of a standing jump.
     */
    public addJumpExhaustion(): void {
        this.runtime().playerJumped(this.store);
    }

    /** Whether the client last reported the player sprinting. */
    public isSprinting(): boolean {
        return this.components.get('movement.sprinting');
    }

    public async setSprinting(sprinting: boolean): Promise<void> {
        if (sprinting === this.isSprinting()) return;

        const event = new PlayerToggleSprintEvent(this, sprinting);
        this.getServer().post(['playerToggleSprint', event]);
        if (event.isCanceled()) return;

        // `StoreActors.sync` shows the change to the player and its viewers.
        this.runtime().setPlayerSprinting(this.store, event.getIsSprinting());
    }

    public isFlying(): boolean {
        return this.flying;
    }
    public async setFlying(flying: boolean): Promise<void> {
        if (flying === this.isFlying()) return;

        if (!mayFlyIn(this.gamemode)) {
            this.runtime().setPlayerFlying(this.store, false);
            await this.sendSettings();
            return;
        }

        const event = new PlayerToggleFlightEvent(this, flying);
        this.getServer().post(['playerToggleFlight', event]);
        if (event.isCanceled()) return;

        this.runtime().setPlayerFlying(this.store, event.getIsFlying());
        await this.sendSettings();
    }

    public isSneaking(): boolean {
        return this.components.get('movement.sneaking');
    }
    public async setSneaking(sneaking: boolean): Promise<void> {
        if (sneaking === this.isSneaking()) return;
        this.runtime().setPlayerSneaking(this.store, sneaking);
    }

    /** Whether the client has reported this player asleep in a bed. */
    public isSleeping(): boolean {
        return this.sleeping;
    }

    /** Records the client's bed-sleeping action for entity filters and goals. */
    public setSleeping(sleeping: boolean): void {
        this.sleeping = sleeping;
    }

    /** Whether the client last reported the player on the ground: its body's `on_ground` condition. */
    public isOnGround(): boolean {
        return this.store.isOnGround();
    }

    /**
     * Records whether the client reports the player on the ground, as a move to where the player
     * already is: the store pays for a fall the moment it lands.
     */
    public async setOnGround(onGround: boolean): Promise<void> {
        const placed = this.placed();
        if (placed === undefined || onGround === this.isOnGround()) return;
        const { entity } = placed;
        moveStorePlayer(placed.live.runtime, this.store, {
            position: { ...entity.position },
            yaw: entity.body.yaw,
            pitch: entity.body.pitch,
            onGround,
            headYaw: this.store.headYaw
        });
    }

    /**
     * Notes that the player has started eating or drinking what is in their hand. The player
     * systems count the meal out on the store's tick and finish it once its time is up.
     * @param {number} _tick - The server tick it began on, which the store's own tick replaces.
     * @param {number} ticks - How long the meal takes.
     */
    public beginConsuming(_tick: number, ticks: number): void {
        this.runtime().beginPlayerMeal(this.store, ticks);
    }

    /** Forgets an unfinished meal, as letting go of the button or putting the item away does. */
    public cancelConsuming(): void {
        this.runtime().cancelPlayerMeal(this.store);
    }

    /**
     * The tick a held-item use began on, or null if nothing is being drawn.
     *
     * Bedrock does not tell the server how long a bow was drawn for - it says "started" and later
     * "released", and the time between them is the charge. So it has to be measured here.
     */
    private get itemUseStartedAt(): number | null {
        return this.components.get('itemUse.startedAt');
    }
    private set itemUseStartedAt(tick: number | null) {
        this.components.set('itemUse.startedAt', tick);
    }

    /**
     * Notes that the player has started holding an item down.
     * @param {number} tick - The server tick it began on.
     */
    public beginItemUse(tick: number): void {
        this.itemUseStartedAt = tick;
    }

    /**
     * How long the current use has lasted, in ticks, and forgets it.
     * @param {number} tick - The server tick it ended on.
     * @returns {number} Ticks held, or zero if nothing was being held.
     */
    public takeItemUseTicks(tick: number): number {
        const started = this.itemUseStartedAt;
        this.itemUseStartedAt = null;

        return started === null ? 0 : Math.max(0, tick - started);
    }

    /**
     * How far the player has fallen since they were last supported.
     *
     * Read by the combat code: a blow struck on the way down is a critical, and "on the way down"
     * means this is above zero rather than merely that the player is off the ground - a player
     * rising through a jump is not falling, and vanilla does not let them crit on the way up.
     * @returns {number} Blocks fallen so far, or zero.
     */
    public getFallDistance(): number {
        return this.components.get('vitals.fallDistance');
    }

    /**
     * Moves the player as an {@link Entity} move, which for a player is always a teleport.
     *
     * The client owns a player's movement (ADR 0008), so a move the server makes is a request
     * the client has to acknowledge, and the positions it reports until then are dropped
     * (`PlayerSession.holdsMovementForTeleport`). A `Normal` move would ask for no acknowledgment,
     * and the next stale report would put the player back.
     * @param {EntityPositionOptions} options - The position and rotation; `teleport` is ignored.
     * @returns {Promise<void>} A promise that resolves when the player's client has been told.
     * @remarks {@link Player.setPlayerPosition} takes the movement mode and the broadcast choice.
     */
    public async setPosition({ teleport: _teleport, ...options }: EntityPositionOptions): Promise<void> {
        await this.setPlayerPosition({ ...options, type: PositionMode.Teleport });
    }

    /**
     * Set the position with a movement mode.
     * @param {object} options - The options to set the position.
     * @param {Vector3} options.position - The new position.
     * @param {PositionMode} [options.type=PositionMode.Normal] - The position mode.
     * @param {number} [options.pitch=this.pitch] - The new pitch.
     * @param {number} [options.yaw=this.yaw] - The new yaw.
     * @param {number} [options.headYaw=this.headYaw] - The new head yaw.
     * @param {boolean} [broadcast=true] - Whether to tell the player's own client.
     * @returns {Promise<void>} A promise that resolves when the position is set.
     * @remarks Observers snap to a respawn or a teleport instead of interpolating to it.
     */
    public async setPlayerPosition(
        {
            position,
            type = PositionMode.Normal,
            pitch = this.pitch,
            yaw = this.yaw,
            headYaw = this.headYaw
        }: {
            position: Vector3;
            type?: PositionMode;
            pitch?: number;
            yaw?: number;
            headYaw?: number;
        },
        broadcast = true
    ): Promise<void> {
        const feet = { x: position.getX(), y: position.getY() - EYE_HEIGHT, z: position.getZ() };
        const placed = this.placed();
        if (placed === undefined) {
            // In no store: the player holds where it is, and a position in another world is the
            // world it enters next, as a dimension change places it before its arrival.
            if (position instanceof Position) this.world = position.getWorld();
            this.store.placeAt({ x: feet.x, y: position.getY(), z: feet.z, yaw, pitch, headYaw });
        } else if (type === PositionMode.Normal) {
            // The client's own move, which the store charges for and adds to the fall in progress.
            moveStorePlayer(placed.live.runtime, this.store, {
                position: feet,
                yaw,
                pitch,
                onGround: this.isOnGround(),
                headYaw
            });
        } else {
            // A reset or a teleport is not the player walking, so it costs nothing - and it must not
            // count as a fall either, or arriving anywhere below where you left would hurt.
            const { body } = placed.entity;
            body.yaw = yaw;
            body.pitch = pitch;
            this.store.headYaw = headYaw;
            placed.live.runtime.teleportPlayer(placed.entity.id, feet);
        }

        // Every move goes to the clients that see the player, a head turn included, which the
        // actor's own pose comparison leaves out.
        const actor = this.getActor();
        if (actor !== undefined)
            await this.getWorld().broadcastMove(actor, type === PositionMode.Teleport || type === PositionMode.Respawn);

        if (!broadcast) return;
        await this.getNetworkSession().sendMove(this.getBody(), type);
    }
}

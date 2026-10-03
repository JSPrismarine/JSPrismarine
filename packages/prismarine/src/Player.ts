import { Vector3 } from '@jsprismarine/math';
import { Gametype, getGametypeId } from '@jsprismarine/minecraft';
import type { InetAddress } from '@jsprismarine/raknet';
import assert from 'node:assert';
import { Chat, ChatType } from './chat/Chat';
import { AttributeIds } from './entity/Attribute';
import type { DamageSource } from './entity/DamageSource';
import { deathMessage } from './entity/DeathMessages';
import { DamageCause } from './entity/Entity';
import {
    BREAKS_A_FALL,
    DROWNING_DAMAGE,
    DROWNING_INTERVAL,
    FALL_GRACE,
    isAllowed,
    WATER_BLOCKS
} from './entity/Environment';
import Human from './entity/Human';
import { FlagType, MAX_AIR_TICKS, MetadataFlag } from './entity/Metadata';
import ChatEvent from './events/chat/ChatEvent';
import PlayerSetGamemodeEvent from './events/player/PlayerSetGamemodeEvent';
import PlayerToggleFlightEvent from './events/player/PlayerToggleFlightEvent';
import PlayerToggleSprintEvent from './events/player/PlayerToggleSprintEvent';
import { ChangeDimensionPacket } from './network/Packets';
import { RespawnState } from './network/packet/RespawnPacket';
import { ActorEvent } from './network/packet/ActorEventPacket';
import type PlayerSession from './network/PlayerSession';
import type { ChunkCoord } from './network/packet/NetworkChunkPublisherUpdatePacket';
import MovementType from './network/type/MovementType';
import PlayStatusType from './network/type/PlayStatusType';
import TextType from './network/type/TextType';
import type Device from './utils/Device';
import Timer from './utils/Timer';
import type UUID from './utils/UUID';
import type Skin from './utils/skin/Skin';
import type { World } from './world/';
import { GameRules } from './world/GameRuleManager';
import type { Position } from './world/Position';
import CoordinateUtils from './world/CoordinateUtils';
import { DEFAULT_VIEW_DISTANCE_CHUNKS } from './world/Proximity';

/**
 * How much exhaustion buys one point of saturation, and then of food.
 */
const EXHAUSTION_PER_FOOD_POINT = 4;

/**
 * What the things a player does cost in exhaustion, from the vanilla hunger table.
 * @see https://minecraft.wiki/w/Hunger#Exhaustion_level_increase
 */
export const EXHAUSTION = {
    /** Per metre walked. */
    walking: 0.01,
    /** Per metre sprinted - ten times the cost of walking it. */
    sprinting: 0.1,
    /** Per jump. */
    jumping: 0.05,
    /** Per jump made while sprinting. */
    sprintJumping: 0.2,
    /** Per swing that connects. A miss is free, which is why it is charged after the fact. */
    attacking: 0.1,
    /** Per half-heart healed by being well fed. */
    regeneration: 6
} as const;

/** Hunger's slower effects - starving and healing - run on a four-second clock. */
const VITALS_INTERVAL = 80;

/** Food at or above this heals the player, at the cost of {@link EXHAUSTION.regeneration}. */
const REGENERATION_FOOD_LEVEL = 18;

/** Half-hearts lost per {@link VITALS_INTERVAL} with an empty food bar. */
const STARVATION_DAMAGE = 1;

/** Ticks of breath regained per tick out of the water; the bar empties at one. */
const AIR_REGAIN_PER_TICK = 5;

/** Breath is only reported to the client in steps of this many ticks - see `syncBreath`. */
const AIR_SYNC_STEP = 10;

/**
 * Movement further than this in a single update is a teleport, not a walk, and buys no
 * exhaustion. Without it a world change or a `/tp` across the map would empty the food bar.
 */
const MAX_EXHAUSTING_STEP = 10;

/**
 * How far a blow lifts a player off the ground.
 *
 * A flat number, unlike a mob's, which is capped against whatever the mob was already doing -
 * see `Mob.applyKnockback`. The server does not track a player's vertical velocity at all, since
 * their position arrives already integrated by their own client, so there is nothing here to cap
 * it against. Vanilla's value, which is what the cap would have produced from a standing start.
 */
const KNOCKBACK_LIFT = 0.4;

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

export default class Player extends Human {
    private readonly address: InetAddress;

    /**
     * The client this player speaks through, or null before one has been attached.
     *
     * Null until {@link Player.attachNetworkSession}, because the session cannot be built
     * until the player exists and the player must not build its own: doing that handed a
     * half-constructed `this` to the session's constructor and made the two modules import
     * each other at runtime.
     */
    private networkSession: PlayerSession | null = null;
    private permissions: string[];

    /**
     * The identity the client logged in with.
     *
     * Kept parsed rather than as the string it arrived as: every use of it is a network
     * write, and the login handler is the one place that has the raw form to begin with.
     * It lives here and not on `Entity` because only a client-controlled entity has one -
     * the random uuid every mob used to be handed was read by nothing.
     */
    private readonly uuid: UUID;

    /**
     * Timer used for various metrics.
     */
    private timer: Timer;
    private connected = false;

    /** The bound chat listener, held so `disable` can unregister the same function object. */
    private readonly boundChatHandler: (evt: ChatEvent) => Promise<void>;

    public xuid = '';
    public randomId = 0;

    public locale = '';
    public skin: Skin | null = null;

    public viewDistance = 0;
    public gamemode: Gametype = Gametype.WORLD_DEFAULT;

    private onGround = false;
    private flying = false;
    private sneaking = false;

    /** Ticks spent with no breath left, counting towards the next lungful of damage. */
    private drowningTicks = 0;

    /** What the client was last told about the player's breath - see `syncBreath`. */
    private sentAir = MAX_AIR_TICKS;
    private sentBreathing = true;

    public platformChatId = ''; // TODO: read this value from Login
    public device: Device | null = null;

    /**
     * Player's constructor.
     *
     * @remarks Inert on purpose. It assigns fields and nothing else: no session is built, no
     * listener is registered and nothing server-wide is told this player exists. A player
     * that is constructed and then rejected - by online-mode or by a ban - therefore leaves
     * nothing behind, which is what the chat listener and the chunk scheduler entry used to
     * do when both were claimed here and released only in {@link Player.disable}.
     * @param {object} options - The player options.
     * @param {Position} options.position - Where the player is, and in which world.
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
        super({ position });

        this.timer = new Timer();
        this.permissions = [];

        this.address = address;
        this.uuid = identity.uuid;
        this.xuid = identity.xuid;
        this.randomId = identity.randomId;
        this.locale = identity.locale;
        this.skin = identity.skin;
        this.device = identity.device;
        this.setName(identity.name);

        // Bound once and kept, because `removeListener` matches on identity: binding inline
        // at registration and passing the naked method to `removeListener` in `disable` are
        // two different functions, so nothing was ever unregistered and every disconnected
        // player stayed subscribed to chat for the life of the process.
        this.boundChatHandler = this.chatHandler.bind(this);
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
     * On enable hook.
     * @group Lifecycle
     */
    public async enable(): Promise<void> {
        const playerData = await this.getWorld().getPlayerData(this);

        this.permissions = await this.server.getPermissionManager().getPermissions(this);
        this.gamemode = getGametypeId(playerData.gamemode || this.server.getConfig().getGamemode());

        this.setPosition({
            position: playerData.position
                ? Vector3.fromObject(playerData.position)
                : await this.getWorld().getSpawnPosition(),
            pitch: playerData.position?.pitch || 0,
            yaw: playerData.position?.yaw || 0,
            headYaw: playerData.position?.headYaw || 0,
            type: MovementType.Reset
        });
        await this.getWorld().broadcastMove(this);

        await this.sendSettings();

        // Update position of all the players in the same world.
        await Promise.all(
            this.getWorld()
                .getPlayers()
                .map((target) => this.getNetworkSession().sendMove(target, MovementType.Reset))
        );

        // Registered here rather than in the constructor, and only once the rest has
        // succeeded: a player whose join failed part way through would otherwise stay
        // subscribed for the life of the process, because the connection has no session to
        // reach `disable` through until the join completes.
        this.server.on('chat', this.boundChatHandler);

        // Finally mark the player as connected.
        this.server.getLogger().debug(`(Complete player creation took ${this.timer.stop()} ms)`);
        this.connected = true;
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
        // somebody who never arrived. `enable` is also what registers the chat listener, so
        // there is nothing subscribed to remove either.
        if (!this.connected) return;

        if (this.xuid) await this.getWorld().savePlayerData(this);
        await this.getWorld().removeEntity(this);

        // `removeEntity` above already told everyone who could see this player to take them
        // away, world-scoped and only the clients that actually had them. The loop that used
        // to be here went over every player on the server, in every world, and included the
        // leaving player itself.
        await this.getNetworkSession().removeFromPlayerList();

        // Announce disconnection
        const event = new ChatEvent(
            new Chat({
                sender: this.server.getConsole()!,
                // The bare translation key, for the reason given in ResourcePackResponseHandler.
                message: `%multiplayer.player.left`,
                parameters: [this.getName()],
                needsTranslation: true,
                type: ChatType.TRANSLATION
            })
        );
        await this.server.emit('chat', event);

        this.connected = false;
        this.server.removeListener('chat', this.boundChatHandler);
    }

    private async chatHandler(evt: ChatEvent) {
        if (evt.isCancelled()) return;

        // TODO: proper channel system
        if (
            evt.getChat().getChannel() === '*.everyone' ||
            (evt.getChat().getChannel() === '*.ops' && this.isOp()) ||
            evt.getChat().getChannel() === `*.player.${this.getName()}`
        )
            await this.sendMessage(
                evt.getChat().getMessage(),
                evt.getChat().getType() as number as TextType,
                evt.getChat().getParameters(),
                evt.getChat().isNeedsTranslation()
            );
    }

    /**
     * Used to match vanilla behavior, will send chunks
     * with an initial view radius of DEFAULT_VIEW_DISTANCE_CHUNKS.
     */
    public async sendInitialSpawnChunks(): Promise<void> {
        const minX = CoordinateUtils.fromBlockToChunk(this.position.getX()) - DEFAULT_VIEW_DISTANCE_CHUNKS;
        const minZ = CoordinateUtils.fromBlockToChunk(this.position.getZ()) - DEFAULT_VIEW_DISTANCE_CHUNKS;
        const maxX = CoordinateUtils.fromBlockToChunk(this.position.getX()) + DEFAULT_VIEW_DISTANCE_CHUNKS;
        const maxZ = CoordinateUtils.fromBlockToChunk(this.position.getZ()) + DEFAULT_VIEW_DISTANCE_CHUNKS;

        const savedChunks: ChunkCoord[] = [];
        for (let chunkX = minX; chunkX <= maxX; ++chunkX) {
            for (let chunkZ = minZ; chunkZ <= maxZ; ++chunkZ) {
                // TODO: vanilla does not send all of them, but in a range
                // for example it does send them from x => [-3; 3] and z => [-3; 2]
                savedChunks.push({ x: chunkX, z: chunkZ });
            }
        }

        // One update to open the window the client will accept chunks in. It lists nothing:
        // `saved_chunks` describes chunks already sent, and at this point none have been.
        // PlayerSession re-sends this every tick that carries chunks, keeping it centred on
        // the player as they move.
        await this.getNetworkSession().sendNetworkChunkPublisher(DEFAULT_VIEW_DISTANCE_CHUNKS, []);

        // Queued, not sent: the player joins immediately and the world fills in around them
        // from the middle outwards, instead of everyone waiting while 81 chunks are built.
        this.getNetworkSession().queueChunks(
            CoordinateUtils.fromBlockToChunk(this.position.getX()),
            CoordinateUtils.fromBlockToChunk(this.position.getZ()),
            savedChunks.map((coord) => [coord.x, coord.z] as [number, number])
        );
    }

    /**
     * Change the player's current world.
     * @param {World} world - the new world
     */
    public async setWorld(world: World) {
        const dim0 = new ChangeDimensionPacket();
        dim0.dimension = 0;
        dim0.position = this.getPosition();
        dim0.respawn = false;

        const dim1 = new ChangeDimensionPacket();
        dim1.dimension = 1;
        dim1.position = this.getPosition();
        dim1.respawn = false;

        await this.getWorld().removeEntity(this);

        // Here, and not alongside `clearChunks` at the end: a dimension change makes the
        // client drop every entity it holds, so the tracker has to agree - but `addEntity`
        // below fills it with the new world, and clearing after that would throw away what it
        // just recorded and leave the player in an apparently empty world.
        this.getNetworkSession().clearTrackedEntities();

        this.position = this.position.withWorld(world);
        await world.addEntity(this);

        await this.getNetworkSession().send(dim0);
        await this.getNetworkSession().sendPlayStatus(PlayStatusType.PlayerSpawn);
        await this.getNetworkSession().send(dim1);
        await this.getNetworkSession().sendPlayStatus(PlayStatusType.PlayerSpawn);

        await this.sendInitialSpawnChunks();

        await this.getNetworkSession().send(dim1);
        await this.getNetworkSession().sendPlayStatus(PlayStatusType.PlayerSpawn);
        await this.getNetworkSession().send(dim0);
        await this.getNetworkSession().sendPlayStatus(PlayStatusType.PlayerSpawn);

        await this.getNetworkSession().clearChunks();
        await this.getNetworkSession().needNewChunks();
        await this.getNetworkSession().sendPlayStatus(PlayStatusType.PlayerSpawn);
    }

    public isOnline() {
        return this.connected;
    }

    public async update(tick: number): Promise<void> {
        await super.update(tick);
        await this.getNetworkSession().update(tick);

        await this.updateVitals(tick);

        // Anything that moved an attribute this tick - hunger, most of the time - goes out
        // here, as a single packet holding just what changed.
        await this.getNetworkSession().syncAttributes();

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
     */
    public async kick(reason = 'unknown reason'): Promise<void> {
        await this.getNetworkSession().getConnection().disconnect(reason, false);
        this.server.getLogger().verbose(`Player with id §b${this.getRuntimeId()}§r was kicked: ${reason}`);
    }

    /**
     * Sends this player's gamemode, adventure settings and abilities where each belongs.
     *
     * The two halves have different audiences, and sending both to everyone was a bug.
     * `UpdateAdventureSettingsPacket` carries no target actor - it describes the client
     * receiving it and nothing else - so pushing one player's settings to every session made
     * a single spectator set `worldImmutable` on everybody else's client. It goes to this
     * player alone. `UpdateAbilitiesPacket` does carry `targetActorUniqueId`, so it is
     * genuinely about this player and belongs with everyone who can see them.
     */
    public async sendSettings(): Promise<void> {
        await this.getNetworkSession().sendGamemode();
        await this.getNetworkSession().sendSettings();

        // Explicitly, rather than relying on being among the online players: this runs from
        // `enable()`, which marks the player connected only once it returns.
        await this.getNetworkSession().sendAbilities(this);

        await Promise.all(
            this.server
                .getSessionManager()
                .getAllPlayers()
                .filter((target) => target !== this)
                .map(async (target) => target.getNetworkSession().sendAbilities(this))
        );
    }

    /**
     * Finishes bringing this player into the game: position, gamemode, inventory, settings.
     * @remarks Named apart from {@link Player.spawnTo} on purpose. This used to be called
     * `sendSpawn`, overriding the entity method of that name with a different signature and
     * an unrelated meaning - one is "put me into the world", the other is "show me to
     * somebody". Adding a player to a world therefore ran this by accident.
     */
    public async completeSpawn(): Promise<void> {
        await this.getWorld().broadcastMove(this);
        await this.setGamemode();
        await this.getNetworkSession().sendInventory();
        await this.sendSettings();

        // Sent again here, not only during the join sequence: the client throws away the
        // local player it had while it is spawning, taking health, hunger and breath with it.
        await this.getNetworkSession().sendAttributes();
        await this.getNetworkSession().sendMetadata();
    }

    /**
     * A player appears to other clients as a player, not as a generic actor.
     * @param {PlayerSession} session - The client to show it to.
     */
    public override async spawnTo(session: PlayerSession): Promise<void> {
        await this.getNetworkSession().sendSpawn(session.getPlayer());
    }

    public override async despawnFrom(session: PlayerSession): Promise<void> {
        await this.getNetworkSession().sendDespawn(session.getPlayer());
    }

    /**
     * Send a chat message to the client.
     * @param message - the message
     */
    public async sendMessage(
        message: string,
        type: TextType = TextType.Raw,
        parameters: string[] = [],
        needsTranslation = false
    ): Promise<void> {
        // TODO: Do this properly like java edition,
        // in other words, the message should be JSON formatted.
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
        this.server.post(['playerSetGamemode', event]);
        if (event.isCancelled()) return;

        this.gamemode = event.getGamemode();
        await this.getNetworkSession().sendGamemode();

        if (this.gamemode === Gametype.CREATIVE || this.gamemode === Gametype.SPECTATOR) {
            this.metadata.setCanFly(true);
        } else {
            this.metadata.setCanFly(false);
            await this.setFlying(false);
        }

        await this.sendSettings();
        await this.getNetworkSession().sendGamemode();
        await this.getNetworkSession().sendMetadata();

        // The abilities are read off the gamemode, so they are stale the moment it changes -
        // and they were never re-sent. Among them is `INSTABUILD`, which is what tells the
        // client it may help itself from the creative menu.
        await this.getNetworkSession().sendAbilities();
    }

    public getNetworkSession(): PlayerSession {
        assert(this.networkSession !== null, 'Player has no network session attached');
        return this.networkSession;
    }

    public getAddress() {
        return this.address;
    }

    public getName(): string {
        return this.metadata.nameTag;
    }

    public getFormattedUsername(): string {
        return `<${this.getName()}>`;
    }

    public getPermissions(): string[] {
        return this.permissions;
    }

    /**
     * Get the XUID of the player.
     * @returns {string | null} XUID of the player or null if not available
     */
    public getXUID(): string | null {
        return this.xuid || null;
    }

    /**
     * Players are followed as far as the viewer can see.
     *
     * Deliberately past any plausible view distance, so the recipient's own radius is always
     * what decides. Vanilla uses the same trick for the same reason.
     * @returns {number} The tracking radius in chunks.
     */
    public override getTrackingRange(): number {
        return 32;
    }

    /**
     * Players move constantly and are the entity everyone is looking at.
     * @returns {number} The interval in ticks.
     */
    public override getTrackingInterval(): number {
        return 2;
    }

    protected override broadcastsOwnMovement(): boolean {
        return true;
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
        return this.uuid;
    }

    /**
     * Check if the `Player` is an operator.
     * @returns `true` if this player is an operator otherwise `false`.
     */
    public isOp(): boolean {
        return this.server.getPermissionManager().isOp(this.getName());
    }

    /**
     * Everything that happens to a player just because time passed: breath, then hunger.
     *
     * Runs before the tick's attribute sync, so a point of food lost here is a point of food
     * the client hears about this tick rather than next.
     * @param {number} tick - The current world-tick.
     */
    private async updateVitals(tick: number): Promise<void> {
        if (!this.connected || !this.isVulnerable() || !this.isAlive()) return;

        await this.updateBreath();

        // The rest of hunger is a four-second clock, not a per-tick one.
        if (tick % VITALS_INTERVAL === 0) await this.updateHunger();
    }

    /**
     * Fills or empties the player's lungs, and drowns them once they are empty.
     */
    private async updateBreath(): Promise<void> {
        const air = this.metadata.air;

        if (await this.isHeadInWater()) {
            this.metadata.setBreathing(false);
            this.metadata.setAir(air - 1);

            if (this.metadata.air > 0) this.drowningTicks = 0;
            else if (++this.drowningTicks >= DROWNING_INTERVAL) {
                this.drowningTicks = 0;

                // The gamerule has been registered and defaulted since long before anything read
                // it. The bar still empties either way - the client draws it, and a world with
                // drowning turned off is not one where nobody is underwater.
                if (isAllowed(this.getWorld(), DamageCause.Drowning)) {
                    await this.damage(DROWNING_DAMAGE, DamageCause.Drowning);
                }
            }
        } else {
            this.drowningTicks = 0;
            this.metadata.setBreathing(true);
            // Vanilla refills the bar far faster than it empties: a lungful is a few seconds
            // of surfacing, not another fifteen.
            if (air < this.metadata.maxAir) this.metadata.setAir(air + AIR_REGAIN_PER_TICK);
        }

        await this.syncBreath();
    }

    /**
     * Sends the breath state, but only when it is worth a packet.
     *
     * Air moves every single tick underwater, and the bubble bar is ten bubbles over fifteen
     * seconds - so telling the client about every one of those 300 values would be 290
     * packets that change nothing on screen. A tenth of a second's worth is finer than the
     * bar can show.
     */
    private async syncBreath(): Promise<void> {
        const air = this.metadata.air;
        const breathing = this.metadata.breathing;

        const step = (ticks: number) => Math.floor(ticks / AIR_SYNC_STEP);
        const worthSending =
            breathing !== this.sentBreathing ||
            step(air) !== step(this.sentAir) ||
            // Empty and full are worth reporting exactly, whatever step they fall in.
            ((air === 0 || air === this.metadata.maxAir) && air !== this.sentAir);

        if (!worthSending) return;

        this.sentAir = air;
        this.sentBreathing = breathing;
        await this.getNetworkSession().sendMetadata();
    }

    /**
     * Whether the player's head is underwater - which is what drowns them, rather than
     * standing in water up to the knees.
     * @remarks The position a client reports is its eye position, so the block the player is
     * recorded at *is* the block their head is in. Nothing here adds an eye height on top.
     */
    private async isHeadInWater(): Promise<boolean> {
        const position = this.getPosition();

        try {
            const block = await this.getWorld().getBlock(
                Math.floor(position.getX()),
                Math.floor(position.getY()),
                Math.floor(position.getZ())
            );

            return WATER_BLOCKS.has(block.getName());
        } catch {
            // Asking about a block that is not there to be read - a chunk still loading,
            // a player who has walked off the edge of what is generated. Not being able to
            // answer is not a reason to break the tick, and dry is the safe answer.
            return false;
        }
    }

    /**
     * The slow half of hunger: starving when the bar is empty, healing when it is nearly
     * full. Both run on vanilla's four-second clock.
     */
    private async updateHunger(): Promise<void> {
        const food = this.getFood();

        if (food <= 0) {
            await this.damage(STARVATION_DAMAGE, DamageCause.Starvation);
            return;
        }

        // Healing is not free: it is the main thing a well-fed player spends food on. A world with
        // natural regeneration turned off is one where food only stops you starving.
        const [regenerates] = this.getWorld().getGameRuleManager().getGameRule(GameRules.NaturalRegeneration) ?? [true];
        if (!regenerates) return;

        if (food >= REGENERATION_FOOD_LEVEL && this.getHealth() < this.getMaxHealth()) {
            await this.heal(1);
            this.addExhaustion(EXHAUSTION.regeneration);
        }
    }

    /**
     * What happens when the player runs out of health.
     *
     * The client puts up its own death screen as soon as health reaches zero, so the work
     * here is telling everyone else and waiting: the player stays dead until they ask to
     * come back, which arrives as a `RESPAWN` player action.
     * @param {DamageSource} source - What killed them, and who is answerable for it.
     */
    protected override async onDeath(source: DamageSource): Promise<void> {
        this.drowningTicks = 0;

        await super.onDeath(source);

        await this.getNetworkSession().sendAttributes();
        await this.getWorld().sendActorEvent(this, ActorEvent.DEATH_ANIMATION);

        // Where they will come back, told now rather than later. The client will not offer
        // the respawn button until it knows, which is why a death screen that never became a
        // respawn screen was stuck on "Respawning" - it was still waiting for this.
        await this.getNetworkSession().sendRespawn(
            await this.getWorld().getSpawnPosition(),
            RespawnState.SERVER_SEARCHING_FOR_SPAWN
        );

        // The bare translation key, as with the join and leave messages: the client renders
        // it in its own language. Which key it is depends on whether anybody is to blame - see
        // `DeathMessages`.
        const { key, parameters } = deathMessage(this, source);

        const event = new ChatEvent(
            new Chat({
                sender: this.server.getConsole()!,
                message: key,
                parameters,
                needsTranslation: true,
                type: ChatType.TRANSLATION
            })
        );
        await this.server.emit('chat', event);
    }

    /**
     * Brings the player back after a death, at the world spawn and in one piece.
     *
     * @remarks Called when the client asks, not when the player dies - the death screen is
     * the client's, and it decides how long it stays up.
     */
    public async respawn(): Promise<void> {
        // A player the server does not consider dead is put back where they already are, and
        // keeps everything. The answer still goes out: the client repeats the request once a
        // second until it gets one, and silence is what leaves it on the death screen.
        if (!this.isAlive()) {
            this.attributes.reset();
            this.metadata.setAir();
            this.metadata.setBreathing(true);
            this.sentAir = this.metadata.air;
            this.sentBreathing = true;
            this.drowningTicks = 0;

            // A fresh body is not running, crouching or flying, and carries no leftover hurt.
            // These survive a death because nothing resets them, and the client draws what it
            // is told: still red, still lying down.
            this.metadata.setSprinting(false);
            this.metadata.setPropertyValue(MetadataFlag.HURT_TIME, FlagType.INT, 0);
            this.metadata.setPropertyValue(MetadataFlag.HURT_DIRECTION, FlagType.INT, 0);
            this.sneaking = false;
            this.flying = false;

            await this.setPosition({
                position: await this.getWorld().getSpawnPosition(),
                type: MovementType.Reset
            });
        }

        // No `RespawnPacket` here, and nothing that describes the fresh body either. This
        // runs when the player presses the button, and at that moment the client is still on
        // its death screen and throws away anything it is told about itself. The packet that
        // ends the exchange, and everything that has to survive it, belong to the answer to
        // the client's own `CLIENT_READY_TO_SPAWN` - see `RespawnHandler`.
        await this.getNetworkSession().sendAttributes();
        await this.getNetworkSession().sendMetadata();
    }

    /**
     * Hurt the player - unless the world cannot touch them.
     *
     * The gamemode check belongs here rather than only at each call site: a creative player
     * is unharmed by everything, not just by the two things that happen to call this today.
     * @param {number} amount - Half-hearts of damage.
     * @param {DamageCause | DamageSource} [source=DamageCause.Generic] - What did it, and who.
     * @returns {Promise<boolean>} `true` if any damage was actually taken.
     */
    public override async damage(
        amount: number,
        source: DamageCause | DamageSource = DamageCause.Generic
    ): Promise<boolean> {
        if (!this.isVulnerable()) return false;

        return super.damage(amount, source);
    }

    /**
     * Asks the client to shove the player, rather than shoving them.
     *
     * The one entity the server cannot simply move. A player's position comes from their own
     * client and is stored here as reported, so writing to it is overruled by the next movement
     * packet and shows up as rubber-banding. A velocity is a request the client honours, and it
     * runs the shove through the same physics as everything else the player does.
     *
     * Not awaited: knockback is a consequence of a hit, not a step of it, and the damage
     * pipeline has no reason to wait for a packet to be framed before taking the health off.
     * @param {number} directionX - Unit vector away from the blow, x.
     * @param {number} directionZ - Unit vector away from the blow, z.
     * @param {number} strength - How hard, with knockback resistance already taken off.
     */
    public override applyKnockback(directionX: number, directionZ: number, strength: number): void {
        if (!this.connected) return;

        void this.getNetworkSession().sendMotion(
            new Vector3(directionX * strength, KNOCKBACK_LIFT, directionZ * strength)
        );
    }

    /**
     * Whether the world can hurt this player at all.
     *
     * Creative and spectator players do not drown, starve or take damage in vanilla, which
     * is one condition and not three.
     * @returns {boolean} `true` if the player can be harmed.
     */
    public isVulnerable(): boolean {
        return this.gamemode === Gametype.SURVIVAL || this.gamemode === Gametype.ADVENTURE;
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
        return this.attributes.getValue(AttributeIds.PlayerHunger);
    }

    /**
     * Set the player's food level. Clamped to `0..20`, and sent on the next tick.
     * @param {number} food - The wanted food level.
     */
    public setFood(food: number): void {
        this.attributes.setValue(AttributeIds.PlayerHunger, food);
    }

    /**
     * The player's saturation - the hidden buffer that is spent before food is.
     * @returns {number} The saturation level.
     */
    public getSaturation(): number {
        return this.attributes.getValue(AttributeIds.PlayerSaturation);
    }

    /**
     * Set the player's saturation. Saturation never exceeds the current food level in
     * vanilla, so it is capped there as well as at the attribute's own maximum.
     * @param {number} saturation - The wanted saturation.
     */
    public setSaturation(saturation: number): void {
        this.attributes.setValue(AttributeIds.PlayerSaturation, Math.min(saturation, this.getFood()));
    }

    /**
     * Feed the player, as eating does.
     * @param {number} food - Food points to restore.
     * @param {number} [saturation=0] - Saturation points to restore.
     */
    public addFood(food: number, saturation = 0): void {
        this.setFood(this.getFood() + food);
        this.setSaturation(this.getSaturation() + saturation);
    }

    /**
     * Make the player hungrier.
     *
     * Exhaustion is a counter, not something the player has: every four points spend one
     * point of saturation, or - once saturation is gone - one point of food. Everything that
     * costs hunger in vanilla (moving, jumping, attacking, healing) does it through here.
     * @param {number} amount - Exhaustion to add.
     * @example
     * ```typescript
     * player.addExhaustion(0.1); // one metre sprinted
     * ```
     */
    public addExhaustion(amount: number): void {
        if (!this.consumesFood() || !this.isAlive() || amount <= 0) return;

        let exhaustion = this.attributes.getValue(AttributeIds.PlayerExhaustion) + amount;

        while (exhaustion >= EXHAUSTION_PER_FOOD_POINT) {
            exhaustion -= EXHAUSTION_PER_FOOD_POINT;

            const saturation = this.getSaturation();
            if (saturation > 0) this.setSaturation(saturation - 1);
            else this.setFood(this.getFood() - 1);
        }

        this.attributes.setValue(AttributeIds.PlayerExhaustion, exhaustion);
    }

    /**
     * Charges the player for the ground they just covered.
     *
     * Called from {@link Player.setPosition}, which every kind of movement funnels through.
     * Only horizontal distance counts, as in vanilla - falling is free.
     * @param {Vector3} from - Where the player was.
     * @param {Vector3} to - Where the player now is.
     */
    private addMovementExhaustion(from: Vector3, to: Vector3): void {
        if (!this.consumesFood() || this.isFlying()) return;

        const distance = Math.hypot(to.getX() - from.getX(), to.getZ() - from.getZ());
        if (distance <= 0 || distance > MAX_EXHAUSTING_STEP) return;

        this.addExhaustion(distance * (this.metadata.sprinting ? EXHAUSTION.sprinting : EXHAUSTION.walking));
    }

    /**
     * Charges the player for a jump. Sprint-jumping is what actually empties a food bar in
     * vanilla, at four times the cost of a standing jump.
     */
    public addJumpExhaustion(): void {
        this.addExhaustion(this.metadata.sprinting ? EXHAUSTION.sprintJumping : EXHAUSTION.jumping);
    }

    public async setSprinting(sprinting: boolean) {
        if (sprinting === this.metadata.sprinting) return;

        const event = new PlayerToggleSprintEvent(this, sprinting);
        this.server.post(['playerToggleSprint', event]);
        if (event.isCancelled()) return;

        this.metadata.setSprinting(event.getIsSprinting());
        await this.getNetworkSession().sendMetadata();
    }

    public isFlying() {
        return this.flying;
    }
    public async setFlying(flying: boolean) {
        if (flying === this.isFlying()) return;

        if (!this.metadata.canFly) {
            this.flying = false;
            await this.sendSettings();
            return;
        }

        const event = new PlayerToggleFlightEvent(this, flying);
        this.server.post(['playerToggleFlight', event]);
        if (event.isCancelled()) return;

        this.flying = event.getIsFlying();
        await this.sendSettings();
    }

    public isSneaking() {
        return this.sneaking;
    }
    public async setSneaking(val: boolean) {
        if (val === this.sneaking) return;
        this.sneaking = val;
    }

    public isOnGround() {
        return this.onGround;
    }
    public async setOnGround(val: boolean) {
        if (val === this.onGround) return;
        this.onGround = val;

        // Landing is the moment the fall is paid for, and the only one: the distance has been
        // accumulating on the way down and is worth nothing until it stops.
        if (val) await this.land();
    }

    /**
     * How far the player has fallen since they were last supported.
     *
     * Accumulated from their own position reports. The protocol calls its movement server
     * authoritative, but this server does not simulate it: it takes the position each
     * `PlayerAuthInputPacket` reports, so it cannot know a fall's length except by adding up
     * what it is told.
     */
    private fallDistance = 0;

    /**
     * The tick a held-item use began on, or null if nothing is being drawn.
     *
     * Bedrock does not tell the server how long a bow was drawn for - it says "started" and later
     * "released", and the time between them is the charge. So it has to be measured here.
     */
    private itemUseStartedAt: number | null = null;

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
        return this.fallDistance;
    }

    /**
     * Adds a downward step to the fall in progress.
     *
     * Rising resets it, which is what makes the fall start at the top of a jump rather than at the
     * ground the player jumped from - otherwise every jump would be measured from the floor and
     * land for its own height.
     */
    private trackFall(from: Vector3, to: Vector3): void {
        if (this.onGround || this.isFlying() || !this.isVulnerable()) {
            this.fallDistance = 0;
            return;
        }

        const climb = to.getY() - from.getY();
        if (climb > 0) this.fallDistance = 0;
        else this.fallDistance -= climb;
    }

    /**
     * Hurts the player for the fall they have just finished, if it was far enough.
     *
     * One half-heart per block past the third, which is vanilla's rule. Landing in anything that
     * breaks a fall costs nothing at all.
     */
    private async land(): Promise<void> {
        const fallen = this.fallDistance;
        this.fallDistance = 0;

        if (fallen <= FALL_GRACE || !this.isVulnerable()) return;
        if (!isAllowed(this.getWorld(), DamageCause.Fall)) return;
        if (await this.isStandingInSomethingSoft()) return;

        const damage = Math.floor(fallen - FALL_GRACE);
        if (damage > 0) await this.damage(damage, DamageCause.Fall);
    }

    /** Whether whatever the player is standing in cushions the landing. */
    private async isStandingInSomethingSoft(): Promise<boolean> {
        const position = this.getPosition();

        try {
            // Both the block they are in and the one they came to rest on: water breaks a fall
            // from inside it, hay from underneath.
            const feet = await this.getWorld().getBlockState(
                Math.floor(position.getX()),
                Math.floor(position.getY()),
                Math.floor(position.getZ())
            );
            const below = await this.getWorld().getBlockState(
                Math.floor(position.getX()),
                Math.floor(position.getY()) - 1,
                Math.floor(position.getZ())
            );

            return BREAKS_A_FALL.has(feet.name) || BREAKS_A_FALL.has(below.name);
        } catch {
            // A chunk still loading, or a player off the edge of what is generated. Not being able
            // to answer is not a reason to hurt them - see `isHeadInWater`, which reasons the same
            // way about the other direction.
            return true;
        }
    }

    /**
     * Set the position.
     * @param {object} options - The options to set the position.
     * @param {Vector3} options.position - The new position.
     * @param {MovementType} [options.type=MovementType.Normal] - The movement type.
     * @param {number} [options.pitch=this.pitch] - The new pitch.
     * @param {number} [options.yaw=this.yaw] - The new yaw.
     * @param {number} [options.headYaw=this.headYaw] - The new head yaw.
     * @param {boolean} [broadcast=true] - Whether to broadcast the position change.
     * @remarks This will notify the player's client about the position change.
     */
    public async setPosition(
        {
            position,
            type = MovementType.Normal,
            pitch = this.pitch,
            yaw = this.yaw,
            headYaw = this.headYaw
        }: {
            position: Vector3;
            type?: MovementType;
            pitch?: number;
            yaw?: number;
            headYaw?: number;
        },
        broadcast = true
    ) {
        const previous = this.getPosition();

        await super.setPosition({ position });

        // A reset or a teleport is not the player walking, so it costs nothing - and it must not
        // count as a fall either, or arriving anywhere below where you left would hurt.
        if (type === MovementType.Normal) {
            this.addMovementExhaustion(previous, position);
            this.trackFall(previous, position);
        } else {
            this.fallDistance = 0;
        }

        this.pitch = pitch;
        this.yaw = yaw;
        this.headYaw = headYaw;

        if (!broadcast) return;
        await this.getNetworkSession().sendMove(this, type);
    }
}

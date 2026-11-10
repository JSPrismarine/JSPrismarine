import { Vector3 } from '@jsprismarine/math';
import type { StatusEffect } from './entity/StatusEffect';
import type { EntityPosition } from '@jsprismarine/entities';
import { ActorEvent, DisconnectReason, Gametype } from '@jsprismarine/minecraft';
import type { InetAddress } from '@jsprismarine/raknet';
import assert from 'node:assert';
import { Chat, ChatType } from './chat/Chat';
import type { ChatRecipient } from './chat/ChatManager';
import { AttributeIds } from '@jsprismarine/protocol/wire/structures/Attribute';
import { DamageSource } from './entity/DamageSource';
import { deathMessage } from './entity/DeathMessages';
import { DamageCause } from './entity/Entity';
import type { EntityPositionOptions } from './entity/Entity';
import { PORTAL_COOLDOWN_TICKS, PORTAL_TRANSITION_TICKS } from './entity/PortalContact';
import type { PortalRule } from './world/portal/rules';
import {
    breaksAFall,
    DROWNING_DAMAGE,
    DROWNING_INTERVAL,
    FALL_GRACE,
    isAllowed,
    isUnderwater,
    VOID_DAMAGE,
    VOID_DEPTH,
    VOID_INTERVAL
} from './entity/Environment';
import Human, { eyePositionAt } from './entity/Human';
import { FlagType, MAX_AIR_TICKS, MetadataFlag } from '@jsprismarine/protocol/wire/structures/Metadata';
import PlayerSetGamemodeEvent from './events/player/PlayerSetGamemodeEvent';
import PlayerToggleFlightEvent from './events/player/PlayerToggleFlightEvent';
import PlayerToggleSprintEvent from './events/player/PlayerToggleSprintEvent';
import { PlayerRespawnState } from '@jsprismarine/minecraft';
import DeathInfoPacket from '@jsprismarine/protocol/packet/DeathInfoPacket';
import type PlayerSession from './network/PlayerSession';
import type { ChunkCoord } from '@jsprismarine/protocol/packet/NetworkChunkPublisherUpdatePacket';
import { PositionMode, TextPacketType } from '@jsprismarine/protocol';
import { loadAdvancements } from './advancement/progress';
import { advancementPlayerTick } from './advancement/triggers';
import { enchantmentSeedOf } from './enchantment/enchantingTable';
import type Device from './utils/Device';
import Timer from './utils/Timer';
import type UUID from '@jsprismarine/protocol/wire/structures/UUID';
import type Skin from '@jsprismarine/protocol/wire/structures/skin/Skin';
import type { World } from './world/';
import { GameRules } from './world/GameRuleManager';
import type { Position } from './world/Position';
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
import CoordinateUtils from './world/CoordinateUtils';
import { DEFAULT_VIEW_DISTANCE_CHUNKS } from './world/Proximity';
import { logLegacyImpulse, logLegacyWrite } from './entity/legacyAdapter';
import type { ExperienceHolder } from './entity/Experience';
import { PlayerComponents } from './entity/playerComponents';
import { PLAYER_TRACKING_RANGE_CHUNKS } from './world/ShownPlayer';
import type { PlainData, PlainRecord } from './world/changelog/PlainData';

/**
 * How much exhaustion buys one point of saturation, and then of food.
 */
const EXHAUSTION_PER_FOOD_POINT = 4;

/** How often the two per-player triggers are checked, which is Java's one second. */
const ADVANCEMENT_CHECK_TICKS = 20;

/**
 * What the things a player does cost in exhaustion, from the vanilla hunger table.
 * @see https://minecraft.wiki/w/Hunger#Exhaustion_level_increase
 */
export const EXHAUSTION = {
    /** Per meter walked. */
    walking: 0.01,
    /** Per meter sprinted - ten times the cost of walking it. */
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

/** Exhaustion per level, per tick, while the hunger effect is on. */
const HUNGER_EFFECT_EXHAUSTION = 0.005;

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
 * A flat number, where a mob's is applied on top of whatever the mob was already doing - see
 * `StoreActor.applyKnockback` in `entity/data/storeActors.ts`, which damps the mob's own
 * velocity first. The server does not track a player's vertical velocity at all, since their
 * position arrives already integrated by their own client, so there is nothing here to damp.
 * Vanilla's value, which is what a mob gets from a standing start.
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

/**
 * Where a player comes back after a death: the world, and the three positions the respawn
 * exchange needs in it. See {@link respawnPoint} for what each position is.
 */
export type RespawnDestination = ReturnType<typeof respawnPoint> & { readonly world: World };

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

    /** This player as the chat fan-out reaches them, held so `disable` leaves with the same object. */
    private readonly chatRecipient: ChatRecipient;

    public xuid = '';
    public randomId = 0;

    public locale = '';
    public skin: Skin | null = null;

    public viewDistance = 0;
    public gamemode: Gametype = Gametype.WORLD_DEFAULT;

    /**
     * Vitals, experience, abilities, movement flags, the spawn point and an item use in progress,
     * each written through a setter the change log hears. The fields below read and write it.
     */
    private readonly components = new PlayerComponents(
        this.attributes,
        (field, before, after) => logLegacyWrite(this, field, before, after),
        this.metadata
    );

    private get onGround(): boolean {
        return this.components.get('movement.onGround');
    }
    private set onGround(onGround: boolean) {
        this.components.set('movement.onGround', onGround);
    }
    private get flying(): boolean {
        return this.components.get('abilities.flying');
    }
    private set flying(flying: boolean) {
        this.components.set('abilities.flying', flying);
    }
    private get sneaking(): boolean {
        return this.components.get('movement.sneaking');
    }
    private set sneaking(sneaking: boolean) {
        this.components.set('movement.sneaking', sneaking);
    }
    private get sleeping(): boolean {
        return this.components.get('movement.sleeping');
    }
    private set sleeping(sleeping: boolean) {
        this.components.set('movement.sleeping', sleeping);
    }

    /** Ticks spent with no breath left, counting towards the next lungful of damage. */
    private get drowningTicks(): number {
        return this.components.get('vitals.drowningTicks');
    }
    private set drowningTicks(ticks: number) {
        this.components.set('vitals.drowningTicks', ticks);
    }

    /** What the client was last told about the player's breath - see `syncBreath`. */
    private sentAir = MAX_AIR_TICKS;
    private sentBreathing = true;

    /**
     * Where this player was placed on joining, when they had no saved position.
     *
     * Kept for the join packets: a Bedrock Dedicated Server reports the requested spot in
     * `StartGame` and the final one in the `Respawn` that releases the client.
     */
    private joinSpawn: PlayerSpawn | null = null;

    /**
     * Where this player was placed on joining, or null when they came back to a saved position.
     */
    public getJoinSpawn(): PlayerSpawn | null {
        return this.joinSpawn;
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
     * Sets what this player is mining.
     * @param {BlockMining | null} mining - The block, or null when the player stopped or broke it.
     */
    public setMining(mining: BlockMining | null): void {
        this.mining = mining;
    }

    /**
     * Stops the cracks on the block this player was mining, if any, and forgets it.
     *
     * For whatever ends the mining without the client saying so: a disconnect, a death, a
     * change of game mode or of world. Left alone, the cracks would go out every tick for good.
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

        // Built once and kept, because the fan-out only lets the recipient that joined leave.
        this.chatRecipient = {
            key: keyOfPlayer(this),
            getName: () => this.getName(),
            isOp: () => this.isOp(),
            receive: async (delivery) => this.getNetworkSession().sendMessage(delivery)
        };
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
        if (record.world !== this.getWorld()) this.relocate(this.getPosition().withWorld(record.world));

        const playerData = record.data;

        // Before anything can be earned, so a returning player keeps what they
        // had rather than earning their first advancement twice.
        loadAdvancements(this, playerData.advancements);
        enchantmentSeedOf(this, playerData.enchantmentSeed);

        this.permissions = await this.server.getPermissionManager().getPermissions(this);
        applyPlayerRecord(this, playerData, this.server.getConfig().getGamemode(), this.server.getContent());

        // A returning player goes back where they were; a new one is placed the way BDS
        // places them, which may not be the spawn point itself.
        const recorded = recordedPosition(playerData);
        let position: Vector3;
        if (recorded) {
            this.joinSpawn = null;
            position = Vector3.fromObject(recorded);
        } else {
            const placed = await this.getWorld().placePlayerSpawn();
            this.joinSpawn = placed;
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
        this.server.getChatManager().join(this.chatRecipient);

        // Finally mark the player as connected.
        this.server.getLogger().debug(`(Complete player creation took ${this.timer.stop()} ms)`);
        this.connected = true;
    }

    /**
     * Writes health without the death path, which is how a record puts it back: restoring a
     * player who logged out on half a heart would otherwise announce a death they already had.
     * Nothing is sent; the join burst sends the attributes once the client is ready for them.
     * @param health - The health to hold.
     */
    public restoreHealth(health: number): void {
        this.attributes.setValue(AttributeIds.Health, health);
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
        await this.getWorld().removeEntity(this);

        // `removeEntity` above already told everyone who could see this player to take them
        // away, world-scoped and only the clients that actually had them. The loop that used
        // to be here went over every player on the server, in every world, and included the
        // leaving player itself.
        await this.getNetworkSession().removeFromPlayerList();

        // Announce disconnection. The leaving player is still in the fan-out here, as it was
        // still subscribed when this went through the event alone.
        const chat = this.server.getChatManager();
        await chat.send(
            new Chat({
                sender: this.server.getConsoleSender(),
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

    /**
     * Used to match vanilla behavior, will send chunks
     * with an initial view radius of DEFAULT_VIEW_DISTANCE_CHUNKS.
     */
    public async sendInitialSpawnChunks(): Promise<void> {
        const minX = CoordinateUtils.fromBlockToChunk(this.getPosition().getX()) - DEFAULT_VIEW_DISTANCE_CHUNKS;
        const minZ = CoordinateUtils.fromBlockToChunk(this.getPosition().getZ()) - DEFAULT_VIEW_DISTANCE_CHUNKS;
        const maxX = CoordinateUtils.fromBlockToChunk(this.getPosition().getX()) + DEFAULT_VIEW_DISTANCE_CHUNKS;
        const maxZ = CoordinateUtils.fromBlockToChunk(this.getPosition().getZ()) + DEFAULT_VIEW_DISTANCE_CHUNKS;

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
        // PlayerSession re-sends this every tick that carries chunks, keeping it centered on
        // the player as they move.
        await this.getNetworkSession().sendNetworkChunkPublisher(DEFAULT_VIEW_DISTANCE_CHUNKS, []);

        // Queued, not sent: the player joins immediately and the world fills in around them
        // from the middle outwards, instead of everyone waiting while 81 chunks are built.
        this.getNetworkSession().queueChunks(
            CoordinateUtils.fromBlockToChunk(this.getPosition().getX()),
            CoordinateUtils.fromBlockToChunk(this.getPosition().getZ()),
            savedChunks.map((coord): [number, number] => [coord.x, coord.z])
        );
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

    public async update(tick: number): Promise<void> {
        await super.update(tick);
        await this.getNetworkSession().update(tick);

        await this.updateVitals(tick);
        await this.tickConsuming();
        await this.updateVoid(tick);

        // With server-authoritative block breaking the server animates the cracks itself, every
        // tick, where a client left to it would report each swing instead. The world answers
        // false once the block is no longer the one being mined.
        const mining = this.components.get('mining.block');
        if (
            mining !== null &&
            !(await this.getWorld().updateBlockCracking(blockMiningOf(mining))) &&
            this.components.get('mining.block') === mining
        ) {
            this.mining = null;
        }

        // Anything that moved an attribute this tick - hunger, most of the time - goes out
        // here, as a single packet holding just what changed.
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

        // Explicitly, because the fan-out below leaves this player out: its own client needs
        // the abilities too, and this is the one copy it gets.
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
        await this.getNetworkSession().sendStatusEffects(this);
    }

    /**
     * A player appears to other clients as a player, not as a generic actor.
     * @param {PlayerSession} session - The client to show it to.
     */
    public override async spawnTo(session: PlayerSession): Promise<void> {
        await session.sendAddPlayer(this);
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
        this.server.post(['playerSetGamemode', event]);
        if (event.isCanceled()) return;

        // A new game mode changes how, or whether, the player breaks blocks, so the mining in
        // progress does not carry over into it.
        if (event.getGamemode() !== this.gamemode) await this.stopMining();

        const before = this.gamemode;
        this.gamemode = event.getGamemode();
        logLegacyWrite(this, 'gamemode', before, this.gamemode);
        await this.getNetworkSession().sendGamemode();

        // Everyone in the world, this player included, caches each player's game type and
        // permission flags, so the docs have the server follow an accepted change with
        // `UpdatePlayerGameTypePacket` to every client.
        await Promise.all(
            this.getWorld()
                .getPlayers()
                .map(async (player) => player.getNetworkSession().sendGameTypeFor(this))
        );

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

    public getAddress(): InetAddress {
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
     * @returns {number} The tracking radius in chunks, {@link PLAYER_TRACKING_RANGE_CHUNKS}.
     */
    public override getTrackingRange(): number {
        return PLAYER_TRACKING_RANGE_CHUNKS;
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
        return this.server.getPermissionManager().isOp(this.getUUID().toString());
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
     * Hurts a player who has fallen out of the world.
     *
     * Java's `checkBelowWorld`: {@link VOID_DEPTH} blocks under the dimension's floor, four
     * half-hearts every {@link VOID_INTERVAL} ticks, which is the half-second cadence the
     * grace period leaves. Outside {@link Player.updateVitals} on purpose, because that gate
     * is {@link Player.isVulnerable} and the void is the one thing that reaches a creative
     * player; `damage` is what keeps it off a spectator.
     * @param {number} tick - The current world-tick.
     */
    private async updateVoid(tick: number): Promise<void> {
        if (!this.connected || !this.isAlive() || tick % VOID_INTERVAL !== 0) return;
        if (this.getFeetY() >= this.getWorld().getDimension().minY - VOID_DEPTH) return;

        await this.damage(VOID_DAMAGE, DamageCause.Void);
    }

    /**
     * Fills or empties the player's lungs, and drowns them once they are empty.
     */
    private async updateBreath(): Promise<void> {
        const air = this.components.get('vitals.air');

        if (await this.isHeadInWater()) {
            this.components.set('vitals.breathing', false);
            this.components.set('vitals.air', air - 1);

            if (this.components.get('vitals.air') > 0) this.drowningTicks = 0;
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
            this.components.set('vitals.breathing', true);
            // Vanilla refills the bar far faster than it empties: a lungful is a few seconds
            // of surfacing, not another fifteen.
            if (air < this.metadata.maxAir) this.components.set('vitals.air', air + AIR_REGAIN_PER_TICK);
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

            return isUnderwater(block.getName());
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
        const [regenerates] = this.getWorld().getGameRuleManager()?.getGameRule(GameRules.NaturalRegeneration) ?? [
            true
        ];
        if (!regenerates) return;

        if (food >= REGENERATION_FOOD_LEVEL && this.getHealth() < this.getMaxHealth()) {
            await this.heal(1);
            this.addExhaustion(EXHAUSTION.regeneration);
        }
    }

    /** Hunger drains food faster and saturation fills it; the rest are the entity's. */
    protected override async applyStatusEffectTick(effect: StatusEffect, clock: number): Promise<void> {
        await super.applyStatusEffectTick(effect, clock);

        if (effect.id === 'minecraft:hunger') this.addExhaustion(HUNGER_EFFECT_EXHAUSTION * (effect.amplifier + 1));
        else if (effect.id === 'minecraft:saturation') {
            // Java's `FoodData.eat(amplifier + 1, 1.0F)`: that much food, and twice as much saturation.
            this.addFood(effect.amplifier + 1, (effect.amplifier + 1) * 2);
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
        // What the death commits comes before the first wait, so it lands inside the blow
        // that caused it: the counters, the death event and its advancement triggers, and the
        // respawn search filed below. The packets follow.
        this.drowningTicks = 0;
        const stoppedMining = this.stopMining();
        const died = super.onDeath(source);

        // The bare translation key, as with the join and leave messages: the client renders
        // it in its own language. Which key it is depends on whether anybody is to blame - see
        // `DeathMessages`.
        const { key, parameters } = deathMessage(this, source);

        // Where they will come back. The client will not offer the respawn button until it
        // knows, which is why a death screen that never became a respawn screen was stuck on
        // "Respawning". The search may load chunks or build a dimension, so the death files it
        // and the next input step sends the answer (`world/RespawnRequests.ts`), unless the
        // player came back or left before then. The death screen's own copy of the cause
        // follows it, as PocketMine's `DeathPacketHandler` sends it after the `Respawn`;
        // `DeathInfo` takes the key without the `%` the chat packet wants.
        const deathInfo = new DeathInfoPacket({ cause: key.replace(/^%/, ''), messages: parameters });
        this.server
            .getRespawnRequests()
            .request(this.getWorld().getLevel().getRespawnSearch().find(this.respawnRequest()), async (answer) => {
                if (this.isAlive() || !this.isOnline()) return;
                await this.forgetLostSpawnPoint(answer);
                await this.getNetworkSession().sendRespawn(
                    Vector3.fromObject(answer.announced),
                    PlayerRespawnState.SEARCHING_FOR_SPAWN
                );
                await this.getNetworkSession().getConnection().sendDataPacket(deathInfo);
            });

        await stoppedMining;
        await died;
        await this.getNetworkSession().sendAttributes();
        await this.getWorld().sendActorEvent(this, ActorEvent.DEATH_ANIMATION);

        await this.server.getChatManager().send(
            new Chat({
                sender: this.server.getConsoleSender(),
                message: key,
                parameters,
                needsTranslation: true,
                type: ChatType.TRANSLATION
            })
        );
    }

    /**
     * This player's experience, as the level and the bar the client is sent, written through
     * setters the change log hears.
     */
    public getExperience(): ExperienceHolder {
        return this.components.experience();
    }

    /** This player's component fields as plain data, which the replay digest hashes. */
    public componentSnapshot(): PlainRecord {
        return this.components.snapshot();
    }

    /** Sets an attribute, through the component field it is kept in when it has one, so the write is logged. */
    public override setAttributeValue(name: string, value: number): boolean {
        const before = this.attributes.getValue(name);
        if (!this.components.setAttribute(name, value)) return super.setAttributeValue(name, value);
        return this.attributes.getValue(name) !== before;
    }

    /** Writes a logged component field back; any other field is a human's. */
    public override restoreLoggedField(field: string, value: PlainData): boolean {
        return this.components.restore(field, value) || super.restoreLoggedField(field, value);
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
                    : this.server.getWorldManager().getDefaultWorld(),
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
            // Logged, so the revival is in the change log: the player's health and the
            // component fields the attributes hold come back here, and the entity never left.
            const health = this.getHealth();
            this.components.reportingChanges(() => this.attributes.reset());
            logLegacyWrite(this, 'health', health, this.getHealth());
            this.components.set('vitals.air', this.metadata.maxAir);
            this.components.set('vitals.breathing', true);
            this.sentAir = this.metadata.air;
            this.sentBreathing = true;
            this.drowningTicks = 0;

            // A fresh body is not running, crouching, flying or sleeping, and carries no leftover hurt.
            // These survive a death because nothing resets them, and the client draws what it
            // is told: still red, still lying down.
            this.components.set('movement.sprinting', false);
            this.metadata.setPropertyValue(MetadataFlag.HURT_TIME, FlagType.INT, 0);
            this.metadata.setPropertyValue(MetadataFlag.HURT_DIRECTION, FlagType.INT, 0);
            this.sneaking = false;
            this.sleeping = false;
            this.flying = false;

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
        const damageSource = DamageSource.of(source);
        if (!this.isVulnerable() && !this.isReachedEvenWhenInvulnerable(damageSource)) return false;

        return super.damage(amount, damageSource);
    }

    /**
     * Whether a blow gets through to a player the world otherwise cannot hurt.
     *
     * Java's `#bypasses_invulnerability` tag, which is the void and `/kill`: a creative player
     * falls out of the world like anyone else. A spectator is beyond even those, as Java's
     * `isInvulnerableTo` answers before the tag is consulted.
     */
    private isReachedEvenWhenInvulnerable(source: DamageSource): boolean {
        return source.bypassesInvulnerability() && this.gamemode !== Gametype.SPECTATOR;
    }

    /**
     * Asks the client to shove the player, rather than shoving them.
     *
     * The one entity the server cannot simply move. A player's position comes from their own
     * client and is stored here as reported, so writing to it is overruled by the next movement
     * packet and shows up as rubber-banding. A velocity is a request the client honors, and it
     * runs the shove through the same physics as everything else the player does.
     *
     * Not awaited: knockback is a consequence of a hit, not a step of it, and the damage
     * pipeline has no reason to wait for a packet to be framed before taking the health off.
     * @param {number} directionX - Unit vector away from the blow, x.
     * @param {number} directionZ - Unit vector away from the blow, z.
     * @param {number} strength - How hard, with knockback resistance already taken off.
     */
    public override applyKnockback(directionX: number, directionZ: number, strength: number, _damping = 0.5): void {
        this.applyImpulse({ x: directionX * strength, y: KNOCKBACK_LIFT, z: directionZ * strength });
    }

    /**
     * Asks the client to apply a world-space impulse, including nonstandard vertical lift.
     *
     * Logged as an `impulse` occurrence and not as a velocity: the client owns a player's
     * movement (ADR 0008), so the shove is something replication sends, and the player's state
     * is unchanged until the client reports where it took them.
     */
    public override applyImpulse(impulse: EntityPosition): void {
        if (!this.connected) return;
        logLegacyImpulse(this, impulse);
        void this.getNetworkSession().sendMotion(new Vector3(impulse.x, impulse.y, impulse.z));
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
     * Ticks this player has to stand in a portal before going through.
     *
     * Vanilla reads `players_nether_portal_creative_delay` (0) for a creative player and
     * `players_nether_portal_default_delay` (80) for everyone else; the game rules are not
     * modeled yet, so the portal rule's defaults are the answer. An end portal's rule says 0
     * for both.
     * @param rule - The rule of the portal stood in. Without one, a nether portal is assumed.
     * @returns 0 in creative, otherwise the rule's survival delay, 80 for a nether portal.
     */
    public override getPortalTransitionTicks(rule?: PortalRule): number {
        const creative = this.gamemode === Gametype.CREATIVE;
        if (rule !== undefined) return creative ? rule.delayTicks.creative : rule.delayTicks.survival;
        return creative ? PORTAL_TRANSITION_TICKS.creative : PORTAL_TRANSITION_TICKS.player;
    }

    /**
     * How long this player refuses portals after a dimension change.
     *
     * Half a second, where a mob waits fifteen: `Player.getDimensionChangingDelay` in vanilla.
     * @returns 10 ticks.
     */
    public override getDefaultPortalCooldown(): number {
        return PORTAL_COOLDOWN_TICKS.player;
    }

    /**
     * Counts the portal cooldown down by one tick, unless the client is still loading into the
     * last dimension change.
     *
     * `ServerPlayer.processPortalCooldown` holds the count while `isChangingDimension`, so the
     * ten ticks only start once the loading screen has closed; a player who arrives inside the
     * destination portal then has them wound back every tick they stay in it.
     */
    protected override processPortalCooldown(): void {
        if (this.getNetworkSession().pendingDimensionChange() !== undefined) return;
        super.processPortalCooldown();
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
        this.components.set('vitals.saturation', Math.min(saturation, this.getFood()));
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
     * player.addExhaustion(0.1); // one meter sprinted
     * ```
     */
    public addExhaustion(amount: number): void {
        if (!this.consumesFood() || !this.isAlive() || amount <= 0) return;

        let exhaustion = this.components.get('vitals.exhaustion') + amount;

        while (exhaustion >= EXHAUSTION_PER_FOOD_POINT) {
            exhaustion -= EXHAUSTION_PER_FOOD_POINT;

            const saturation = this.getSaturation();
            if (saturation > 0) this.setSaturation(saturation - 1);
            else this.setFood(this.getFood() - 1);
        }

        this.components.set('vitals.exhaustion', exhaustion);
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

    public async setSprinting(sprinting: boolean): Promise<void> {
        if (sprinting === this.metadata.sprinting) return;

        const event = new PlayerToggleSprintEvent(this, sprinting);
        this.server.post(['playerToggleSprint', event]);
        if (event.isCanceled()) return;

        this.components.set('movement.sprinting', event.getIsSprinting());
        await this.getNetworkSession().sendMetadata();
    }

    public isFlying(): boolean {
        return this.flying;
    }
    public async setFlying(flying: boolean): Promise<void> {
        if (flying === this.isFlying()) return;

        if (!this.metadata.canFly) {
            this.flying = false;
            await this.sendSettings();
            return;
        }

        const event = new PlayerToggleFlightEvent(this, flying);
        this.server.post(['playerToggleFlight', event]);
        if (event.isCanceled()) return;

        this.flying = event.getIsFlying();
        await this.sendSettings();
    }

    public isSneaking(): boolean {
        return this.sneaking;
    }
    public async setSneaking(val: boolean): Promise<void> {
        if (val === this.sneaking) return;
        this.sneaking = val;
    }

    /** Whether the client has reported this player asleep in a bed. */
    public isSleeping(): boolean {
        return this.sleeping;
    }

    /** Records the client's bed-sleeping action for entity filters and goals. */
    public setSleeping(sleeping: boolean): void {
        this.sleeping = sleeping;
    }

    public isOnGround(): boolean {
        return this.onGround;
    }
    public async setOnGround(val: boolean): Promise<void> {
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
    private get fallDistance(): number {
        return this.components.get('vitals.fallDistance');
    }
    private set fallDistance(distance: number) {
        this.components.set('vitals.fallDistance', distance);
    }

    /**
     * The meal the player has started, or null.
     *
     * A client says when an eating begins and never when it ends, so the server counts the meal
     * out: it is over `ticks` after `startedAt`, if the same item is still in hand.
     */
    private consuming: { startedAt: number; ticks: number; item: string; finish: () => Promise<void> } | null = null;

    /**
     * Notes that the player has started eating or drinking what is in their hand.
     * @param {number} tick - The server tick it began on.
     * @param {number} ticks - How long the meal takes.
     * @param {() => Promise<void>} finish - What a finished meal does.
     */
    public beginConsuming(tick: number, ticks: number, finish: () => Promise<void>): void {
        const item = this.getInventory().getItemInHand().getName();
        // A held button makes the client report its use again part way through the meal, and
        // that is the same meal, not a new one that would start the clock over.
        if (this.consuming?.item === item) return;

        this.consuming = { startedAt: tick, ticks, item, finish };
    }

    /** Forgets an unfinished meal, as letting go of the button or putting the item away does. */
    public cancelConsuming(): void {
        this.consuming = null;
    }

    /** Finishes the meal once its time is up, unless another item is in hand by then. */
    private async tickConsuming(): Promise<void> {
        const meal = this.consuming;
        if (meal === null || this.server.getTick() - meal.startedAt < meal.ticks) return;

        this.consuming = null;
        if (this.getInventory().getItemInHand().getName() !== meal.item) return;
        await meal.finish();
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

            return breaksAFall(feet.name) || breaksAFall(below.name);
        } catch {
            // A chunk still loading, or a player off the edge of what is generated. Not being able
            // to answer is not a reason to hurt them - see `isHeadInWater`, which reasons the same
            // way about the other direction.
            return true;
        }
    }

    /**
     * Moves the player as an {@link Entity} move, which for a player is always a teleport.
     *
     * The client owns a player's movement (ADR 0008), so a move the server makes is a request
     * the client has to acknowledge, and the positions it reports until then are dropped
     * (`PlayerSession.acceptsClientPosition`). A `Normal` move would ask for no acknowledgment,
     * and the next stale report would put the player back.
     * @param {EntityPositionOptions} options - The position and rotation; `teleport` is ignored.
     * @returns {Promise<void>} A promise that resolves when the player's client has been told.
     * @remarks {@link Player.setPlayerPosition} takes the movement mode and the broadcast choice.
     */
    public override async setPosition({ teleport: _teleport, ...options }: EntityPositionOptions): Promise<void> {
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
        const previous = this.getPosition();

        // Entity broadcasts synchronously from this call. Store the reported rotation before
        // that broadcast builds the queued MoveActorAbsolute packet for observers.
        await super.setPosition({
            position,
            pitch,
            yaw,
            headYaw,
            teleport: type === PositionMode.Teleport || type === PositionMode.Respawn
        });

        // A reset or a teleport is not the player walking, so it costs nothing - and it must not
        // count as a fall either, or arriving anywhere below where you left would hurt.
        if (type === PositionMode.Normal) {
            this.addMovementExhaustion(previous, position);
            this.trackFall(previous, position);
        } else {
            this.fallDistance = 0;
        }

        if (!broadcast) return;
        await this.getNetworkSession().sendMove(this, type);
    }
}

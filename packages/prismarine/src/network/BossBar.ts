import BossEventPacket, {
    BossBarColor,
    BossBarOverlay,
    BossEventUpdateType
} from '@jsprismarine/protocol/packet/BossEventPacket';

import type Player from '../Player';

/**
 * The bars each player currently has on screen, so a serverbound `Query` can find the bar it
 * asks about. Weakly keyed: a player the server has let go takes its entries with it.
 */
const barsByPlayer = new WeakMap<Player, Set<BossBar>>();

/** What a new boss bar shows before anything updates it. The bar starts full. */
export interface BossBarOptions {
    /**
     * The actor the bar belongs to. The client binds the bar to this actor, so it must be one
     * the client tracks. Swap it later through `setActorUniqueId` when the bar has to follow a
     * re-spawned boss or a stand-in actor.
     */
    readonly actorUniqueId: bigint;
    /** The title shown above the bar. */
    readonly name: string;
    /** The bar's color. Defaults to pink, the wire default. */
    readonly color?: BossBarColor;
    /** How the bar is divided. Defaults to one undivided bar. */
    readonly overlay?: BossBarOverlay;
}

/**
 * One boss bar at the top of subscribed players' screens, driven over `BossEventPacket`.
 *
 * The bar holds its own state - actor, title, fill, color, overlay - and replays it to whoever
 * subscribes, so a player joining a fight in progress sees the same bar as everyone else.
 * Every event fills every packet field, as the flat layout since protocol 2193 requires. A
 * player who disconnects is dropped from the bar on the next send or `players()` call.
 */
export class BossBar {
    private actorUniqueId: bigint;
    private name: string;
    private percent = 1;
    private readonly color: BossBarColor;
    private readonly overlay: BossBarOverlay;
    private readonly subscribers = new Set<Player>();

    public constructor(options: BossBarOptions) {
        this.actorUniqueId = options.actorUniqueId;
        this.name = options.name;
        this.color = options.color ?? BossBarColor.Pink;
        this.overlay = options.overlay ?? BossBarOverlay.Progress;
    }

    /**
     * Shows the bar to a player with its current state. A player already subscribed is left
     * alone.
     */
    public async addPlayer(player: Player): Promise<void> {
        if (this.subscribers.has(player)) return;

        this.subscribers.add(player);
        let bars = barsByPlayer.get(player);
        if (!bars) barsByPlayer.set(player, (bars = new Set()));
        bars.add(this);

        await this.sendTo(player, BossEventUpdateType.Add);
    }

    /** Hides the bar from a player. A player the bar does not have is left alone. */
    public async removePlayer(player: Player): Promise<void> {
        if (!this.subscribers.delete(player)) return;

        barsByPlayer.get(player)?.delete(this);
        if (player.isOnline()) await this.sendTo(player, BossEventUpdateType.Remove);
    }

    /** Sets how full the bar is, clamped to 0..1, and updates every subscribed player. */
    public async setPercent(value: number): Promise<void> {
        this.percent = Math.min(1, Math.max(0, value));
        await this.broadcast(BossEventUpdateType.UpdatePercent);
    }

    /** Sets the title above the bar and updates every subscribed player. */
    public async setName(name: string): Promise<void> {
        this.name = name;
        await this.broadcast(BossEventUpdateType.UpdateName);
    }

    /**
     * Moves the bar onto another actor, for a bar that outlives the actor it was created with:
     * a boss that re-spawns under a new unique id, or a stand-in actor when the real one left
     * the client's tracking range. The client keys the bar by actor, so every subscribed
     * player gets a Remove for the old actor and an Add for the new one.
     */
    public async setActorUniqueId(actorUniqueId: bigint): Promise<void> {
        if (actorUniqueId === this.actorUniqueId) return;

        await this.broadcast(BossEventUpdateType.Remove);
        this.actorUniqueId = actorUniqueId;
        await this.broadcast(BossEventUpdateType.Add);
    }

    /** The players currently subscribed to the bar, with disconnected ones dropped. */
    public players(): readonly Player[] {
        this.prune();
        return [...this.subscribers];
    }

    /**
     * Answers a serverbound `Query` by resending the Add for the queried actor's bar to the
     * asking player. A query for an actor no bar of theirs is bound to goes unanswered.
     */
    public static async answerQuery(player: Player, actorUniqueId: bigint): Promise<void> {
        for (const bar of barsByPlayer.get(player) ?? []) {
            if (bar.actorUniqueId === actorUniqueId) await bar.sendTo(player, BossEventUpdateType.Add);
        }
    }

    /** Lets go of every subscriber whose player has disconnected. */
    private prune(): void {
        for (const player of this.subscribers) {
            if (player.isOnline()) continue;
            this.subscribers.delete(player);
            barsByPlayer.get(player)?.delete(this);
        }
    }

    private async broadcast(eventType: BossEventUpdateType): Promise<void> {
        this.prune();
        await Promise.all([...this.subscribers].map(async (player) => this.sendTo(player, eventType)));
    }

    private async sendTo(player: Player, eventType: BossEventUpdateType): Promise<void> {
        const packet = new BossEventPacket();
        packet.targetActorId = this.actorUniqueId;
        packet.eventType = eventType;
        packet.name = this.name;
        packet.filteredName = '';
        packet.healthPercent = this.percent;
        packet.color = this.color;
        packet.overlay = this.overlay;
        await player.getNetworkSession().send(packet);
    }
}

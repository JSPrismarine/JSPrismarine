import type { NetworkPacket } from '@jsprismarine/protocol';
import type { Walk } from '../../playerAuthInput';
import type Bot from '../Bot';
import type Random from '../Random';

export interface BehaviorContext {
    readonly bot: Bot;
    /** This bot's own generator, derived from the fleet seed and its index. */
    readonly random: Random;
    /** How many times this bot has ticked since it spawned. */
    readonly tick: number;
    send(packet: NetworkPacket<any>): Promise<void>;
    /**
     * Has the bot send its `PlayerAuthInput` for this tick, after every behavior has run, from
     * the pose the behaviors left it in. A real client sends one input per tick, so two
     * behaviors asking in the same tick still send one.
     * @param walk - How far the behavior moved the bot, when it walked.
     */
    input(walk?: Walk): void;
    /** Counted into the report, so a run can say what it actually did. */
    record(action: string): void;
}

/**
 * Something a bot does, once per tick.
 *
 * Small and composable on purpose: a load test is a question, and the question is usually
 * about one kind of traffic. "Two hundred clients walking" and "two hundred clients
 * chatting" load a server very differently, and being able to ask them separately is worth
 * more than a single realistic-looking simulation that mixes everything.
 *
 * A behavior must never throw for a reason it could have checked - a bot that dies takes
 * its connection out of the fleet and quietly changes what is being measured.
 */
export interface Behavior {
    readonly name: string;

    /** Called on every tick of the bot that owns it. */
    tick(context: BehaviorContext): void | Promise<void>;
}

import { Attributes } from '@jsprismarine/protocol/wire/structures/Attribute';
import { Metadata } from '@jsprismarine/protocol/wire/structures/Metadata';

import Player from '../Player';
import { LegacyPlayerBody } from '../entity/LegacyPlayerBody';
import { PlayerComponents } from '../entity/playerComponents';
import type { StubMembers } from './stub.test.helper';

/** What a player reads and writes of its body through an accessor, so a double's value for it is the body's. */
const BODY_STATE = new Set(['metadata', 'attributes', 'pitch', 'yaw', 'headYaw']);

/**
 * A player double built from `Player.prototype`, holding a body built from
 * `LegacyPlayerBody.prototype`. Neither constructor runs. A player reads its entity state through
 * its body, so what a constructed player would hold as an entity goes on the body: its
 * `position` and `runtimeId`, and any entity method the world, the index or the replicator calls
 * on it. The body gets fresh `metadata` and `attributes` when neither argument gives them.
 *
 * @param members - What the player answers, as `stubOf` takes it. A `metadata`, `attributes`,
 *   `pitch`, `yaw` or `headYaw` here goes on the body, which the player reads them from.
 * @param body - What the body holds. Its fields are the entity's own, several of them protected,
 *   so they are named loosely here, as `Object.assign` took them on a player before.
 * @returns The player.
 */
export const playerOnPrototype = (
    members: StubMembers<Player> = {},
    body: StubMembers<LegacyPlayerBody> | Record<string, unknown> = {}
): Player => {
    const entries = Object.entries(members);
    const player: Player = Object.create(Player.prototype);
    const legacyBody: LegacyPlayerBody = Object.assign(Object.create(LegacyPlayerBody.prototype), {
        metadata: new Metadata(),
        attributes: new Attributes(Attributes.getPlayerDefaults()),
        ...Object.fromEntries(entries.filter(([key]) => BODY_STATE.has(key))),
        ...body
    });
    Object.defineProperty(legacyBody, 'player', { value: player });
    Object.defineProperty(player, 'body', { value: legacyBody });
    return Object.assign(player, Object.fromEntries(entries.filter(([key]) => !BODY_STATE.has(key))));
};

/**
 * Gives a player double built from `Player.prototype` the component state a constructed player
 * has. Such a double skips the constructor, and a player's vitals, flags and experience read and
 * write through that state, which its body keeps. Its writes reach no change log.
 *
 * @param player - The double, from {@link playerOnPrototype}.
 * @param attributes - Where its food and experience live: the body's own attributes by default.
 * @returns The same double.
 */
export const withPlayerComponents = <T extends Player>(player: T, attributes: Attributes = player.attributes): T => {
    Object.defineProperty(player.getBody(), 'components', {
        value: new PlayerComponents(attributes, () => {}, player.metadata)
    });
    return player;
};

/**
 * The experience a plain player stub answers `getExperience` with, kept in `attributes` as a
 * constructed player keeps it.
 */
export const experienceIn = (attributes: Attributes) => new PlayerComponents(attributes, () => {}).experience();

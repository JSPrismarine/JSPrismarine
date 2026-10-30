/**
 * `GameRulesChangedPacket`: the rules whose values changed, described as a declarative field
 * list; layout unchanged between protocols 2193 and 2225.
 *
 * This definition lives beside the class because the `GameRule` structure and its codecs are
 * prismarine-owned (`../type/GameRule`, shared with `StartGamePacket`); it moves to
 * `@jsprismarine/protocol`'s registry when they do.
 * {@link https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/game-rules-changed-packet/}
 */
import { definePacket, t } from '@jsprismarine/protocol';
import { readGameRule, writeGameRule } from '../type/GameRule';

import type { GameRule } from '../type/GameRule';

/**
 * One `GameRule` entry: name, whether the player may modify it, then the tagged value, bridged
 * from the hand-written codec pair in `../type/GameRule`.
 */
const gameRule = t.custom<GameRule>(
    'GameRule',
    (stream, value) => writeGameRule(stream, value),
    (stream) => readGameRule(stream)
);

/** The `GameRulesChangedPacket` field list; the class doc carries the wire provenance. */
export const gameRulesChangedPacket = definePacket('GameRulesChangedPacket', {
    /** `Rule Data`: a varuint32 count, then one {@link gameRule} each. */
    rulesList: t.list(gameRule)
});

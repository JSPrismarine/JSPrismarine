/**
 * The game rules whose values changed during a session. Entries use the same `GameRule`
 * structure that `StartGamePacket` uses for the initial world settings.
 *
 * The `GameRule` structure and its codecs are shared with `StartGamePacket`.
 * {@link https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/game-rules-changed-packet/}
 */
import { definePacket } from '../define';
import * as t from '../fieldTypes';
import { readGameRule, writeGameRule } from '../structures/GameRule';

import type { GameRule } from '../structures/GameRule';

/**
 * One `GameRule` entry: name, whether the player may modify it, then the tagged value, bridged
 * from the hand-written codec pair in `../structures/GameRule`.
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

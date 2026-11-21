/**
 * What kind of value a game rule carries, which is written in front of the value.
 *
 * Lives in its own module so the wire definition and `StartGamePacket` can both use it without
 * importing each other.
 */
export enum GameRuleType {
    NONE = 0,
    BOOL = 1,
    INT = 2,
    FLOAT = 3
}

import StartGamePacket from './StartGamePacket';

import type NetworkBinaryStream from '../NetworkBinaryStream';
import type { StartGame } from './StartGamePacket';

/**
 * `EditorLevelMigrationVersion`: which editor level migrations a world has had applied.
 * Protocol 2225 values, from the v1.26.60 `metadata.zip` schema.
 */
export enum EditorLevelMigrationVersion {
    Legacy = 0,
    EditorAchievements = 1
}

/**
 * `StartGamePacket` at protocol 2225, which inserts one field into the 2193 layout:
 * `Editor Level Migration Version` as a plain int8 between `Is Exported From Editor` and
 * `Day Cycle Stop Time`, so every later level-settings field moves one field later.
 *
 * Verified against the v1.26.60 `metadata.zip` (`LevelSettings.json`, ordinal 11, the only
 * added field) and gophertunnel's `StartGame.Marshal` at v1.63.0, which agree. Nothing else
 * in the packet changed, which is why this is a subclass over two hooks rather than a copy.
 *
 * A client that reads a 2225 server's `StartGamePacket` with the 2193 layout is one byte out
 * from this field on, so its block properties come back as nonsense - which is what the
 * Bedrock capture tool needs this class for.
 */
export default class StartGamePacket2225 extends StartGamePacket {
    protected override serializeEditorLevelMigrationVersion(stream: NetworkBinaryStream, data: StartGame): void {
        stream.writeSignedByte(data.editorLevelMigrationVersion ?? EditorLevelMigrationVersion.Legacy);
    }

    protected override deserializeEditorLevelMigrationVersion(stream: NetworkBinaryStream): number {
        return stream.readSignedByte();
    }
}

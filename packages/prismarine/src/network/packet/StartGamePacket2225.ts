import { minecraftVersions } from '../codec/v2225';
import StartGamePacket from './StartGamePacket';

/**
 * The docs' `EditorLevelMigrationVersion`: which editor level migrations a world has had
 * applied. Protocol 2225 values, from the v1.26.60 `metadata.zip` schema.
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
 * added field) and gophertunnel's `StartGame.Marshal` at v1.63.0
 * (`io.Int8(&pk.EditorLevelMigrationVersion)` after `ExportedFromEditor`), which agree.
 * Nothing else changed.
 */
export default class StartGamePacket2225 extends StartGamePacket {
    /** Editor Level Migration Version, an {@link EditorLevelMigrationVersion} int8. */
    public editorLevelMigrationVersion: number = EditorLevelMigrationVersion.Legacy;

    /** The base packet's name, so handlers and name-keyed id lookups never see the version suffix. */
    public override getName(): string {
        return 'StartGamePacket';
    }

    protected override encodeEditorLevelMigrationVersion(): void {
        this.writeSignedByte(this.editorLevelMigrationVersion);
    }

    protected override decodeEditorLevelMigrationVersion(): void {
        this.editorLevelMigrationVersion = this.readSignedByte();
    }

    protected override gameVersion(): string {
        return minecraftVersions.at(-1) ?? '';
    }
}

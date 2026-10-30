/**
 * Re-export: `mce::UUID` is a wire structure and lives in `@jsprismarine/protocol`.
 *
 * This path stays so the server's many importers keep working.
 */
export { default } from '@jsprismarine/protocol/wire/structures/UUID';
export * from '@jsprismarine/protocol/wire/structures/UUID';

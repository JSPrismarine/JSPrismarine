/**
 * Which alternative of the `Data` variant a `SyncWorldClocksPacket` carries. The value is the
 * alternative's index in the schema's `oneOf`, written as the varuint32 selector on the wire.
 *
 * Lives in its own module so the wire definition and `SyncWorldClocksPacket` can both use it
 * without importing each other.
 */
export enum SyncWorldClocksDataType {
    /** `SyncStateData`: the current time and paused flag of every clock. */
    SyncState = 0,
    /** `InitializeRegistryData`: the full definition of every clock, sent on join. */
    InitializeRegistry = 1,
    /** `AddTimeMarkerData`: new time markers for one clock. */
    AddTimeMarker = 2,
    /** `RemoveTimeMarkerData`: time marker ids removed from one clock. */
    RemoveTimeMarker = 3
}

import { layoutAt, setDisplayObjectivePacket } from '@jsprismarine/protocol';

import FieldNetworkPacket from '@jsprismarine/protocol/FieldNetworkPacket';

/** Which way the client orders an objective's lines, as the `SortOrder` ZigZag varint32 numbers it. */
export enum ObjectiveSortOrder {
    Ascending = 0,
    Descending = 1
}

/**
 * Registers a scoreboard objective and places it in one of the client's display slots.
 *
 * The slot names vanilla uses are `list`, `sidebar` and `belowname`. Scores for the objective
 * arrive afterwards in `SetScorePacket`, keyed by the Objective Name set here.
 *
 * **Bound To:** Client
 *
 * The wire layout lives in `@jsprismarine/protocol`'s `setDisplayObjectivePacket` definition:
 * DisplaySlotName, ObjectiveName, ObjectiveDisplayName and CriteriaName as strings, then
 * SortOrder as a ZigZag varint32.
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/set-display-objective-packet/
 */
export default class SetDisplayObjectivePacket extends FieldNetworkPacket {
    /** Where the objective is shown: `list`, `sidebar` or `belowname`. */
    public displaySlotName = '';

    /** Name the scores refer to the objective by. */
    public objectiveName = '';

    /** Title shown above the objective. */
    public objectiveDisplayName = '';

    /** Always `dummy` in vanilla; the client tracks no criteria itself. */
    public criteriaName = 'dummy';

    public sortOrder: ObjectiveSortOrder = ObjectiveSortOrder.Ascending;

    /** Reads the slot, the two names, the criteria and the sort order. */
    public decodePayload(): void {
        const read = layoutAt(setDisplayObjectivePacket, this.codecProtocol).decode(this);
        this.displaySlotName = read.displaySlotName;
        this.objectiveName = read.objectiveName;
        this.objectiveDisplayName = read.objectiveDisplayName;
        this.criteriaName = read.criteriaName;
        this.sortOrder = read.sortOrder;
    }

    /** Writes the slot, the two names, the criteria and the sort order. */
    public encodePayload(): void {
        layoutAt(setDisplayObjectivePacket, this.codecProtocol).encode(this, {
            displaySlotName: this.displaySlotName,
            objectiveName: this.objectiveName,
            objectiveDisplayName: this.objectiveDisplayName,
            criteriaName: this.criteriaName,
            sortOrder: this.sortOrder
        });
    }
}

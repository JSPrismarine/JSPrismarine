/**
 * Who rides whom.
 *
 * Riding is a relation rather than a fact about one entity, and both ends are
 * read: `minecraft:behavior.find_mount` asks what the entity rides and
 * `minecraft:behavior.player_ride_tamed` asks who rides it. Keeping the two
 * directions in one index is what stops them disagreeing, which is the bug a
 * field on each body would have.
 *
 * A rider is a runtime id and nothing more, so a player rides a pig through
 * the same index a zombie rides a chicken through.
 */

/** Every rider and vehicle of one dimension. */
export class RideIndex {
    /** The vehicle each rider is on. */
    private readonly vehicles = new Map<number, number>();

    /** The riders of each vehicle, in the order they got on. */
    private readonly riders = new Map<number, number[]>();

    /** What an entity rides, or undefined when it rides nothing. */
    public vehicleOf(rider: number): number | undefined {
        return this.vehicles.get(rider);
    }

    /** Who rides an entity, in the order they got on. */
    public ridersOf(vehicle: number): readonly number[] {
        return this.riders.get(vehicle) ?? [];
    }

    /**
     * Puts a rider on a vehicle, taking it off whatever it was on first.
     *
     * @returns Whether the rider got on; it does not when it is already on
     *   that vehicle, or when the two are the same entity.
     */
    public mount(rider: number, vehicle: number): boolean {
        if (rider === vehicle) return false;
        if (this.vehicles.get(rider) === vehicle) return false;

        this.dismount(rider);
        this.vehicles.set(rider, vehicle);
        this.riders.set(vehicle, [...this.ridersOf(vehicle), rider]);
        return true;
    }

    /**
     * Takes a rider off whatever it rides.
     *
     * @returns The vehicle it was on, or undefined when it was on nothing.
     */
    public dismount(rider: number): number | undefined {
        const vehicle = this.vehicles.get(rider);
        if (vehicle === undefined) return undefined;

        this.vehicles.delete(rider);
        const remaining = this.ridersOf(vehicle).filter((other) => other !== rider);
        if (remaining.length === 0) this.riders.delete(vehicle);
        else this.riders.set(vehicle, remaining);
        return vehicle;
    }

    /** Takes an entity out of the index, both as a rider and as a vehicle. */
    public remove(id: number): void {
        this.dismount(id);
        for (const rider of this.ridersOf(id)) this.vehicles.delete(rider);
        this.riders.delete(id);
    }
}

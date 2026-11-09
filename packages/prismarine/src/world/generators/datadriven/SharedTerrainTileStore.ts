/**
 * A bounded, process-local cache for immutable terrain-status tiles shared by worker threads.
 *
 * Each slot holds one V8-serialized region payload. A worker claims a slot with an atomic owner
 * token, writes the key and payload while the slot is hidden, then publishes `READY` last. The
 * parent clears claims only after the owning worker exits, so a slow live worker is never
 * mistaken for an abandoned one.
 */
import { deserialize, serialize } from 'node:v8';

import type { GenerationRegionPayload } from './GenerationRegion';

const MAGIC = 0x4a53_5054;
const VERSION = 1;
const HEADER_WORDS = 12;
const SLOT_WORDS = 12;
const SLOT_BYTES = SLOT_WORDS * Int32Array.BYTES_PER_ELEMENT;
const HEADER_BYTES = HEADER_WORDS * Int32Array.BYTES_PER_ELEMENT;
const EMPTY = 0;
const READY = -1;
const TOMBSTONE = -2;
const RECOVERING = -3;
const MAX_OWNER_THREAD_ID = 0x7fff_fffe;

/** Maximum allocation for a shared store, including slot metadata. */
export interface SharedTerrainTileStoreOptions {
    /** Hard cap for the shared-memory allocation, including metadata. */
    readonly maxBytes: number;
    /** Maximum serialized bytes for one terrain tile; larger tiles still generate normally. */
    readonly maxTileBytes: number;
}

/** Counters for cache behavior and memory measurements. */
export interface SharedTerrainTileStoreStats {
    /** Number of successful reads from published slots. */
    readonly hits: number;
    /** Number of terrain builds started by this store, including local fallbacks. */
    readonly builds: number;
    /** Number of times a worker waited on another worker's claim. */
    readonly waits: number;
    /** Number of builds that fell back because every slot was occupied. */
    readonly fullFallbacks: number;
    /** Number of generated tiles too large for one slot. */
    readonly oversized: number;
    /** Number of claims cleared after their worker exited. */
    readonly recoveredClaims: number;
    /** Serialized bytes published to shared slots. */
    readonly bytesWritten: number;
}

/**
 * Shares a fixed number of immutable terrain tiles across workers, then falls back to local work.
 *
 * Create one instance in the parent and pass it to `DataDrivenGenerator`. Worker pipelines build
 * their own view from {@link SharedTerrainTileStore.buffer}. The allocation never grows, and a
 * full store does not evict live entries: callers build uncached tiles instead.
 */
export class SharedTerrainTileStore {
    private readonly words: Int32Array;
    private readonly bytes: Uint8Array;
    private readonly sharedBuffer: SharedArrayBuffer;
    private readonly slotCount: number;
    private readonly slotBytes: number;
    private readonly metadataBytes: number;
    private readonly buildsInFlight = new Map<string, Promise<GenerationRegionPayload>>();

    /**
     * Creates a bounded store or attaches to the buffer supplied by its parent thread.
     *
     * @param optionsOrBuffer - Allocation limits in the parent, or the existing shared buffer in
     *   a worker.
     * @throws RangeError when the limits cannot hold one slot or the supplied buffer is invalid.
     */
    public constructor(optionsOrBuffer: SharedTerrainTileStoreOptions | SharedArrayBuffer) {
        if (optionsOrBuffer instanceof SharedArrayBuffer) {
            const words = new Int32Array(optionsOrBuffer);
            if (
                words.length < HEADER_WORDS ||
                Atomics.load(words, 0) !== MAGIC ||
                Atomics.load(words, 1) !== VERSION ||
                Atomics.load(words, 2) < 1 ||
                Atomics.load(words, 3) < 1
            ) {
                throw new RangeError('Shared terrain tile store buffer has an unsupported header');
            }
            this.words = words;
            this.slotCount = Atomics.load(words, 2);
            this.slotBytes = Atomics.load(words, 3);
            this.metadataBytes = HEADER_BYTES + this.slotCount * SLOT_BYTES;
            const expectedBytes = this.metadataBytes + this.slotCount * this.slotBytes;
            if (optionsOrBuffer.byteLength !== expectedBytes) {
                throw new RangeError('Shared terrain tile store buffer has an invalid size');
            }
            this.sharedBuffer = optionsOrBuffer;
            this.bytes = new Uint8Array(optionsOrBuffer);
            return;
        }

        const { maxBytes, maxTileBytes } = optionsOrBuffer;
        if (
            !Number.isSafeInteger(maxBytes) ||
            maxBytes < 1 ||
            !Number.isSafeInteger(maxTileBytes) ||
            maxTileBytes < 1 ||
            maxTileBytes > 0x7fff_ffff
        ) {
            throw new RangeError('Shared terrain tile store limits must be positive safe integers');
        }
        const capacity = Math.floor((maxBytes - HEADER_BYTES) / (SLOT_BYTES + maxTileBytes));
        if (capacity < 1) throw new RangeError('Shared terrain tile store maxBytes cannot hold one tile slot');

        this.slotCount = capacity;
        this.slotBytes = maxTileBytes;
        this.metadataBytes = HEADER_BYTES + capacity * SLOT_BYTES;
        const buffer = new SharedArrayBuffer(this.metadataBytes + capacity * maxTileBytes);
        this.words = new Int32Array(buffer);
        this.words[0] = MAGIC;
        this.words[1] = VERSION;
        this.words[2] = capacity;
        this.words[3] = maxTileBytes;
        this.sharedBuffer = buffer;
        this.bytes = new Uint8Array(buffer);
    }

    /** The fixed shared-memory allocation that workers attach to. */
    public get buffer(): SharedArrayBuffer {
        return this.sharedBuffer;
    }

    /** Number of terrain tiles the allocation can hold. */
    public get capacity(): number {
        return this.slotCount;
    }

    /** Total allocation size, including metadata. */
    public get byteLength(): number {
        return this.bytes.byteLength;
    }

    /** Maximum serialized size of one terrain tile. */
    public get maxTileBytes(): number {
        return this.slotBytes;
    }

    /** Reads or builds a tile, publishing completed payload bytes atomically. */
    public async getOrCreate(
        key: string,
        ownerThreadId: number,
        build: () => Promise<GenerationRegionPayload>
    ): Promise<GenerationRegionPayload> {
        if (!/^[a-f0-9]{64}$/.test(key)) throw new TypeError('Shared terrain tile keys must be SHA-256 hex digests');
        validateOwnerThreadId(ownerThreadId);

        const pending = this.buildsInFlight.get(key);
        if (pending !== undefined) return pending;

        const operation = this.getOrCreateUncoalesced(key, ownerThreadId, build);
        this.buildsInFlight.set(key, operation);
        try {
            return await operation;
        } finally {
            if (this.buildsInFlight.get(key) === operation) this.buildsInFlight.delete(key);
        }
    }

    /** Clears claims held by a worker after its exit event; published tiles remain available. */
    public recoverOwner(ownerThreadId: number): number {
        validateOwnerThreadId(ownerThreadId);
        const owner = ownerThreadId + 1;
        let recovered = 0;
        for (let slot = 0; slot < this.slotCount; slot++) {
            const stateIndex = this.slotIndex(slot);
            if (Atomics.compareExchange(this.words, stateIndex, owner, RECOVERING) !== owner) continue;
            Atomics.store(this.words, stateIndex + 2, 0);
            Atomics.store(this.words, stateIndex + 1, 0);
            Atomics.store(this.words, stateIndex, TOMBSTONE);
            Atomics.add(this.words, 9, 1);
            Atomics.notify(this.words, stateIndex);
            Atomics.notify(this.words, stateIndex + 2);
            recovered++;
        }
        return recovered;
    }

    /** Removes a malformed published value so the next caller can rebuild it. */
    public invalidate(key: string): boolean {
        if (!/^[a-f0-9]{64}$/.test(key)) return false;
        const digest = digestWords(key);
        for (let slot = 0; slot < this.slotCount; slot++) {
            const stateIndex = this.slotIndex(slot);
            if (Atomics.load(this.words, stateIndex) !== READY || !this.matches(slot, digest)) continue;
            const generation = Atomics.load(this.words, stateIndex + 11);
            if (this.invalidateSlot(slot, digest, generation)) return true;
        }
        return false;
    }

    /** Reads counters and the allocation's fixed capacity. */
    public getStats(): SharedTerrainTileStoreStats {
        return {
            hits: Atomics.load(this.words, 4),
            builds: Atomics.load(this.words, 5),
            waits: Atomics.load(this.words, 6),
            fullFallbacks: Atomics.load(this.words, 7),
            oversized: Atomics.load(this.words, 8),
            recoveredClaims: Atomics.load(this.words, 9),
            bytesWritten: Atomics.load(this.words, 10)
        };
    }

    private async getOrCreateUncoalesced(
        key: string,
        ownerThreadId: number,
        build: () => Promise<GenerationRegionPayload>
    ): Promise<GenerationRegionPayload> {
        const digest = digestWords(key);
        const owner = ownerThreadId + 1;

        while (true) {
            let freeSlot = -1;
            let freeState = EMPTY;
            let matchingClaim = -1;
            let initializingClaim = -1;
            let sameOwnerClaim = false;

            for (let slot = 0; slot < this.slotCount; slot++) {
                const stateIndex = this.slotIndex(slot);
                const state = Atomics.load(this.words, stateIndex);
                if (state === READY && this.matches(slot, digest)) {
                    const generation = Atomics.load(this.words, stateIndex + 11);
                    const payload = this.readPayload(slot, digest, generation);
                    if (payload !== undefined) {
                        Atomics.add(this.words, 4, 1);
                        return payload;
                    }
                    this.invalidateSlot(slot, digest, generation);
                    continue;
                }
                if (state > 0) {
                    if (Atomics.load(this.words, stateIndex + 2) === 0) {
                        initializingClaim = slot;
                    } else if (this.matches(slot, digest)) {
                        if (state === owner) sameOwnerClaim = true;
                        else matchingClaim = slot;
                    }
                } else if ((state === EMPTY || state === TOMBSTONE) && freeSlot < 0) {
                    freeSlot = slot;
                    freeState = state;
                }
            }

            if (sameOwnerClaim) return this.buildUncached(build);
            if (matchingClaim >= 0) {
                Atomics.add(this.words, 6, 1);
                await this.waitForChange(matchingClaim);
                continue;
            }
            if (initializingClaim >= 0) {
                await this.waitForInitialization(initializingClaim);
                continue;
            }
            if (freeSlot >= 0) {
                const stateIndex = this.slotIndex(freeSlot);
                if (Atomics.compareExchange(this.words, stateIndex, freeState, owner) !== freeState) continue;
                Atomics.add(this.words, stateIndex + 11, 1);
                for (let index = 0; index < digest.length; index++) {
                    Atomics.store(this.words, stateIndex + 3 + index, digest[index]!);
                }
                Atomics.store(this.words, stateIndex + 1, 0);
                Atomics.store(this.words, stateIndex + 2, 1);
                Atomics.notify(this.words, stateIndex + 2);
                return this.buildAndPublish(freeSlot, owner, build);
            }

            Atomics.add(this.words, 7, 1);
            return this.buildUncached(build);
        }
    }

    private async buildAndPublish(
        slot: number,
        owner: number,
        build: () => Promise<GenerationRegionPayload>
    ): Promise<GenerationRegionPayload> {
        Atomics.add(this.words, 5, 1);
        let payload: GenerationRegionPayload;
        try {
            payload = await build();
        } catch (error) {
            this.releaseClaim(slot, owner);
            throw error;
        }

        let serialized: Buffer;
        try {
            if (!isTerrainPayload(payload))
                throw new TypeError('A shared terrain tile builder returned an invalid payload');
            serialized = serialize(payload);
        } catch {
            this.releaseClaim(slot, owner);
            return payload;
        }

        const stateIndex = this.slotIndex(slot);
        if (serialized.byteLength > this.slotBytes) {
            Atomics.add(this.words, 8, 1);
            this.releaseClaim(slot, owner);
            return payload;
        }
        if (Atomics.load(this.words, stateIndex) !== owner) return payload;

        // The slot stays claimed while bytes are copied. Readers ignore its payload until this
        // release-store publishes READY, so no worker can deserialize a partial region.
        this.bytes.set(serialized, this.payloadOffset(slot));
        Atomics.store(this.words, stateIndex + 1, serialized.byteLength);
        Atomics.add(this.words, 10, serialized.byteLength);
        Atomics.store(this.words, stateIndex, READY);
        Atomics.notify(this.words, stateIndex);
        return payload;
    }

    private async buildUncached(build: () => Promise<GenerationRegionPayload>): Promise<GenerationRegionPayload> {
        Atomics.add(this.words, 5, 1);
        return build();
    }

    private readPayload(slot: number, digest: Int32Array, generation: number): GenerationRegionPayload | undefined {
        const stateIndex = this.slotIndex(slot);
        if (
            Atomics.load(this.words, stateIndex) !== READY ||
            Atomics.load(this.words, stateIndex + 11) !== generation ||
            !this.matches(slot, digest)
        ) {
            return undefined;
        }
        const length = Atomics.load(this.words, stateIndex + 1);
        if (length < 1 || length > this.slotBytes) return undefined;
        try {
            const start = this.payloadOffset(slot);
            const serialized = Buffer.from(this.bytes.subarray(start, start + length));
            if (
                Atomics.load(this.words, stateIndex) !== READY ||
                Atomics.load(this.words, stateIndex + 11) !== generation ||
                !this.matches(slot, digest)
            ) {
                return undefined;
            }
            const value: unknown = deserialize(serialized);
            return isTerrainPayload(value) ? value : undefined;
        } catch {
            return undefined;
        }
    }

    private releaseClaim(slot: number, owner: number): void {
        const stateIndex = this.slotIndex(slot);
        if (Atomics.load(this.words, stateIndex) !== owner) return;
        Atomics.store(this.words, stateIndex + 2, 0);
        Atomics.store(this.words, stateIndex + 1, 0);
        if (Atomics.compareExchange(this.words, stateIndex, owner, EMPTY) !== owner) return;
        Atomics.notify(this.words, stateIndex);
        Atomics.notify(this.words, stateIndex + 2);
    }

    private invalidateSlot(slot: number, digest: Int32Array, generation: number): boolean {
        const stateIndex = this.slotIndex(slot);
        if (Atomics.compareExchange(this.words, stateIndex, READY, RECOVERING) !== READY) return false;
        if (Atomics.load(this.words, stateIndex + 11) !== generation || !this.matches(slot, digest)) {
            Atomics.store(this.words, stateIndex, READY);
            Atomics.notify(this.words, stateIndex);
            return false;
        }
        Atomics.store(this.words, stateIndex + 1, 0);
        Atomics.store(this.words, stateIndex + 2, 0);
        Atomics.store(this.words, stateIndex, TOMBSTONE);
        Atomics.notify(this.words, stateIndex);
        Atomics.notify(this.words, stateIndex + 2);
        return true;
    }

    /**
     * Waits until another owner changes a slot's state, or 100 ms pass.
     *
     * `Atomics.waitAsync` rather than `Atomics.wait`: a blocking wait holds the whole thread, so
     * an owner on the same thread, or any other task the thread runs, could not finish the build
     * being waited for until the timeout. Every write to a watched word notifies, so the wait
     * ends as soon as the slot changes, on the main thread and in a worker alike.
     */
    private async waitForChange(slot: number): Promise<void> {
        const stateIndex = this.slotIndex(slot);
        await this.waitWhile(stateIndex, Atomics.load(this.words, stateIndex));
    }

    /** Waits until a claimed slot records its owner's digest, or 100 ms pass. */
    private async waitForInitialization(slot: number): Promise<void> {
        await this.waitWhile(this.slotIndex(slot) + 2, 0);
    }

    /** Resolves once `words[index]` stops holding `expected`, or after 100 ms. */
    private async waitWhile(index: number, expected: number): Promise<void> {
        const wait = Atomics.waitAsync(this.words, index, expected, 100);
        if (wait.async) await wait.value;
    }

    private matches(slot: number, digest: Int32Array): boolean {
        const start = this.slotIndex(slot) + 3;
        for (let index = 0; index < digest.length; index++) {
            if (Atomics.load(this.words, start + index) !== digest[index]) return false;
        }
        return true;
    }

    private slotIndex(slot: number): number {
        return HEADER_WORDS + slot * SLOT_WORDS;
    }

    private payloadOffset(slot: number): number {
        return this.metadataBytes + slot * this.slotBytes;
    }
}

const digestWords = (digest: string): Int32Array => {
    const words = new Int32Array(8);
    for (let index = 0; index < words.length; index++) {
        words[index] = Number.parseInt(digest.slice(index * 8, index * 8 + 8), 16) | 0;
    }
    return words;
};

const validateOwnerThreadId = (ownerThreadId: number): void => {
    // Slot states are Int32 values; reserving zero and the negative markers leaves this range
    // for owner tokens without allowing an ID to wrap into READY or a tombstone.
    if (!Number.isSafeInteger(ownerThreadId) || ownerThreadId < 0 || ownerThreadId > MAX_OWNER_THREAD_ID) {
        throw new RangeError('Shared terrain tile owner thread IDs must fit a positive Int32 owner token');
    }
};

const isTerrainPayload = (value: unknown): value is GenerationRegionPayload => {
    if (typeof value !== 'object' || value === null) return false;
    return (
        'chunkX' in value &&
        typeof value.chunkX === 'number' &&
        'chunkZ' in value &&
        typeof value.chunkZ === 'number' &&
        'minY' in value &&
        typeof value.minY === 'number' &&
        'height' in value &&
        typeof value.height === 'number' &&
        'radius' in value &&
        value.radius === 0 &&
        'palette' in value &&
        Array.isArray(value.palette) &&
        'states' in value &&
        value.states instanceof ArrayBuffer &&
        'highest' in value &&
        value.highest instanceof ArrayBuffer &&
        'blockEntities' in value &&
        Array.isArray(value.blockEntities) &&
        'entitySpawns' in value &&
        Array.isArray(value.entitySpawns)
    );
};

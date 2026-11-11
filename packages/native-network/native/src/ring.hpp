// A bounded single-producer, single-consumer byte queue in the memory layout of SharedByteRing in
// @jsprismarine/raknet, so either side of a ring can be native code or JavaScript.
//
// Eight int32 control slots, then the bytes:
//   0 write cursor, 1 read cursor, 2 high-water mark, 3 full writes, 4 wake pending, 5-7 reserved.
// Each record is a little-endian u32 length and the record's bytes, wrapping at the capacity.
// The cursors count bytes from the start and wrap at 2^32; the capacity is a power of two, so a
// cursor's position stays continuous across that wrap.
#pragma once

#include <atomic>
#include <cstddef>
#include <cstdint>
#include <cstring>

namespace jsp {

inline constexpr int32_t RING_CONTROL_SLOTS = 8;
inline constexpr int32_t RING_CONTROL_BYTES = RING_CONTROL_SLOTS * 4;
inline constexpr int32_t RING_RECORD_LENGTH_BYTES = 4;

enum RingSlot : int { WRITE = 0, READ = 1, HIGH_WATER = 2, FULL_WRITES = 3, WAKE_PENDING = 4 };

class Ring {
public:
	Ring() = default;

	/** Attaches to memory of RING_CONTROL_BYTES plus a power-of-two capacity; false when it is not. */
	bool attach(uint8_t *memory, int32_t size) {
		if (memory == nullptr || size <= RING_CONTROL_BYTES) return false;
		if (reinterpret_cast<uintptr_t>(memory) % alignof(int32_t) != 0) return false;
		const uint32_t capacity = static_cast<uint32_t>(size - RING_CONTROL_BYTES);
		if ((capacity & (capacity - 1)) != 0) return false;
		mControl = reinterpret_cast<int32_t *>(memory);
		mBytes = memory + RING_CONTROL_BYTES;
		mCapacity = capacity;
		return true;
	}

	bool attached() const { return mControl != nullptr; }

	/** Copies a record made of a header and a body in; false, and a full write counted, when it does not fit. */
	bool write(const uint8_t *header, uint32_t headerSize, const uint8_t *body, uint32_t bodySize) {
		const uint32_t length = headerSize + bodySize;
		const uint32_t total = RING_RECORD_LENGTH_BYTES + length;
		const uint32_t writeAt = static_cast<uint32_t>(slot(WRITE).load());
		const uint32_t readAt = static_cast<uint32_t>(slot(READ).load());
		const uint32_t used = writeAt - readAt;
		if (total > mCapacity || used > mCapacity || total > mCapacity - used) {
			slot(FULL_WRITES).fetch_add(1);
			return false;
		}

		uint8_t lengthBytes[4] = {static_cast<uint8_t>(length), static_cast<uint8_t>(length >> 8),
		                          static_cast<uint8_t>(length >> 16), static_cast<uint8_t>(length >> 24)};
		copyIn(writeAt, lengthBytes, 4);
		copyIn(writeAt + 4, header, headerSize);
		copyIn(writeAt + 4 + headerSize, body, bodySize);
		// Published after every byte is copied, so the consumer never sees half a record.
		slot(WRITE).store(static_cast<int32_t>(writeAt + total));
		if (static_cast<int32_t>(used + total) > slot(HIGH_WATER).load()) {
			slot(HIGH_WATER).store(static_cast<int32_t>(used + total));
		}
		return true;
	}

	/**
	 * Copies the oldest record out and removes it. Returns its length, 0 when the ring is empty, or
	 * -length when out cannot hold it, leaving it in place.
	 */
	int64_t read(uint8_t *out, uint32_t outSize) {
		const uint32_t writeAt = static_cast<uint32_t>(slot(WRITE).load());
		const uint32_t readAt = static_cast<uint32_t>(slot(READ).load());
		const uint32_t available = writeAt - readAt;
		if (available < RING_RECORD_LENGTH_BYTES) return 0;
		uint8_t lengthBytes[4];
		copyOut(readAt, lengthBytes, 4);
		const uint32_t length = static_cast<uint32_t>(lengthBytes[0]) | (static_cast<uint32_t>(lengthBytes[1]) << 8) |
		                        (static_cast<uint32_t>(lengthBytes[2]) << 16) |
		                        (static_cast<uint32_t>(lengthBytes[3]) << 24);
		if (length > mCapacity - RING_RECORD_LENGTH_BYTES || available < RING_RECORD_LENGTH_BYTES + length) return 0;
		if (length > outSize) return -static_cast<int64_t>(length);
		copyOut(readAt + 4, out, length);
		slot(READ).store(static_cast<int32_t>(readAt + RING_RECORD_LENGTH_BYTES + length));
		return length;
	}

	/** Marks a wake as pending, and returns whether the consumer was idle, so this caller must wake it. */
	bool claimWake() { return slot(WAKE_PENDING).exchange(1) == 0; }

	/** Called by the consumer before it drains: the next write wakes it again. */
	void clearWake() { slot(WAKE_PENDING).store(0); }

private:
	std::atomic_ref<int32_t> slot(int index) const { return std::atomic_ref<int32_t>(mControl[index]); }

	void copyIn(uint32_t cursor, const uint8_t *source, uint32_t size) {
		if (size == 0) return;
		const uint32_t offset = cursor & (mCapacity - 1);
		const uint32_t first = size < mCapacity - offset ? size : mCapacity - offset;
		std::memcpy(mBytes + offset, source, first);
		if (first < size) std::memcpy(mBytes, source + first, size - first);
	}

	void copyOut(uint32_t cursor, uint8_t *destination, uint32_t size) const {
		if (size == 0) return;
		const uint32_t offset = cursor & (mCapacity - 1);
		const uint32_t first = size < mCapacity - offset ? size : mCapacity - offset;
		std::memcpy(destination, mBytes + offset, first);
		if (first < size) std::memcpy(destination + first, mBytes, size - first);
	}

	int32_t *mControl = nullptr;
	uint8_t *mBytes = nullptr;
	uint32_t mCapacity = 0;
};

} // namespace jsp

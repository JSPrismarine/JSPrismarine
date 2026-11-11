// Sorts a datagram on a port RakNet shares with NetherNet by its bytes, before libjuice's lookup.
// The rules run in ADR 0008's order, and the first that matches decides.
#include "jsp_native_network.h"

#include <cstring>

namespace {

// RakNet's offline message magic (OFFLINE_MESSAGE_DATA_ID in @jsprismarine/raknet).
const uint8_t OFFLINE_MAGIC[16] = {0x00, 0xff, 0xff, 0x00, 0xfe, 0xfe, 0xfe, 0xfe,
                                   0xfd, 0xfd, 0xfd, 0xfd, 0x12, 0x34, 0x56, 0x78};
// STUN's magic cookie, RFC 8489 section 5.
const uint8_t STUN_COOKIE[4] = {0x21, 0x12, 0xa4, 0x42};
const int32_t STUN_HEADER_BYTES = 20;

bool hasMagicAt(const uint8_t *data, int32_t size, int32_t offset) {
	return size >= offset + 16 && std::memcmp(data + offset, OFFLINE_MAGIC, 16) == 0;
}

} // namespace

extern "C" JSP_EXPORT int32_t jsp_classify(const uint8_t *data, int32_t size) {
	if (data == nullptr || size <= 0) return JSP_CLASS_UNSURE;
	const uint8_t first = data[0];

	// 1. Connected RakNet (frame sets, ACK, NACK), and query at 0xFE 0xFD.
	if (first >= 0x80) return JSP_CLASS_RAKNET;
	// 2. Unconnected ping, with the magic after the id and the 8-byte timestamp.
	if ((first == 0x01 || first == 0x02) && hasMagicAt(data, size, 9)) return JSP_CLASS_RAKNET_OFFLINE;
	// 3. Open connection request 1 or 2, with the magic right after the id.
	if ((first == 0x05 || first == 0x07) && hasMagicAt(data, size, 1)) return JSP_CLASS_RAKNET_OFFLINE;
	// 4. STUN: the top two bits clear, the cookie, and a length that covers the rest in 4-byte words.
	if (first <= 0x03 && size >= STUN_HEADER_BYTES && std::memcmp(data + 4, STUN_COOKIE, 4) == 0) {
		const int32_t length = (static_cast<int32_t>(data[2]) << 8) | data[3];
		if (length % 4 == 0 && length == size - STUN_HEADER_BYTES) return JSP_CLASS_STUN;
	}
	// 5. DTLS, RFC 7983.
	if (first >= 20 && first <= 63) return JSP_CLASS_DTLS;
	// 6. Anything else.
	return JSP_CLASS_UNSURE;
}

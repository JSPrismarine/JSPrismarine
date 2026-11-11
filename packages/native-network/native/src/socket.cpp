#include "socket.hpp"

#include <cerrno>
#include <cstring>
#include <mutex>

namespace jsp {

void ensureSockets() {
#ifdef _WIN32
	static std::once_flag once;
	std::call_once(once, [] {
		WSADATA data;
		WSAStartup(MAKEWORD(2, 2), &data);
	});
#endif
}

jsp_socket_t openLoopbackSocket() {
	ensureSockets();
	jsp_socket_t sock = socket(AF_INET, SOCK_DGRAM, IPPROTO_UDP);
	if (sock == JSP_INVALID_SOCKET) return JSP_INVALID_SOCKET;

	sockaddr_in address;
	std::memset(&address, 0, sizeof(address));
	address.sin_family = AF_INET;
	address.sin_addr.s_addr = htonl(INADDR_LOOPBACK);
	address.sin_port = 0;
	if (bind(sock, reinterpret_cast<sockaddr *>(&address), sizeof(address)) != 0) {
		closeSocket(sock);
		return JSP_INVALID_SOCKET;
	}
	return sock;
}

bool ipv4PortFree(uint16_t port) {
	ensureSockets();
	jsp_socket_t sock = socket(AF_INET, SOCK_DGRAM, IPPROTO_UDP);
	if (sock == JSP_INVALID_SOCKET) return false;
#ifdef _WIN32
	// Without it, Windows lets this bind succeed over a socket that set SO_REUSEADDR.
	const BOOL exclusive = TRUE;
	setsockopt(sock, SOL_SOCKET, SO_EXCLUSIVEADDRUSE, reinterpret_cast<const char *>(&exclusive), sizeof(exclusive));
#endif
	sockaddr_in address;
	std::memset(&address, 0, sizeof(address));
	address.sin_family = AF_INET;
	address.sin_addr.s_addr = htonl(INADDR_ANY);
	address.sin_port = htons(port);
	const bool bound = bind(sock, reinterpret_cast<sockaddr *>(&address), sizeof(address)) == 0;
	closeSocket(sock);
	return bound;
}

uint16_t boundPort(jsp_socket_t sock) {
	sockaddr_in address;
	socklen_t length = sizeof(address);
	if (getsockname(sock, reinterpret_cast<sockaddr *>(&address), &length) != 0) return 0;
	return ntohs(address.sin_port);
}

void sendWake(jsp_socket_t sock, uint16_t port) {
	sockaddr_in address;
	std::memset(&address, 0, sizeof(address));
	address.sin_family = AF_INET;
	address.sin_addr.s_addr = htonl(INADDR_LOOPBACK);
	address.sin_port = htons(port);
	const char byte = 1;
	sendto(sock, &byte, 1, 0, reinterpret_cast<sockaddr *>(&address), sizeof(address));
}

int receiveWake(jsp_socket_t sock) {
	char buffer[16];
	for (;;) {
		int received = static_cast<int>(recv(sock, buffer, sizeof(buffer), 0));
		if (received >= 0) return received;
#ifdef _WIN32
		// A closed socket ends the wait; a port-unreachable report from an earlier send does not.
		if (WSAGetLastError() == WSAECONNRESET) continue;
#else
		if (errno == EINTR) continue;
#endif
		return -1;
	}
}

void closeSocket(jsp_socket_t sock) {
	if (sock == JSP_INVALID_SOCKET) return;
#ifdef _WIN32
	closesocket(sock);
#else
	close(sock);
#endif
}

} // namespace jsp

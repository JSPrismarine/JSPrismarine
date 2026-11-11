// Loopback UDP sockets for the wakes, on POSIX and Windows.
#pragma once

#include <cstdint>

#ifdef _WIN32
#include <winsock2.h>
#include <ws2tcpip.h>
using jsp_socket_t = SOCKET;
inline constexpr jsp_socket_t JSP_INVALID_SOCKET = INVALID_SOCKET;
#else
#include <arpa/inet.h>
#include <netinet/in.h>
#include <sys/socket.h>
#include <unistd.h>
using jsp_socket_t = int;
inline constexpr jsp_socket_t JSP_INVALID_SOCKET = -1;
#endif

namespace jsp {

/** Starts Winsock once; a no-op elsewhere. */
void ensureSockets();

/** A UDP socket bound to 127.0.0.1 on a port the system picks, or JSP_INVALID_SOCKET. */
jsp_socket_t openLoopbackSocket();

/**
 * Whether an IPv4 UDP socket can bind 0.0.0.0 on this port now. libjuice binds a dual-stack IPv6
 * socket, which macOS and Windows let bind beside another program's IPv4 socket on the same port;
 * that program would then receive every IPv4 datagram. Probing first refuses the port everywhere.
 */
bool ipv4PortFree(uint16_t port);

/** The port a socket is bound to, or 0. */
uint16_t boundPort(jsp_socket_t socket);

/** Sends one byte from socket to 127.0.0.1:port. */
void sendWake(jsp_socket_t socket, uint16_t port);

/** Blocks until a datagram arrives; returns its size, or -1 once the socket is closed. */
int receiveWake(jsp_socket_t socket);

void closeSocket(jsp_socket_t socket);

} // namespace jsp

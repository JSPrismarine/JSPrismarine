# Builds the native networking library: libdatachannel, with libjuice patched, usrsctp and a TLS
# library, all linked statically into one shared library and one static archive. The sources are
# fetched and laid out by scripts/build-native.mts; run that script rather than CMake directly.
cmake_minimum_required(VERSION 3.20)
project(jsp_native_network LANGUAGES C CXX)

set(JSP_SOURCES_DIR "" CACHE PATH "Where build-native.mts unpacked the pinned sources")
set(JSP_TLS "mbedtls" CACHE STRING "The TLS library: mbedtls or openssl")
set(JSP_OPENSSL_ROOT "" CACHE PATH "An OpenSSL install with static libraries, for JSP_TLS=openssl")

if(NOT JSP_SOURCES_DIR)
	message(FATAL_ERROR "Set JSP_SOURCES_DIR; scripts/build-native.mts does")
endif()

set(CMAKE_POSITION_INDEPENDENT_CODE ON)
set(CMAKE_C_VISIBILITY_PRESET hidden)
set(CMAKE_CXX_VISIBILITY_PRESET hidden)
set(CMAKE_VISIBILITY_INLINES_HIDDEN ON)
if(MSVC)
	# The C runtime is linked in, so no Visual C++ redistributable is needed.
	set(CMAKE_MSVC_RUNTIME_LIBRARY "MultiThreaded$<$<CONFIG:Debug>:Debug>")
else()
	# Every function and object in its own section, so the linker drops what NetherNet never calls.
	add_compile_options(-ffunction-sections -fdata-sections)
endif()

if(JSP_TLS STREQUAL "mbedtls")
	# Mbed TLS and every target that includes its headers must read the same configuration.
	add_compile_definitions("MBEDTLS_USER_CONFIG_FILE=\"${CMAKE_CURRENT_SOURCE_DIR}/mbedtls_user_config.h\"")
	set(ENABLE_PROGRAMS OFF CACHE BOOL "" FORCE)
	set(ENABLE_TESTING OFF CACHE BOOL "" FORCE)
	set(USE_SHARED_MBEDTLS_LIBRARY OFF CACHE BOOL "" FORCE)
	set(USE_STATIC_MBEDTLS_LIBRARY ON CACHE BOOL "" FORCE)
	set(MBEDTLS_FATAL_WARNINGS OFF CACHE BOOL "" FORCE)
	add_subdirectory("${JSP_SOURCES_DIR}/mbedtls" mbedtls EXCLUDE_FROM_ALL)
	add_library(jsp_mbedtls INTERFACE)
	target_link_libraries(jsp_mbedtls INTERFACE mbedtls mbedx509 mbedcrypto)
	add_library(MbedTLS::MbedTLS ALIAS jsp_mbedtls)
	set(USE_MBEDTLS ON CACHE BOOL "" FORCE)
elseif(JSP_TLS STREQUAL "openssl")
	set(OPENSSL_ROOT_DIR "${JSP_OPENSSL_ROOT}")
	set(OPENSSL_USE_STATIC_LIBS TRUE)
	set(USE_MBEDTLS OFF CACHE BOOL "" FORCE)
else()
	message(FATAL_ERROR "JSP_TLS must be mbedtls or openssl, not ${JSP_TLS}")
endif()

set(NO_MEDIA ON CACHE BOOL "" FORCE)
set(NO_WEBSOCKET ON CACHE BOOL "" FORCE)
set(NO_EXAMPLES ON CACHE BOOL "" FORCE)
set(NO_TESTS ON CACHE BOOL "" FORCE)
set(USE_GNUTLS OFF CACHE BOOL "" FORCE)
set(USE_NICE OFF CACHE BOOL "" FORCE)
set(PREFER_SYSTEM_LIB OFF CACHE BOOL "" FORCE)
add_subdirectory("${JSP_SOURCES_DIR}/libdatachannel" libdatachannel EXCLUDE_FROM_ALL)

set(JSP_NATIVE_SOURCES
	src/classify.cpp
	src/events.cpp
	src/rtc.cpp
	src/shared_port.cpp
	src/socket.cpp
	src/pin.cpp)

function(jsp_configure target)
	target_compile_features(${target} PRIVATE cxx_std_20)
	target_include_directories(${target} PUBLIC "${CMAKE_CURRENT_SOURCE_DIR}/include")
	target_compile_definitions(${target} PRIVATE RTC_STATIC JUICE_STATIC)
	target_link_libraries(${target} PRIVATE datachannel-static LibJuice::LibJuiceStatic)
	if(WIN32)
		target_link_libraries(${target} PRIVATE ws2_32)
	elseif(UNIX)
		target_link_libraries(${target} PRIVATE ${CMAKE_DL_LIBS})
	endif()
endfunction()

add_library(jsp_native_network SHARED ${JSP_NATIVE_SOURCES})
jsp_configure(jsp_native_network)
set_target_properties(jsp_native_network PROPERTIES OUTPUT_NAME "jsp_native_network" PREFIX "lib")
if(APPLE)
	target_link_options(jsp_native_network PRIVATE "LINKER:-dead_strip" "LINKER:-exported_symbol,_jsp_*")
elseif(UNIX)
	# Only the jsp_ interface is exported, and the C++ runtime is linked in, so the library needs
	# nothing beyond libc, libm and the dynamic loader.
	target_link_options(jsp_native_network PRIVATE
		"LINKER:--gc-sections"
		"LINKER:--version-script=${CMAKE_CURRENT_SOURCE_DIR}/exports.map"
		"LINKER:-z,now"
		# libdatachannel's threads outlive any one runtime thread, so the library is never unloaded.
		"LINKER:-z,nodelete"
		-static-libstdc++ -static-libgcc)
endif()

add_library(jsp_native_network_static STATIC ${JSP_NATIVE_SOURCES})
jsp_configure(jsp_native_network_static)

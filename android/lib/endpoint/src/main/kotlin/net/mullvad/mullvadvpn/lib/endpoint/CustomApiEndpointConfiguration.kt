package net.mullvad.mullvadvpn.lib.endpoint

import java.net.InetSocketAddress
import kotlinx.parcelize.Parcelize

@Parcelize
data class CustomApiEndpointConfiguration(
    val hostname: String,
    val port: Int,
    val disableAddressCache: Boolean = false,
    val disableTls: Boolean = false,
    val forceDirectConnection: Boolean = false
) : ApiEndpointConfiguration {
    override fun apiEndpoint() =
        ApiEndpoint(
            address = InetSocketAddress(hostname, port),
            disableAddressCache = disableAddressCache,
            disableTls = disableTls,
            forceDirectConnection = forceDirectConnection
        )
}

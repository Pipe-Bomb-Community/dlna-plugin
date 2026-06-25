import { Logger } from "@sdk";
import dgram from "dgram";
import { WebServer } from "./web-server.js";

const SSDP_PORT = 1900;

export class DiscoveryServer {
	private socket: dgram.Socket | null = null;

	constructor(
		private readonly logger: Logger,
		private readonly webServer: WebServer,
		private readonly uuid: string,
	) {}

	listen() {
		this.socket?.close();

		const socket = dgram.createSocket({
			type: "udp4",
			reuseAddr: true,
		});
		this.socket = socket;

		socket.on("error", (e) => {
			this.logger.error(`Discovery Socket Error: ${e.message}`);
		});

		socket.on("listening", () => {
			try {
				socket.addMembership("239.255.255.250");
				this.logger.log(
					"Discovery server successfully joined multicast group 239.255.255.250",
				);
			} catch (err: any) {
				this.logger.error(
					`Failed to join multicast group: ${err.message}. Ensure no firewall blocks UDP multicast.`,
				);
			}
		});

		socket.on("message", (message, rinfo) => {
			const messageString = message.toString();

			if (messageString.startsWith("M-SEARCH")) {
				const lines = messageString.split("\n").map((line) => line.trim());

				const isMediaServerSearch = lines.includes(
					"ST: urn:schemas-upnp-org:device:MediaServer:1",
				);

				if (isMediaServerSearch) {
					const address = this.webServer.getAddress();
					if (address) {
						const response = [
							"HTTP/1.1 200 OK",
							"CACHE-CONTROL: max-age=1800",
							"EXT:",
							`LOCATION: http://${address.ip}:${address.port}/dlna/description.xml`,
							"SERVER: Node.js/v20 UPnP/1.1 CustomDLNA/1.0",
							"ST: urn:schemas-upnp-org:device:MediaServer:1",
							`USN: uuid:${this.uuid}::urn:schemas-upnp-org:device:MediaServer:1`,
							"\r\n",
						].join("\r\n");

						this.logger.debug(
							`Responding to client's discover request (${rinfo.address}:${rinfo.port})`,
						);
						socket.send(
							Buffer.from(response),
							0,
							response.length,
							rinfo.port,
							rinfo.address,
						);
					}
				}
			}
		});

		socket.bind(SSDP_PORT);
	}
}

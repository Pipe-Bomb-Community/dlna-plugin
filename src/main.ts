import type PipeBomb from "@sdk";
import { DiscoveryServer } from "./discovery-server.js";
import { WebServer } from "./web-server.js";
import { DlnaStructure } from "./dlna-structure.js";
import { SessionManager } from "./session-manager.js";
import { DlnaConfigManager } from "./dlna.config-manager.js";

const UUID = "c053371c-a1ba-4df3-89ef-3b10852b7ba1";

export default class Plugin implements PipeBomb.Plugin {
	private api!: PipeBomb.PluginApiContext;
	private logger!: PipeBomb.Logger;

	enable(apiContext: PipeBomb.PluginApiContext) {
		this.api = apiContext;
		this.logger = apiContext.getLogger();

		this.api.registerLanguageDirectory("language");

		const configManager = new DlnaConfigManager();
		this.api.registerConfigManager(configManager);

		const structure = new DlnaStructure(
			this.api.getDataClient(),
			this.api.getServerPort(),
		);

		const sessionManager = new SessionManager(this.api.getDataClient());

		const webServer = new WebServer(
			this.logger,
			UUID,
			structure,
			sessionManager,
			configManager,
		);
		webServer.listen("192.168.88.10", 3060);

		const startServer = () => {
			const ip = configManager.getIp();
			const port = configManager.getPort();

			const currentAddress = webServer.getAddress();

			if (
				currentAddress &&
				currentAddress.ip == ip &&
				currentAddress.port == port
			) {
				// no server address info has changed, don't bother restarting server
				return;
			}

			if (ip && port) {
				webServer.listen(ip, port);
			} else {
				webServer.close();
			}
		};

		configManager.addListener(startServer);
		startServer();

		const discoveryServer = new DiscoveryServer(this.logger, webServer, UUID);
		discoveryServer.listen();
	}

	disable() {}

	public getLogger() {
		return this.logger;
	}

	public getApi() {
		return this.api;
	}
}

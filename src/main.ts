import type PipeBomb from "@sdk";
import { DiscoveryServer } from "./discovery-server.js";
import { WebServer } from "./web-server.js";
import { DlnaStructure } from "./dlna-structure.js";
import { SessionManager } from "./session-manager.js";
import { DlnaConfigManager } from "./dlna.config-manager.js";
import path from "path";
import { readFile, writeFile } from "fs/promises";
import { randomUUID } from "crypto";

export default class Plugin implements PipeBomb.Plugin {
	private api!: PipeBomb.PluginApiContext;
	private logger!: PipeBomb.Logger;

	private async getUuid(cacheDir: string) {
		const filePath = path.join(cacheDir, "uuid.txt");
		try {
			const contents = (await readFile(filePath, "utf-8")).trim();
			if (contents.length == 36) {
				return contents;
			}
		} catch {
			this.logger.warn(
				"Failed to retrieve DLNA server UUID. Generating a new one...",
			);
		}

		const uuid = randomUUID();
		await writeFile(filePath, uuid);
		return uuid;
	}

	enable(apiContext: PipeBomb.PluginApiContext) {
		this.api = apiContext;
		this.logger = apiContext.getLogger();

		this.api.registerLanguageDirectory("language");

		this.api.requestCacheDirectory().then((cacheDir) =>
			this.getUuid(cacheDir).then((dlnaUuid) => {
				const configManager = new DlnaConfigManager();
				this.api.registerConfigManager(configManager);

				const structure = new DlnaStructure(
					this.api.getDataClient(),
					this.api.getServerPort(),
				);

				const sessionManager = new SessionManager(this.api.getDataClient());

				const webServer = new WebServer(
					this.logger,
					dlnaUuid,
					structure,
					sessionManager,
					configManager,
				);

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

				const discoveryServer = new DiscoveryServer(
					this.logger,
					webServer,
					dlnaUuid,
				);
				discoveryServer.listen();
			}),
		);
	}

	disable() {}

	public getLogger() {
		return this.logger;
	}

	public getApi() {
		return this.api;
	}
}

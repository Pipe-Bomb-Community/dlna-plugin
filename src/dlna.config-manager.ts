import { ConfigManager, ConfigManagerApiContext, ConfigNode } from "@sdk";

export class DlnaConfigManager implements ConfigManager {
	private api!: ConfigManagerApiContext;

	private ip: string | null = null;
	private port: number | null = null;
	private name: string | null = null;

	private readonly updateListeners = new Set<() => void>();

	async enable(configManagerApiContext: ConfigManagerApiContext) {
		this.api = configManagerApiContext;

		this.ip = await this.api.getValue("ip", "string");
		this.port = await this.api.getValue("port", "integer");
		this.name = await this.api.getValue("name", "string");
		for (const listener of this.updateListeners) {
			listener();
		}
	}

	addListener(listener: () => void) {
		this.updateListeners.add(listener);
	}

	removeListener(listener: () => void) {
		this.updateListeners.delete(listener);
	}

	getIp() {
		return this.ip;
	}

	getPort() {
		return this.port;
	}

	getName() {
		return this.name;
	}

	async getConfigOptions(): Promise<ConfigNode> {
		return {
			type: "section",
			children: [
				{
					type: "text",
					id: "ip",
					name: "Server IP address",
					value: this.ip ?? "",
					placeholder: "192.168.0.10",
				},
				{
					type: "text",
					id: "port",
					name: "DLNA Web server port",
					value: this.port?.toString() ?? "",
					placeholder: "8200",
				},
				{
					type: "text",
					id: "name",
					name: "DLNA server name",
					value: this.name ?? "",
					placeholder: "Pipe Bomb",
				},
			],
		};
	}

	async update(values: Record<string, any>): Promise<ConfigNode> {
		const ip = values.ip;
		if (typeof ip == "string") {
			if (ip.trim()) {
				await this.api.setValue("ip", "string", ip.trim());
				this.ip = ip.trim();
			} else {
				await this.api.delete("ip");
				this.ip = null;
			}
		}

		const portString = values.port;
		if (typeof portString == "string") {
			if (portString.trim()) {
				const port = Number(portString);
				if (Number.isInteger(port) && port > 0) {
					await this.api.setValue("port", "integer", port);
					this.port = port;
				}
			} else {
				await this.api.delete("port");
				this.port = null;
			}
		}

		const name = values.name;
		if (typeof name == "string") {
			if (name.trim()) {
				await this.api.setValue("name", "string", name.trim());
				this.name = name.trim();
			} else {
				await this.api.delete("name");
				this.name = null;
			}
		}

		for (const listener of this.updateListeners) {
			listener();
		}
		return this.getConfigOptions();
	}
}

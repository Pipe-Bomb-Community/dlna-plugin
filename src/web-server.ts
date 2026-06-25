import { Logger } from "@sdk";
import express from "express";
import { Server } from "http";
import { buildDlnaBrowseResponse, DlnaEntry } from "./dlna.util.js";
import { DlnaStructure } from "./dlna-structure.js";
import { SessionManager } from "./session-manager.js";
import { DlnaConfigManager } from "./dlna.config-manager.js";
import { escapeXml } from "./util.js";

const FRIENDLY_NAME = "Eyezah's test Pipe Bomb";

export class WebServer {
	private server: Server | null = null;
	private port: number | null = null;
	private ip: string | null = null;

	constructor(
		private readonly logger: Logger,
		private readonly uuid: string,
		private readonly structure: DlnaStructure,
		private readonly sessionManager: SessionManager,
		private readonly configManager: DlnaConfigManager,
	) {}

	async close() {
		const server = this.server;
		if (!server) {
			return;
		}
		return new Promise<void>((resolve) => {
			server.addListener("close", () => {
				this.server = null;
				resolve();
			});
			server.close();
		});
	}

	async listen(ip: string, port: number) {
		await this.close();

		this.ip = ip;
		this.port = port;

		const app = express();
		app.use(
			express.text({
				type: ["text/xml", "application/xml"],
			}),
		);

		app.get("/", (_req, res) => {
			res.send("Pipe Bomb DLNA server");
		});

		app.get("/dlna/description.xml", (_req, res) => {
			const xml = `<?xml version="1.0" encoding="utf-8"?>
<root xmlns="urn:schemas-upnp-org:device-1-0" xmlns:dlna="urn:schemas-dlna-org:device-1-0">
  <specVersion><major>1</major><minor>0</minor></specVersion>
  <device>
    <deviceType>urn:schemas-upnp-org:device:MediaServer:1</deviceType>
    <friendlyName>${escapeXml(this.configManager.getName() || "Pipe Bomb")}</friendlyName>
    <manufacturer>Pipe Bomb</manufacturer>
    <manufacturerURL>https://pipebomb.net</manufacturerURL>
    <modelDescription>Pipe Bomb Server</modelDescription>
    <modelName>Pipe Bomb DLNA Plugin</modelName>
    <modelNumber>1.0</modelNumber>
    <UDN>uuid:${this.uuid}</UDN>
    <dlna:X_DLNADOC xmlns:dlna="urn:schemas-dlna-org:device-1-0">DMS-1.50</dlna:X_DLNADOC>
    <serviceList>
      <service>
        <serviceType>urn:schemas-upnp-org:service:ContentDirectory:1</serviceType>
        <serviceId>urn:upnp-org:serviceId:ContentDirectory</serviceId>
        <controlURL>/dlna/control/ContentDirectory</controlURL>
        <eventSubURL>/dlna/event/ContentDirectory</eventSubURL>
        <SCPDURL>/dlna/scpd/ContentDirectory.xml</SCPDURL>
      </service>
    </serviceList>
  </device>
</root>`;

			res.set("Content-Type", 'text/xml; charset="utf-8"');
			res.send(xml);
		});

		app.post("/dlna/control/ContentDirectory", async (req, res) => {
			const body = req.body || "";
			const clientId = req.ip || req.socket.remoteAddress;
			if (!clientId) {
				res.status(400).send("Unknown remote address or client IP");
				return;
			}

			const objectIdMatch = body.match(/<ObjectID>(.*?)<\/ObjectID>/i);
			const browseFlagMatch = body.match(/<BrowseFlag>(.*?)<\/BrowseFlag>/i);

			const objectId = objectIdMatch ? objectIdMatch[1] : "0";
			const browseFlag = browseFlagMatch
				? browseFlagMatch[1]
				: "BrowseDirectChildren";

			const entries: DlnaEntry[] = [];
			let totalMatches: number | undefined = undefined;

			try {
				if (browseFlag == "BrowseMetadata") {
					const entry = await this.structure.getMetadata(objectId);
					entries.push({
						...entry,
						id: objectId,
					});
				} else {
					const result = await this.structure.getContents(objectId, {
						offset: 0,
						amount: 0,
						serverIp: this.ip!,
						baseUrl: `http://${this.ip}:${this.port}`,
					});
					entries.push(
						...result.entries.map((entry) => ({
							...entry,
							parentId: objectId,
						})),
					);
					totalMatches = result.totalMatches;
				}
			} catch (e) {
				this.logger.error(e);
			}

			const responseXml = buildDlnaBrowseResponse(entries, totalMatches);
			res.set("Content-Type", 'text/xml; charset="utf-8"');
			res.set("EXT", "");
			res.status(200).send(responseXml);
		});

		app.get(`/stream/:pluginId/:libraryId/:trackId`, async (req, res) => {
			const clientId = req.ip || req.socket.remoteAddress;
			if (!clientId) {
				res.status(400).send("Unknown remote address or client IP");
				return;
			}

			const session = await this.sessionManager.getOrCreateSession(
				clientId,
				req.params.pluginId,
				req.params.libraryId,
				req.params.trackId,
			);

			const producer = session.getAudioProducer();
			if (producer.type != "stream") {
				res.status(503).send("Unsupported audio producer");
				return;
			}

			const metadata = await producer.getMetadata();
			const range = req.headers.range;

			if (!range) {
				const stream = await producer.getStream();
				res.set({
					"Content-Type": metadata.mimeType,
					"Content-Length": metadata.size,
					"Accept-Ranges": "bytes",
				});
				stream.pipe(res);
				return;
			}

			const parts = range.replace(/bytes=/, "").split("-");
			const start = parseInt(parts[0]!, 10);
			const end = parts[1] ? parseInt(parts[1], 10) : metadata.size - 1;

			if (start >= metadata.size || end >= metadata.size) {
				res.status(416);
				res.set("Content-Range", `bytes */${metadata.size}`);
				res.send();
				return;
			}

			const stream = await producer.getPart(start, end);
			const chunkSize = end - start + 1;

			res.status(206);
			res.set({
				"Content-Range": `bytes ${start}-${end}/${metadata.size}`,
				"Accept-Ranges": "bytes",
				"Content-Length": chunkSize,
				"Content-Type": metadata.mimeType,
			});

			if (Buffer.isBuffer(stream)) {
				res.send(stream);
			} else {
				stream.pipe(res);
			}
		});

		this.server = app.listen(port, (error) => {
			if (error) {
				this.logger.error("Failed to start DLNA web server:", error);
			} else {
				this.logger.debug(`DLNA HTTP server listening on http://${ip}:${port}`);
			}
		});
	}

	getAddress() {
		if (!this.ip || !this.port) {
			return null;
		}
		return {
			ip: this.ip,
			port: this.port,
		};
	}
}

import { formatDuration } from "./util.js";

export interface DlnaContainer {
	type: "container";
	id: string;
	parentId: string;
	title: string;
	upnpClass?: string;
}

export interface DlnaItem {
	type: "item";
	id: string;
	parentId: string;
	title: string;
	artist?: string;
	album?: string;
	albumArtUrl?: string;
	mimeType?: string;
	url: string;
	size?: number;
	duration?: number;
}

export type DlnaEntry = DlnaContainer | DlnaItem;

const escapeXml = (str: string): string => {
	const xmlEntities: Record<string, string> = {
		"<": "&lt;",
		">": "&gt;",
		"&": "&amp;",
		"'": "&apos;",
		'"': "&quot;",
	};
	return str.replace(/[<>&'"]/g, (c) => xmlEntities[c] || c);
};

export function buildDlnaBrowseResponse(
	entries: DlnaEntry[],
	totalMatches?: number | null,
): string {
	const didlItems = entries.map((entry) => {
		if (entry.type === "container") {
			const upnpClass = entry.upnpClass || "object.container.storageFolder";
			return `
    <container id="${entry.id}" parentID="${entry.parentId}" restricted="1" searchable="1">
        <dc:title>${escapeXml(entry.title)}</dc:title>
        <upnp:class>${upnpClass}</upnp:class>
    </container>`.trim();
		} else {
			const mimeType = entry.mimeType || "audio/mpeg";

			let protoInfo = `http-get:*:${mimeType}:*`;
			if (mimeType === "audio/mpeg") {
				protoInfo =
					"http-get:*:audio/mpeg:DLNA.ORG_PN=MP3;DLNA.ORG_OP=01;DLNA.ORG_FLAGS=01700000000000000000000000000000";
			} else if (mimeType === "audio/x-flac" || mimeType === "audio/flac") {
				protoInfo =
					"http-get:*:audio/x-flac:DLNA.ORG_OP=01;DLNA.ORG_FLAGS=01700000000000000000000000000000";
			}

			const sizeAttr = entry.size ? ` size="${entry.size}"` : "";
			const durationAttr =
				typeof entry.duration == "number"
					? ` duration="${formatDuration(entry.duration)}"`
					: "";

			const resElement = `<res protocolInfo="${protoInfo}"${sizeAttr}${durationAttr}>${entry.url}</res>`;

			const info: Record<string, string> = {
				"dc:title": escapeXml(entry.title),
				"upnp:class": "object.item.audioItem.musicTrack",
			};
			if (entry.artist) {
				info["upnp:artist"] = escapeXml(entry.artist);
				info["dc:creator"] = escapeXml(entry.artist);
			}
			if (entry.album) {
				info["upnp:album"] = escapeXml(entry.album);
			}
			if (entry.albumArtUrl) {
				info["upnp:albumArtURI"] = escapeXml(entry.albumArtUrl);
			}

			return `<item id="${entry.id}" parentID="${entry.parentId}" restricted="1">
	${Object.entries(info)
		.map(([key, value]) => `<${key}>${value}</${key}>`)
		.join("\n\t")}
	${resElement}
</item>`.trim();
		}
	});

	const didlRaw = `<DIDL-Lite xmlns="urn:schemas-upnp-org:metadata-1-0/DIDL-Lite/" 
           xmlns:dc="http://purl.org/dc/elements/1.1/" 
           xmlns:upnp="urn:schemas-upnp-org:metadata-1-0/upnp/" 
           xmlns:dlna="urn:schemas-dlna-org:metadata-1-0/">
    ${didlItems.join("\n    ")}
</DIDL-Lite>`;

	const escapedDidl = escapeXml(didlRaw.trim());

	const matchCount = totalMatches ?? entries.length;
	return `<?xml version="1.0" encoding="utf-8"?>
<s:Envelope xmlns:s="http://schemas.xml-stream.org/soap/envelope/" s:encodingStyle="http://schemas.xml-stream.org/soap/encoding/">
    <s:Body>
        <u:BrowseResponse xmlns:u="urn:schemas-upnp-org:service:ContentDirectory:1">
            <Result>${escapedDidl}</Result>
            <NumberReturned>${entries.length}</NumberReturned>
            <TotalMatches>${matchCount}</TotalMatches>
            <UpdateID>1</UpdateID>
        </u:BrowseResponse>
    </s:Body>
</s:Envelope>`.trim();
}

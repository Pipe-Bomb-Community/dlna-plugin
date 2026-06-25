import {
	AttributeType,
	DataClient,
	SavedAlbum,
	SavedAlbumArtist,
	SavedArtist,
	SavedArtistTrack,
	SavedAttribute,
	SavedAttributeValues,
	SavedTrack,
} from "@sdk";
import { DlnaContainer, DlnaItem } from "./dlna.util.js";
import { createAttributeRecord } from "./util.js";

const IMAGE_SIZE = 180;

export type ContentsEntry =
	| Omit<DlnaContainer, "parentId">
	| Omit<DlnaItem, "parentId">;

export interface ContainerResult {
	entries: ContentsEntry[];
	totalMatches?: number;
}

export class DlnaStructure {
	constructor(
		private readonly client: DataClient,
		private readonly serverPort: number,
	) {}

	async getContents(
		id: string,
		options: {
			offset: number;
			amount: number;
			serverIp: string;
			baseUrl: string;
		},
	): Promise<ContainerResult> {
		switch (id) {
			case "0":
				return {
					entries: [
						{
							id: "all_artists",
							type: "container",
							title: "All Artists",
						},
						{
							id: "all_albums",
							type: "container",
							title: "All Albums",
						},
					],
				};
			case "all_artists": {
				const totalMatches = await this.client.getArtistCount();

				const amount = Math.min(options.amount || 200, 200);
				const offset = options.offset;

				const uuids = await this.client.getArtistUuids(amount, offset);

				const entries: Promise<ContentsEntry>[] = uuids.map((uuid) =>
					this.client
						.getArtist(uuid, {
							relations: {
								attributes: true,
							},
						})
						.then((artist) => {
							if (artist) {
								return this.getArtistEntry(artist, options.serverIp, "");
							}
							const entry: ContentsEntry = {
								id: `artist/${uuid}`,
								type: "container",
								title: "Unknown Artist",
								upnpClass: "object.container.person.musicArtist",
							};
							return entry;
						}),
				);

				return {
					entries: await Promise.all(entries),
					totalMatches,
				};
			}
			case "all_albums": {
				const totalMatches = await this.client.getAlbumCount();
				const uuids = await this.client.getAlbumUuids(
					Math.min(options.amount || 200, 200),
					options.offset,
				);

				const entries: Promise<ContentsEntry>[] = uuids.map((uuid) =>
					this.client
						.getAlbum(uuid, {
							relations: {
								attributes: true,
							},
						})
						.then((album) => {
							if (album) {
								return this.getAlbumEntry(album, options.serverIp, "");
							}
							const entry: ContentsEntry = {
								id: `album/${uuid}`,
								type: "container",
								title: "Unknown Album",
								upnpClass: "object.container.album.musicAlbum",
							};
							return entry;
						}),
				);

				return {
					entries: await Promise.all(entries),
					totalMatches,
				};
			}
		}

		const parts = id.split("/");

		if (parts[0] == "artist") {
			if (parts.length == 2) {
				const artist = await this.client.getArtist(parts[1]!, {
					relations: {
						albums: {
							attributes: true,
						},
					},
				});

				if (artist?.albums) {
					return {
						entries: [
							{
								type: "container",
								id: `artist/${parts[1]}/tracks`,
								title: "All Tracks",
								upnpClass: "object.container.musicContainer",
							},
							...(artist.albums
								.map(({ album }) => {
									if (!album) {
										return null;
									}

									return {
										type: "container",
										id: `album/${album.uuid}`,
										title:
											this.getAttributeValue(
												album?.attributes,
												"title",
												"string",
											) ?? "Unknown Album",
										upnpClass: "object.container.album.musicAlbum",
									} as ContentsEntry;
								})
								.filter((entry) => !!entry) as ContentsEntry[]),
						],
					};
				}
			}

			if (parts.length == 3 && parts[2] == "tracks") {
				const artist = await this.client.getArtist(parts[1]!, {
					relations: {
						tracks: {
							attributes: true,
							artists: {
								attributes: true,
							},
						},
					},
				});

				if (!artist?.tracks) {
					return {
						entries: [],
					};
				}

				const tracks = artist.tracks
					.map(({ track }) => track)
					.filter((track) => !!track);

				return {
					entries: tracks.map((track) =>
						this.getTrackEntry(track, options.serverIp, options.baseUrl, id),
					),
				};
			}
		}

		if (parts[0] == "album") {
			if (parts.length == 2) {
				const album = await this.client.getAlbum(parts[1]!, {
					relations: {
						tracks: {
							attributes: true,
							artists: {
								attributes: true,
							},
						},
					},
				});
				if (album?.tracks) {
					return {
						entries: album.tracks
							.map((track) => {
								if (!track.track) {
									return null;
								}

								const attributes = createAttributeRecord(
									track.track?.attributes ?? [],
								);

								let albumArtUrl: string | undefined = undefined;

								const front = attributes?.front;
								if (front?.type == "buffer" && front.values.length) {
									const buffer = front.values[0]!;
									albumArtUrl = `http://${options.serverIp}:${this.serverPort}${buffer.url}`;
								}

								return {
									type: "item",
									id: `track/${track.trackUuid}`,
									title:
										this.getAttributeValue(attributes, "title", "string") ??
										"Unknown Track",
									url: `${options.baseUrl}/stream/${track.track.pluginId}/${track.track.pluginId}/${track.track.trackId}`,
									duration:
										this.getAttributeValue(attributes, "duration", "decimal") ??
										undefined,
									artist:
										this.getArtistString(track.track?.artists, attributes) ??
										"Unknown Artist",
									albumArtUrl,
								};
							})
							.filter((track) => !!track) as DlnaItem[],
					};
				}
			}
		}

		throw new Error(`Unknown object ID "${id}"`);
	}

	async getMetadata(
		id: string,
		options: {
			serverIp: string;
		},
	): Promise<Omit<DlnaContainer, "id"> | Omit<DlnaItem, "id">> {
		switch (id) {
			case "0":
				return {
					parentId: "-1",
					type: "container",
					title: "Root",
				};
			case "all_artists":
				return {
					parentId: "0",
					type: "container",
					title: "All Artists",
				};
			case "all_albums":
				return {
					parentId: "0",
					type: "container",
					title: "All Albums",
				};
		}

		const parts = id.split("/");

		if (parts[0] == "artist") {
			if (parts.length == 2) {
				const artist = await this.client.getArtist(parts[1]!, {
					relations: {
						attributes: true,
					},
				});
				if (artist) {
					return this.getArtistEntry(artist, options.serverIp, "all_artists");
				}
			}

			if (parts.length == 3 && parts[2] == "tracks") {
				return {
					parentId: `artist/${parts[1]}`,
					type: "container",
					title: "All Tracks",
					upnpClass: "object.container.musicContainer",
				};
			}
		}

		if (parts[0] == "album") {
			if (parts.length == 2) {
				const album = await this.client.getAlbum(parts[1]!, {
					relations: {
						attributes: true,
					},
				});
				if (album) {
					return this.getAlbumEntry(album, options.serverIp, "all_albums");
				}
			}
		}

		throw new Error(`Unknown object ID "${id}"`);
	}

	private getAttributeValue<T extends AttributeType>(
		attributes:
			| Record<string, SavedAttribute>
			| SavedAttribute[]
			| null
			| undefined,
		key: string,
		type: T,
	): SavedAttributeValues[T] | null {
		if (attributes && Array.isArray(attributes)) {
			attributes = createAttributeRecord(attributes);
		}

		const attribute = attributes?.[key];
		if (attribute?.type == type && attribute.values.length) {
			return attribute.values[0]! as SavedAttributeValues[T];
		}

		return null;
	}

	private getArtistString(
		artists: (SavedArtistTrack | SavedAlbumArtist)[] | undefined | null,
		attributes: Record<string, SavedAttribute>,
	) {
		if (artists) {
			const fullArtists = artists.map(({ artist, joinPhrase }) => ({
				...artist,
				joinPhrase,
			}));
			if (fullArtists.length) {
				let artistString = "";
				for (const [i, artist] of fullArtists.entries()) {
					const record = createAttributeRecord(artist?.attributes ?? []);
					const nameAttribute = record.name;
					if (nameAttribute?.type == "string" && nameAttribute.values.length) {
						artistString += nameAttribute.values[0];
						if (artist.joinPhrase) {
							artistString += artist.joinPhrase;
						} else if (i < fullArtists.length - 1) {
							artistString += ", ";
						}
					}
				}

				return artistString;
			}
		}

		let artistString = "";
		const attribute = attributes?.artist;
		if (attribute?.type == "string" && attribute.values.length) {
			for (const [i, name] of attribute.values.entries()) {
				artistString += name;
				if (i < attribute.values.length - 1) {
					artistString += ", ";
				}
			}
		}

		return artistString || null;
	}

	private getTrackEntry(
		track: SavedTrack,
		serverIp: string,
		baseUrl: string,
		parentId: string,
	): DlnaItem {
		const attributes = createAttributeRecord(track?.attributes ?? []);

		let albumArtUrl: string | undefined = undefined;

		const front = attributes?.front;
		if (front?.type == "buffer" && front.values.length) {
			const buffer = front.values[0]!;
			albumArtUrl = `http://${serverIp}:${this.serverPort}${buffer.url}?width=${IMAGE_SIZE}&height=${IMAGE_SIZE}`;
		}

		return {
			type: "item",
			id: `track/${track.uuid}`,
			title:
				this.getAttributeValue(attributes, "title", "string") ??
				"Unknown Track",
			url: `${baseUrl}/stream/${track.pluginId}/${track.pluginId}/${track.trackId}`,
			duration:
				this.getAttributeValue(attributes, "duration", "decimal") ?? undefined,
			artist:
				this.getArtistString(track?.artists, attributes) ?? "Unknown Artist",
			albumArtUrl,
			parentId,
		};
	}

	private getArtistEntry(
		artist: SavedArtist,
		serverIp: string,
		parentId: string,
	): DlnaContainer {
		const attributes = createAttributeRecord(artist?.attributes ?? []);

		let albumArtUrl: string | undefined = undefined;

		const thumb = attributes?.thumb;
		if (thumb?.type == "buffer" && thumb.values.length) {
			const buffer = thumb.values[0]!;
			albumArtUrl = `http://${serverIp}:${this.serverPort}${buffer.url}?width=${IMAGE_SIZE}&height=${IMAGE_SIZE}`;
		}

		return {
			id: `artist/${artist.uuid}`,
			parentId,
			type: "container",
			title:
				this.getAttributeValue(artist?.attributes, "name", "string") ??
				"Unknown Artist",
			upnpClass: "object.container.person.musicArtist",
			albumArtUrl,
		};
	}

	private getAlbumEntry(
		album: SavedAlbum,
		serverIp: string,
		parentId: string,
	): DlnaContainer {
		const attributes = createAttributeRecord(album?.attributes ?? []);

		let albumArtUrl: string | undefined = undefined;

		const front = attributes?.front;
		if (front?.type == "buffer" && front.values.length) {
			const buffer = front.values[0]!;
			albumArtUrl = `http://${serverIp}:${this.serverPort}${buffer.url}?width=${IMAGE_SIZE}&height=${IMAGE_SIZE}`;
		}

		return {
			id: `album/${album.uuid}`,
			parentId,
			type: "container",
			title:
				this.getAttributeValue(album?.attributes, "title", "string") ??
				"Unknown Album",
			upnpClass: "object.container.album.musicAlbum",
			albumArtUrl,
		};
	}
}

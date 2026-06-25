import { AudioSession, DataClient } from "@sdk";

const MAX_CLIENT_SESSIONS = 3;

interface Session extends AudioSession {
	pluginId: string;
	libraryId: string;
	trackId: string;
}

export class SessionManager {
	private readonly sessions = new Map<string, Session[]>();

	constructor(private readonly client: DataClient) {}

	async getOrCreateSession(
		clientId: string,
		pluginId: string,
		libraryId: string,
		trackId: string,
	) {
		const sessions = this.sessions.get(clientId);
		if (sessions) {
			const session = sessions.find(
				(session) =>
					session.pluginId == pluginId &&
					session.libraryId == libraryId &&
					session.trackId == trackId,
			);
			if (session) {
				return session;
			}
		}

		return this.createSession(clientId, pluginId, libraryId, trackId);
	}

	async createSession(
		clientId: string,
		pluginId: string,
		libraryId: string,
		trackId: string,
	) {
		const sessions = this.sessions.get(clientId);
		if (sessions && sessions.length >= MAX_CLIENT_SESSIONS - 1) {
			sessions.shift();
			// todo: delete session
		}

		const newSession = await this.client.createAudioSession(
			pluginId,
			libraryId,
			trackId,
			"stream",
		);

		const currentSessions = this.sessions.get(clientId);
		if (currentSessions) {
			currentSessions.push({ ...newSession, pluginId, libraryId, trackId });
		} else {
			this.sessions.set(clientId, [
				{ ...newSession, pluginId, libraryId, trackId },
			]);
		}
		return newSession;
	}
}

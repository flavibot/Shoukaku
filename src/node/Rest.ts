import { Versions } from '../Constants';
import type { FilterOptions } from '../guild/Player';
import type { NodeOption } from '../Shoukaku';
import type { Node, NodeInfo, Stats } from './Node';

export type Severity = 'common' | 'suspicious' | 'fault';

export enum LoadType {
	TRACK = 'track',
	PLAYLIST = 'playlist',
	SEARCH = 'search',
	EMPTY = 'empty',
	ERROR = 'error'
}

export interface Track {
	encoded: string;
	info: {
		identifier: string;
		isSeekable: boolean;
		author: string;
		length: number;
		isStream: boolean;
		position: number;
		title: string;
		uri?: string;
		artworkUrl?: string;
		isrc?: string;
		sourceName: string;
	};
	pluginInfo: unknown;
}

export interface Playlist {
	encoded: string;
	info: {
		name: string;
		selectedTrack: number;
	};
	pluginInfo: unknown;
	tracks: Track[];
}

export interface Exception {
	message: string;
	severity: Severity;
	cause: string;
}

export interface TrackResult {
	loadType: LoadType.TRACK;
	data: Track;
}

export interface PlaylistResult {
	loadType: LoadType.PLAYLIST;
	data: Playlist;
}

export interface SearchResult {
	loadType: LoadType.SEARCH;
	data: Track[];
}

export interface EmptyResult {
	loadType: LoadType.EMPTY;
	data: Record<string, never>;
}

export interface ErrorResult {
	loadType: LoadType.ERROR;
	data: Exception;
}

export type LavalinkResponse = TrackResult | PlaylistResult | SearchResult | EmptyResult | ErrorResult;

export interface Address {
	address: string;
	failingTimestamp: number;
	failingTime: string;
}

export interface RoutePlanner {
	class: null | 'RotatingIpRoutePlanner' | 'NanoIpRoutePlanner' | 'RotatingNanoIpRoutePlanner' | 'BalancingIpRoutePlanner';
	details: null | {
		ipBlock: {
			type: string;
			size: string;
		};
		failingAddresses: Address[];
		rotateIndex: string;
		ipIndex: string;
		currentAddress: string;
		blockIndex: string;
		currentAddressIndex: string;
	};
}

export interface LavalinkPlayerVoice {
	token: string;
	endpoint: string;
	sessionId: string;
	connected?: boolean;
	ping?: number;
}

export type LavalinkPlayerVoiceOptions = Omit<LavalinkPlayerVoice, 'connected' | 'ping'>;

export interface LavalinkPlayer {
	guildId: string;
	track?: Track;
	volume: number;
	paused: boolean;
	voice: LavalinkPlayerVoice;
	filters: FilterOptions;
}

export interface UpdatePlayerTrackOptions {
	encoded?: string | null;
	identifier?: string;
	userData?: unknown;
}

export interface UpdatePlayerOptions {
	track?: UpdatePlayerTrackOptions;
	position?: number;
	endTime?: number;
	volume?: number;
	paused?: boolean;
	filters?: FilterOptions;
	voice?: LavalinkPlayerVoiceOptions;
}

export interface UpdatePlayerInfo {
	guildId: string;
	playerOptions: UpdatePlayerOptions;
	noReplace?: boolean;
}

export interface SessionInfo {
	resumingKey?: string;
	timeout: number;
}

export interface FetchOptions {
	endpoint: string;
	options: {
		headers?: Record<string, string>;
		params?: Record<string, string>;
		method?: string;
		body?: Record<string, unknown>;
		[key: string]: unknown;
	};
}

interface FinalFetchOptions {
	method: string;
	headers: Record<string, string>;
	signal: AbortSignal;
	body?: string;
}

/**
 * Wrapper around Lavalink REST API
 */
export class Rest {
	/**
	 * Node that initialized this instance
	 */
	protected readonly node: Node;
	/**
	 * URL of Lavalink
	 */
	protected readonly url: string;
	/**
	 * Credentials to access Lavalink
	 */
	protected readonly auth: string;
	/**
	 * @param node An instance of Node
	 * @param options The options to initialize this rest class
	 * @param options.name Name of this node
	 * @param options.url URL of Lavalink
	 * @param options.auth Credentials to access Lavalnk
	 * @param options.secure Weather to use secure protocols or not
	 * @param options.group Group of this node
	 */
	constructor(node: Node, options: NodeOption) {
		this.node = node;
		this.url = `${options.secure ? 'https' : 'http'}://${options.url}/v${Versions.REST_VERSION}`;
		this.auth = options.auth;
	}

	protected get sessionId(): string {
		return this.node.sessionId!;
	}

	/**
	 * Resolve a track
	 * @param identifier Track ID
	 * @returns A promise that resolves to a Lavalink response
	 */
	public async resolve(identifier: string): Promise<LavalinkResponse | undefined> {
		const options = {
			endpoint: '/loadtracks',
			options: { params: { identifier }}
		};
		return await this.fetch(options);
	}

	/**
	 * Decode a track
	 * @param track Encoded track
	 * @returns Promise that resolves to a track
	 */
	public async decode(track: string): Promise<Track | undefined> {
		const options = {
			endpoint: '/decodetrack',
			options: { params: { track }}
		};
		return await this.fetch<Track>(options);
	}

	/**
	 * Gets all the player with the specified sessionId
	 * @returns Promise that resolves to an array of Lavalink players
	 */
	public async getPlayers(): Promise<LavalinkPlayer[]> {
		const options = {
			endpoint: `/sessions/${this.sessionId}/players`,
			options: {}
		};
		return await this.fetch<LavalinkPlayer[]>(options) ?? [];
	}

	/**
	 * Gets the player with the specified guildId
	 * @returns Promise that resolves to a Lavalink player
	 */
	public async getPlayer(guildId: string): Promise<LavalinkPlayer | undefined> {
		const options = {
			endpoint: `/sessions/${this.sessionId}/players/${guildId}`,
			options: {}
		};
		return await this.fetch<LavalinkPlayer>(options);
	}

	/**
	 * Updates a Lavalink player
	 * @param data SessionId from Discord
	 * @returns Promise that resolves to a Lavalink player
	 */
	public async updatePlayer(data: UpdatePlayerInfo): Promise<LavalinkPlayer | undefined> {
		const options = {
			endpoint: `/sessions/${this.sessionId}/players/${data.guildId}`,
			options: {
				method: 'PATCH',
				params: { noReplace: data.noReplace?.toString() ?? 'false' },
				headers: { 'Content-Type': 'application/json' },
				body: data.playerOptions as Record<string, unknown>
			}
		};
		return await this.fetch<LavalinkPlayer>(options);
	}

	/**
	 * Deletes a Lavalink player
	 * @param guildId guildId where this player is
	 */
	public async destroyPlayer(guildId: string): Promise<void> {
		const options = {
			endpoint: `/sessions/${this.sessionId}/players/${guildId}`,
			options: { method: 'DELETE' }
		};
		await this.fetch(options);
	}

	/**
	 * Updates the session with a resume boolean and timeout
	 * @param resuming Whether resuming is enabled for this session or not
	 * @param timeout Timeout to wait for resuming
	 * @returns Promise that resolves to a Lavalink player
	 */
	public async updateSession(resuming?: boolean, timeout?: number): Promise<SessionInfo | undefined> {
		const options = {
			endpoint: `/sessions/${this.sessionId}`,
			options: {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: { resuming, timeout }
			}
		};
		return await this.fetch(options);
	}

	/**
	 * Gets the status of this node
	 * @returns Promise that resolves to a node stats response
	 */
	public async stats(): Promise<Stats | undefined> {
		const options = {
			endpoint: '/stats',
			options: {}
		};
		return await this.fetch(options);
	}

	/**
	 * Get routeplanner status from Lavalink
	 * @returns Promise that resolves to a routeplanner response
	 */
	public async getRoutePlannerStatus(): Promise<RoutePlanner | undefined> {
		const options = {
			endpoint: '/routeplanner/status',
			options: {}
		};
		return await this.fetch(options);
	}

	/**
	 * Release blacklisted IP address into pool of IPs
	 * @param address IP address
	 */
	public async unmarkFailedAddress(address: string): Promise<void> {
		const options = {
			endpoint: '/routeplanner/free/address',
			options: {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: { address }
			}
		};
		await this.fetch(options);
	}

	/**
	 * Get Lavalink info
	 */
	public async getLavalinkInfo(): Promise<NodeInfo | undefined> {
		const options = {
			endpoint: '/info',
			options: {
				headers: { 'Content-Type': 'application/json' }
			}
		};
		return await this.fetch(options);
	}

	/**
	 * Make a request to Lavalink with retry mechanism
	 * @param fetchOptions.endpoint Lavalink endpoint
	 * @param fetchOptions.options Options passed to fetch
	 * @param maxRetry Maximum number of retries (default: 1)
	 * @throws `RestError` when encountering a Lavalink error response
	 * @internal
	 */
	protected async fetch<T = unknown>(fetchOptions: FetchOptions, maxRetry = 1, currentRetry = 0): Promise<T | undefined> {
		const { endpoint, options } = fetchOptions;
		let headers = {
			Authorization: this.auth,
			'User-Agent': this.node.manager.options.userAgent
		};
		if (options.headers) headers = { ...headers, ...options.headers };
		const abortController = new AbortController();
		const timeout = setTimeout(() => abortController.abort(), this.node.manager.options.restTimeout * 1000);
		const method = options.method?.toUpperCase() ?? 'GET';
		const url = new URL(`${this.url}${endpoint}`);
		const finalFetchOptions: FinalFetchOptions = {
			method,
			headers,
			signal: abortController.signal
		};

		if (options.params) url.search = new URLSearchParams(options.params).toString();
		if (![ 'GET', 'HEAD' ].includes(method) && options.body)
			finalFetchOptions.body = JSON.stringify(options.body);
		try {
			const start = Date.now();
			const request = await fetch(url.toString(), finalFetchOptions);
			const latency = Date.now() - start;
			this.node.emit('rest', {
				url: url.toString(),
				options: fetchOptions,
				status: request.status,
				ok: request.ok,
				latency,
				retries: maxRetry - currentRetry
			});

			if (!request.ok) {
				const response = await request.json().catch(() => null) as LavalinkRestError | null;
				throw new RestError(
					response ?? {
						timestamp: Date.now(),
						status: request.status,
						error: 'Unknown Error',
						message: 'Unexpected error response from Lavalink server',
						path: endpoint
					},
					this.node.name
				);
			}

			if (request.status === 204) {
				return undefined;
			}

			return (await request.json()) as T;
		} catch (error) {
			if (currentRetry < maxRetry) {
				console.warn(
					`[NODE-REST] (${this.node.name}) Request failed, retrying... (${currentRetry + 1}/${maxRetry} retries)`,
					finalFetchOptions
				);
				return this.fetch(fetchOptions, maxRetry, currentRetry + 1);
			}
			if (error instanceof Error || error instanceof RestError) {
				error.message += ` (${currentRetry}/${maxRetry} retries)`;
			}
			throw error;
		} finally {
			clearTimeout(timeout);
		}
	}
}

interface LavalinkRestError {
	timestamp: number;
	status: number;
	error: string;
	trace?: string;
	message: string;
	path: string;
}

export class RestError extends Error {
	public timestamp: number;
	public status: number;
	public error: string;
	public trace?: string;
	public path: string;

	constructor({ timestamp, status, error, trace, message, path }: LavalinkRestError, nodeName: string) {
		super();
		this.name = 'RestError';
		this.timestamp = timestamp;
		this.status = status;
		this.error = error;
		this.trace = trace;
		this.message = `(${nodeName}) ${message}`;
		this.path = path;
		Object.setPrototypeOf(this, new.target.prototype);
	}
}

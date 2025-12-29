// import { Device } from './twin.js';
import { JsonParserV1 } from "./json_parser_v1";
import { JsonParserV2 } from "./json_parser_v2";
import { Device } from "./twin";
class ProtocolError extends Error {  
}


class Rest {
	url: string;
	interval: number;
	pollInterval: number;
	usePolling: boolean;
	streamingTimeout: number;
	onload: ((this: Window, ev: Event) => any) | null;
	timestamp?: string;
	onupdate: Function;
	version: number;
	parser: JsonParserV1 | JsonParserV2 | null;
	device: Device | undefined;
	path: string | undefined;
	nextSequence: number | undefined;
	buffer: string | undefined;
	length: number | undefined;
	boundary: string | undefined;
	instanceId: string | undefined;
	dataItems: { [key: string]: any };
	devices: Device[];
	controller: AbortController;

	constructor(url: string, onupdate: Function, interval = 100, usePolling = false) {
		this.url = url;
		this.interval = interval;
		this.pollInterval = 250;
		this.usePolling = usePolling;
		this.streamingTimeout = 11000;

		this.onupdate = onupdate;
		this.onload = null;
		this.version = 1;
		this.parser = null;
		this.dataItems = {};
		this.devices = [];
		this.controller = new AbortController();
	}
	
	async getAsset(id: string = "", removed: boolean = false): Promise<any> {
		const url: string = `${this.url}/asset/${id}${removed ? "?removed=true" : ""}`;
		try {
			const result = await fetch(url, {
				headers: {
					'Accept': 'application/json',
				}
			});
			const text = await result.text();
			const asset = JSON.parse(text);
			return asset;
		} catch (error) {
			console.log(error);
			throw new ProtocolError("Cannot get asset");
		}
	}

	async probe(): Promise<Device[] | undefined> {
		try {
			const result = await fetch(`${this.url}/probe`, {
				headers: {
					'Accept': 'application/json',
				}
			});
			const text = await result.text();
			const probe = JSON.parse(text);
			this.version = probe.MTConnectDevices.jsonVersion;
			this.timestamp = probe.MTConnectDevices.Header.creationTime;
			if (this.version == 2) {
				this.parser = new JsonParserV2();
			} else {
				this.parser = new JsonParserV1();
			}
			this.devices = this.parser.devices(probe, (device: any) => new Device(device, this.parser));
			// this.device = devices[0];
			// console.debug(this.device);
		} catch (error) {
			console.log(error);
			throw new ProtocolError("Cannot probe");
		}
		return this.devices;
	}

	async current(): Promise<void> {
		const result = await fetch(`${this.url}/current?${this.path}`, {
			headers: {
				'Accept': 'application/json'
			}
		});
		const text = await result.text();
		this.handleData(text);
	}

	sleep(delay: number): Promise<void> {
		return new Promise(resolve => setTimeout(resolve, delay));
	}

	async pollSample(): Promise<void> {
		while (true) {
			try {
				const result = await fetch(`${this.url}/sample?${this.path}&from=${this.nextSequence}&count=1000`, {
					headers: {
						'Accept': 'application/json'
					}
				});
				const text = await result.text();
				this.handleData(text);
		
				await this.sleep(this.interval);
			} catch (error) {
				console.log(error);
				if (error instanceof ProtocolError) {
					throw error;
				}
				await this.sleep(this.pollInterval);
			}
		}
	}

	async streamSample(): Promise<void> {
		while (!this.controller.signal.aborted) {
			try {
				// const controller = new AbortController();
				let id = setTimeout(() => this.controller.abort(), this.streamingTimeout);
				const uri = `${this.url}/sample?${this.path}&interval=${this.interval}&from=${this.nextSequence}&count=1000`;
				console.debug(uri);
				const response = await fetch(uri, {
					headers: {
						'Accept': 'application/json'
					},
					signal: this.controller.signal
				});

				clearTimeout(id);

				const content = response.headers.get('Content-Type'); 
				if (!content) {
					throw new ProtocolError("Content-Type header is missing");
				}
				const pos = content.indexOf("boundary=");
				if (pos < 0) {6
					throw Error("Could not find boundary in content type");
				}

				this.boundary = `--${content.substr(pos + 9)}`;
				console.debug(this.boundary);

				const reader = response.body?.getReader();

				while (true) {
					const { value, done } = await reader?.read() || { value: undefined, done: true };

					if (done) break;

					const text = new TextDecoder().decode(value);
					console.log("Read " + text.length + " bytes");

					if (!this.buffer) {
						this.buffer = text;
					} else {
						this.buffer += text;
					}
					let more = this.processChunk();
					while (more) {
						more = false;
						const ind = this.buffer.indexOf(this.boundary);
						if (ind >= 0) {
							const body = this.buffer.indexOf("\r\n\r\n", ind);
							if (body > ind) {
								// Parse header fields
								const headers = this.parseHeader(this.buffer.substring(ind + this.boundary.length + 2, body));
								if (headers['content-length']) {
									this.length = Number(headers['content-length']);
									this.buffer = this.buffer.substr(body + 4);
									more = this.processChunk();
								} else {
									this.usePolling = true;
									throw new ProtocolError("Missing content length in frame header, switching to polling");
								}
							}
						}
					}
				}
			} catch (error) {
				console.log(error);
				if (error instanceof ProtocolError) {
					throw error;
				}
				if (error instanceof Error && error.name !== 'AbortError') {
					this.usePolling = true;
					throw new ProtocolError('Switching to polling');
				}
				if (error instanceof Error && error.name === 'AbortError') {
					console.log("Aborted");
					throw new ProtocolError("Aborted");
				}
				await this.sleep(this.interval);
			}
		}
	}

	parseHeader(header: string): { [key: string]: string } {
		return Object.fromEntries(header.split("\r\n")
			.map(s => s.split(/:[ ]*/)).map(v => [v[0].toLowerCase(), v[1]]));
	}

	processChunk(): boolean {
		if (this.length && this.buffer && this.buffer.length >= this.length) {
			this.handleData(this.buffer.substr(0, this.length));

			if (this.buffer.length > this.length) {
				this.buffer = this.buffer.substr(this.length);
			} else {
				this.buffer = undefined;
			}
			this.length = undefined;
		}

		return this.buffer !== undefined && this.buffer.length > 0;
	}

	handleData(text: string): void {
		const data = JSON.parse(text);

		if (this.instanceId && data.MTConnectStreams.Header.instanceId != this.instanceId) {
			this.instanceId = undefined;
			this.nextSequence = undefined;
			throw new ProtocolError("Restart stream");
		} else if (!this.instanceId) {
			this.instanceId = data.MTConnectStreams.Header.instanceId;
		}
		this.timestamp = data.MTConnectStreams.Header.creationTime;
		this.nextSequence = data.MTConnectStreams.Header.nextSequence;
		this.transform(data);
	}

	transform(data: any): void {
		const updates: [any, any][] = [];
		this.parser?.observations(data, (key: string, obs: any) => {
			const di = this.dataItems[obs.dataItemId];
			if (di) {
				di.apply(key, obs);
				updates.push([di, obs]);
			}      
		});
		
		this.onupdate(updates);
	}

	pascalize(str: string): string {
		return str.split('_').map(s => s[0] + s.substr(1).toLowerCase()).join('');
	}

	async streamData(dataItems: any[]): Promise<void> {
		this.dataItems = Object.fromEntries(dataItems.map(di => [di.id, di]));
		this.path = `path=//DataItem[${Object.keys(this.dataItems).map(id => "@id='" + id + "'").join(" or ")}]`;

		while (true) {
			try {
				await this.current();

				if (this.usePolling)
					await this.pollSample();
				else
					await this.streamSample();

			} catch (error) {
				console.log(error);
				if (error instanceof ProtocolError) {
					await this.sleep(1000);
				}
			}
		}
	}

	async probeMachine(): Promise<Device[] | undefined> {
		while (true) {
			try {
				await this.probe();
				return this.devices;
			} catch (error) {
				console.log(error);
				if (error instanceof ProtocolError) {
					await this.sleep(1000);
				} else {
					return undefined;
				}  
			}
		}
	}

	async loadModel(onload: Function): Promise<this> { 
		await this.device?.load(onload);
		return this;
	}
}

export { Rest };
export class StreamPlayer {
	private context: AudioContext | null = null;
	private readonly sources = new Set<AudioBufferSourceNode>();
	private nextStart = 0;
	private onStateChange: () => void = () => undefined;

	setOnStateChange(onStateChange: () => void): void {
		this.onStateChange = onStateChange;
	}

	get isPlaying(): boolean {
		return this.sources.size > 0;
	}

	async start(): Promise<void> {
		this.stop();
		this.context = new AudioContext({ sampleRate: 24000 });
		await this.context.resume();
		this.nextStart = this.context.currentTime + 0.05;
	}

	queue(samples: Float32Array, pauseSeconds: number): void {
		if (!this.context) throw new Error("Audio playback has not started.");
		const buffer = this.context.createBuffer(1, samples.length, 24000);
		buffer.copyToChannel(new Float32Array(samples), 0);
		const source = this.context.createBufferSource();
		source.buffer = buffer;
		source.connect(this.context.destination);
		source.addEventListener("ended", () => {
			this.sources.delete(source);
			this.onStateChange();
		});
		const startAt = Math.max(this.nextStart, this.context.currentTime + 0.05);
		source.start(startAt);
		this.nextStart = startAt + buffer.duration + pauseSeconds;
		this.sources.add(source);
		this.onStateChange();
	}

	stop(): void {
		for (const source of this.sources) source.stop();
		this.sources.clear();
		void this.context?.close();
		this.context = null;
		this.onStateChange();
	}
}

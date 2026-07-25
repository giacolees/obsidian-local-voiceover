export const SAMPLE_RATE = 24000;

function mulberry32(seed) {
	let state = seed >>> 0;
	return () => {
		state += 0x6d2b79f5;
		let value = state;
		value = Math.imul(value ^ (value >>> 15), value | 1);
		value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
		return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
	};
}

export function seededNormalNoise(seed, channels, frames) {
	const random = mulberry32(seed);
	const output = new Float32Array(channels * frames);
	for (let index = 0; index < output.length; index += 2) {
		const radius = Math.sqrt(
			-2 * Math.log(Math.max(random(), Number.MIN_VALUE)),
		);
		const angle = 2 * Math.PI * random();
		output[index] = radius * Math.cos(angle);
		if (index + 1 < output.length) output[index + 1] = radius * Math.sin(angle);
	}
	return output;
}

export function boundaryPauseSeconds(chunk) {
	return (
		{ "?": 0.28, "!": 0.24, ".": 0.22, ";": 0.16, ":": 0.13, ",": 0.09 }[
			chunk.trim().at(-1)
		] ?? 0.08
	);
}

export function edgeFade(samples, sampleRate = SAMPLE_RATE, milliseconds = 5) {
	const output = samples.slice();
	const frames = Math.min(
		Math.round((sampleRate * milliseconds) / 1000),
		Math.floor(output.length / 2),
	);
	for (let index = 0; index < frames; index += 1) {
		const gain = frames === 1 ? 1 : index / (frames - 1);
		output[index] *= gain;
		output[output.length - 1 - index] *= gain;
	}
	return output;
}

export function concatenateChunks(
	chunks,
	sourceChunks,
	sampleRate = SAMPLE_RATE,
) {
	const total = chunks.reduce(
		(sum, chunk, index) =>
			sum +
			chunk.length +
			(index
				? Math.round(sampleRate * boundaryPauseSeconds(sourceChunks[index - 1]))
				: 0),
		0,
	);
	const output = new Float32Array(total);
	let offset = 0;
	for (let index = 0; index < chunks.length; index += 1) {
		if (index)
			offset += Math.round(
				sampleRate * boundaryPauseSeconds(sourceChunks[index - 1]),
			);
		output.set(edgeFade(chunks[index], sampleRate), offset);
		offset += chunks[index].length;
	}
	return output;
}

export function encodeFloat32Wav(samples, sampleRate = SAMPLE_RATE) {
	const buffer = new ArrayBuffer(44 + samples.length * 4);
	const view = new DataView(buffer);
	view.setUint32(0, 0x52494646, false);
	view.setUint32(4, 36 + samples.length * 4, true);
	view.setUint32(8, 0x57415645, false);
	view.setUint32(12, 0x666d7420, false);
	view.setUint32(16, 16, true);
	view.setUint16(20, 3, true);
	view.setUint16(22, 1, true);
	view.setUint32(24, sampleRate, true);
	view.setUint32(28, sampleRate * 4, true);
	view.setUint16(32, 4, true);
	view.setUint16(34, 32, true);
	view.setUint32(36, 0x64617461, false);
	view.setUint32(40, samples.length * 4, true);
	new Float32Array(buffer, 44).set(samples);
	return buffer;
}

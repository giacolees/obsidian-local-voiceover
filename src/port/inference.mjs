import * as ort from "onnxruntime-web";
import { createInflectFrontend, MAX_TOKENS } from "./frontend.mjs";
import { seededNormalNoise } from "./runtime.mjs";

export const SAMPLE_RATE = 24000;

/**
 * Runs the official Inflect Micro v2 FP32 ONNX export in a browser worker.
 * Both graphs use one execution provider so WebGPU initialization can fall
 * back atomically to WASM.
 */
export async function createInflectInference({ loadModel, wasmPaths = "./wasm/" }) {
	const nodeProcess = globalThis.process;
	try {
		globalThis.process = undefined;
		ort.env.wasm.wasmPaths = wasmPaths;
		ort.env.wasm.numThreads = 1;
		const [durationModel, decodeModel, frontend] = await Promise.all([
			loadModel("duration.onnx"),
			loadModel("decode.onnx"),
			createInflectFrontend(),
		]);
		const createSessions = async (provider) => {
			let duration;
			try {
				duration = await ort.InferenceSession.create(durationModel.slice(0), { executionProviders: [provider] });
				const decode = await ort.InferenceSession.create(decodeModel.slice(0), { executionProviders: [provider] });
				return [duration, decode];
			} catch (error) {
				await duration?.release?.();
				throw error;
			}
		};
		let duration;
		let decode;
		let backend = "wasm";
		let fallbackReason;
		if (globalThis.navigator?.gpu) {
			try {
				[duration, decode] = await createSessions("webgpu");
				backend = "webgpu";
			} catch (error) {
				fallbackReason = error instanceof Error ? error.message : String(error);
			}
		}
		if (!duration || !decode) [duration, decode] = await createSessions("wasm");

		const synthesizeChunk = async (output, seed, speed, variation) => {
			if (output.ids.length > MAX_TOKENS)
				throw new Error(`Token limit exceeded: ${output.ids.length}`);
			const tokens = BigInt64Array.from(output.ids, BigInt);
			const durationOutput = await duration.run({
				tokens: new ort.Tensor("int64", tokens, [1, tokens.length]),
				lengths: new ort.Tensor("int64", BigInt64Array.of(BigInt(tokens.length)), [1]),
				length_scale: new ort.Tensor("float32", Float32Array.of(1 / speed), []),
			});
			const mPExp = durationOutput.m_p_exp;
			const waveform = (await decode.run({
				m_p_exp: mPExp,
				logs_p_exp: durationOutput.logs_p_exp,
				y_mask: durationOutput.y_mask,
				zp_noise: new ort.Tensor("float32", seededNormalNoise(seed, 1, mPExp.data.length), mPExp.dims),
				noise_scale: new ort.Tensor("float32", Float32Array.of(variation), []),
			})).waveform.data;
			return { waveform };
		};

		return {
			backend,
			fallbackReason,
			frontend,
			async synthesize(text, { speed = 1, variation = 0.667, seed = 0, onChunk, signal } = {}) {
				const outputs = frontend.phonemizeChunks(text);
				const sourceChunks = outputs.map((output) => output.source);
				const pieces = [];
				for (let index = 0; index < outputs.length; index += 1) {
					if (signal?.aborted) throw new DOMException("Synthesis aborted.", "AbortError");
					const piece = await synthesizeChunk(outputs[index], seed + index, speed, variation);
					pieces.push(piece);
					await onChunk?.({ ...piece, index, total: outputs.length, source: sourceChunks[index] });
				}
				return { sourceChunks, outputs, pieces };
			},
		};
	} finally {
		globalThis.process = nodeProcess;
	}
}

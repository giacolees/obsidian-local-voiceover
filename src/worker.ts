import { createInflectInference } from "./port/inference.mjs";

type InitMessage = {
	type: "init";
	models: Record<"inflect-core.onnx" | "inflect-decoder.onnx", ArrayBuffer>;
	wasmPaths: { mjs: string; wasm: string };
};
type SynthesizeMessage = { type: "synthesize"; id: number; text: string };
type AbortMessage = { type: "abort"; id: number };

let inference: Awaited<ReturnType<typeof createInflectInference>> | null = null;
const controllers = new Map<number, AbortController>();

self.onmessage = (event: MessageEvent<InitMessage | SynthesizeMessage | AbortMessage>) => {
	void handleMessage(event.data);
};

async function handleMessage(message: InitMessage | SynthesizeMessage | AbortMessage): Promise<void> {
	if (message.type === "abort") {
		controllers.get(message.id)?.abort();
		return;
	}
	if (message.type === "init") {
		try {
			inference = await createInflectInference({
				loadModel: async (name: "inflect-core.onnx" | "inflect-decoder.onnx") => message.models[name],
				wasmPaths: message.wasmPaths as unknown as string,
			});
			post({ type: "ready" });
		} catch (error) {
			post({ type: "init-error", message: errorMessage(error) });
		}
		return;
	}
	if (!inference) {
		post({ type: "error", id: message.id, message: "Speech worker is not initialized." });
		return;
	}
	const controller = new AbortController();
	controllers.set(message.id, controller);
	try {
		await (inference.synthesize as (text: string, options: Record<string, unknown>) => Promise<unknown>)(message.text, {
			signal: controller.signal,
			onChunk: async (chunk: { waveform: Float32Array; source: string }) => {
				post(
					{ type: "chunk", id: message.id, waveform: chunk.waveform, source: chunk.source },
					[chunk.waveform.buffer as ArrayBuffer],
				);
			},
		});
		post({ type: "complete", id: message.id });
	} catch (error) {
		post({ type: "error", id: message.id, message: errorMessage(error) });
	} finally {
		controllers.delete(message.id);
	}
}

function post(message: unknown, transfer?: Transferable[]): void {
	(self as unknown as { postMessage(data: unknown, transfer?: Transferable[]): void }).postMessage(message, transfer);
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

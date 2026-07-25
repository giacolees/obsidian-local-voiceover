"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// main.ts
var main_exports = {};
__export(main_exports, {
  default: () => LocalVoiceoverPlugin
});
module.exports = __toCommonJS(main_exports);
var import_obsidian2 = require("obsidian");

// src/modelCache.ts
var import_obsidian = require("obsidian");
var MODEL_URL = "https://huggingface.co/giacolees/Inflect-Micro-v2-ONNX/resolve/main";
var ModelCache = class {
  constructor(adapter, pluginDirectory) {
    this.adapter = adapter;
    this.manifest = null;
    this.root = (0, import_obsidian.normalizePath)(`${pluginDirectory}/models`);
  }
  async load(name, onProgress) {
    const manifest = await this.loadManifest();
    const path = this.pathFor(name);
    if (await this.adapter.exists(path)) {
      const bytes2 = await this.adapter.readBinary(path);
      if (manifest.models[name] && await sha256(bytes2) === manifest.models[name]?.sha256)
        return bytes2;
      await this.adapter.remove(path);
    }
    onProgress(0);
    const response = await (0, import_obsidian.requestUrl)({ url: `${MODEL_URL}/${name}`, throw: false });
    if (response.status < 200 || response.status >= 300)
      throw new Error(`Could not download ${name} (${response.status}).`);
    const bytes = response.arrayBuffer;
    onProgress(bytes.byteLength, bytes.byteLength);
    await this.ensureRoot();
    await this.adapter.writeBinary(path, bytes);
    manifest.models[name] = { url: `${MODEL_URL}/${name}`, sha256: await sha256(bytes), bytes: bytes.byteLength };
    await this.adapter.write(this.manifestPath(), JSON.stringify(manifest));
    return bytes;
  }
  async loadManifest() {
    if (this.manifest)
      return this.manifest;
    const path = this.manifestPath();
    this.manifest = await this.adapter.exists(path) ? JSON.parse(await this.adapter.read(path)) : { version: 1, models: {} };
    return this.manifest;
  }
  async ensureRoot() {
    if (!await this.adapter.exists(this.root))
      await this.adapter.mkdir(this.root);
  }
  pathFor(name) {
    return (0, import_obsidian.normalizePath)(`${this.root}/${name}`);
  }
  manifestPath() {
    return (0, import_obsidian.normalizePath)(`${this.root}/manifest.json`);
  }
};
async function sha256(value) {
  const digest = await crypto.subtle.digest("SHA-256", value);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

// src/player.ts
var StreamPlayer = class {
  constructor() {
    this.context = null;
    this.sources = /* @__PURE__ */ new Set();
    this.nextStart = 0;
  }
  async start() {
    this.stop();
    this.context = new AudioContext({ sampleRate: 24e3 });
    await this.context.resume();
    this.nextStart = this.context.currentTime + 0.05;
  }
  queue(samples, pauseSeconds) {
    if (!this.context)
      throw new Error("Audio playback has not started.");
    const buffer = this.context.createBuffer(1, samples.length, 24e3);
    buffer.copyToChannel(new Float32Array(samples), 0);
    const source = this.context.createBufferSource();
    source.buffer = buffer;
    source.connect(this.context.destination);
    source.addEventListener("ended", () => this.sources.delete(source));
    const startAt = Math.max(this.nextStart, this.context.currentTime + 0.05);
    source.start(startAt);
    this.nextStart = startAt + buffer.duration + pauseSeconds;
    this.sources.add(source);
  }
  stop() {
    for (const source of this.sources)
      source.stop();
    this.sources.clear();
    void this.context?.close();
    this.context = null;
  }
};

// src/port/runtime.mjs
var SAMPLE_RATE = 24e3;
function boundaryPauseSeconds(chunk) {
  return { "?": 0.28, "!": 0.24, ".": 0.22, ";": 0.16, ":": 0.13, ",": 0.09 }[chunk.trim().at(-1)] ?? 0.08;
}
function edgeFade(samples, sampleRate = SAMPLE_RATE, milliseconds = 5) {
  const output = samples.slice();
  const frames = Math.min(
    Math.round(sampleRate * milliseconds / 1e3),
    Math.floor(output.length / 2)
  );
  for (let index = 0; index < frames; index += 1) {
    const gain = frames === 1 ? 1 : index / (frames - 1);
    output[index] *= gain;
    output[output.length - 1 - index] *= gain;
  }
  return output;
}

// src/workerClient.ts
var SpeechWorkerClient = class {
  constructor(workerSource) {
    this.pending = /* @__PURE__ */ new Map();
    this.nextId = 1;
    const workerUrl = URL.createObjectURL(
      new Blob([workerSource], { type: "application/javascript" })
    );
    this.worker = new Worker(workerUrl);
    URL.revokeObjectURL(workerUrl);
    this.ready = new Promise((resolve, reject) => {
      this.resolveReady = resolve;
      this.rejectReady = reject;
    });
    this.worker.addEventListener("message", (event) => this.handleMessage(event.data));
    this.worker.addEventListener("error", (event) => this.failAll(new Error(event.message)));
  }
  async initialize(models, wasmPaths) {
    this.worker.postMessage({ type: "init", models, wasmPaths }, [models["inflect-core.onnx"], models["inflect-decoder.onnx"]]);
    return this.ready;
  }
  synthesize(text, onChunk, signal) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { onChunk, resolve, reject });
      signal.addEventListener("abort", () => this.worker.postMessage({ type: "abort", id }), { once: true });
      this.worker.postMessage({ type: "synthesize", id, text });
    });
  }
  dispose() {
    this.failAll(new Error("Speech worker disposed."));
    this.worker.terminate();
  }
  handleMessage(message) {
    if (message.type === "ready") {
      this.resolveReady();
      return;
    }
    if (message.type === "init-error") {
      this.rejectReady(new Error(String(message.message)));
      return;
    }
    const id = Number(message.id);
    const pending = this.pending.get(id);
    if (!pending)
      return;
    if (message.type === "chunk") {
      pending.onChunk({ waveform: message.waveform, source: String(message.source) });
      return;
    }
    this.pending.delete(id);
    if (message.type === "complete")
      pending.resolve();
    else
      pending.reject(new Error(String(message.message)));
  }
  failAll(error) {
    this.rejectReady(error);
    for (const pending of this.pending.values())
      pending.reject(error);
    this.pending.clear();
  }
};

// main.ts
var LocalVoiceoverPlugin = class extends import_obsidian2.Plugin {
  constructor() {
    super(...arguments);
    this.player = new StreamPlayer();
    this.abortController = null;
    this.worker = null;
    this.loading = null;
  }
  async onload() {
    this.addCommand({
      id: "speak-selected-text",
      name: "Speak selected text",
      editorCheckCallback: (checking, editor) => this.speakCommand(checking, editor)
    });
    this.addCommand({
      id: "stop-speaking",
      name: "Stop speaking",
      checkCallback: (checking) => {
        if (!this.abortController)
          return false;
        if (!checking)
          this.stop();
        return true;
      }
    });
    this.register(() => this.disposeRuntime());
  }
  speakCommand(checking, editor) {
    const text = editor.getSelection().trim();
    if (!text || this.abortController)
      return false;
    if (!checking)
      window.setTimeout(() => void this.speak(text), 0);
    return true;
  }
  async speak(text) {
    const abort = new AbortController();
    this.abortController = abort;
    try {
      await this.player.start();
      const worker = await this.getWorker();
      if (abort.signal.aborted)
        return;
      new import_obsidian2.Notice("Generating local speech\u2026");
      await worker.synthesize(
        text,
        (chunk) => {
          if (!abort.signal.aborted) {
            const faded = edgeFade(chunk.waveform);
            this.player.queue(faded, Number(boundaryPauseSeconds(chunk.source)));
          }
        },
        abort.signal
      );
    } catch (error) {
      if (!abort.signal.aborted) {
        console.error("Local Voiceover synthesis failed", error);
        const message = error instanceof Error ? error.message : "Unknown synthesis error.";
        new import_obsidian2.Notice(`Local Voiceover: ${message}`);
      }
    } finally {
      if (this.abortController === abort)
        this.abortController = null;
    }
  }
  getWorker() {
    if (this.worker)
      return Promise.resolve(this.worker);
    if (this.loading)
      return this.loading;
    new import_obsidian2.Notice("Preparing local inflect voice model\u2026");
    const pluginDirectory = (0, import_obsidian2.normalizePath)(`${this.app.vault.configDir}/plugins/${this.manifest.id}`);
    const cache = new ModelCache(this.app.vault.adapter, pluginDirectory);
    const wasmFile = this.app.vault.adapter.getResourcePath(
      (0, import_obsidian2.normalizePath)(`${pluginDirectory}/wasm/ort-wasm-simd-threaded.wasm`)
    );
    const workerPath = (0, import_obsidian2.normalizePath)(`${pluginDirectory}/worker.js`);
    this.loading = Promise.all([
      cache.load("inflect-core.onnx", () => void 0),
      cache.load("inflect-decoder.onnx", () => void 0),
      this.app.vault.adapter.read(workerPath)
    ]).then(async ([core, decoder, workerSource]) => {
      const worker = new SpeechWorkerClient(workerSource);
      await worker.initialize(
        { "inflect-core.onnx": core, "inflect-decoder.onnx": decoder },
        new URL(".", wasmFile).href
      );
      this.worker = worker;
      return worker;
    }).finally(() => {
      this.loading = null;
    });
    return this.loading;
  }
  stop() {
    this.abortController?.abort();
    this.abortController = null;
    this.player.stop();
    new import_obsidian2.Notice("Speech stopped.");
  }
  disposeRuntime() {
    this.abortController?.abort();
    this.abortController = null;
    this.player.stop();
    this.worker?.dispose();
    this.worker = null;
  }
};

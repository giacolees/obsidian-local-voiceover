# Local Voiceover for Obsidian

GPL-3.0-or-later desktop Obsidian plugin that speaks the current editor selection with local Inflect Micro v2 ONNX/WebAssembly inference.

- First use downloads the two ONNX graphs from [`giacolees/Inflect-Micro-v2-ONNX`](https://huggingface.co/giacolees/Inflect-Micro-v2-ONNX).
- Graph bytes are stored in the plugin data directory and reused offline.
- Text normalization, eSpeak-compatible WASM phonemization, ONNX inference, and playback run in the renderer. There is no provider, Python process, or uploaded note content.

## Commands

- **Speak selected text**
- **Stop speaking**

## License and provenance

This plugin bundles `ephone@1.0.2`, which is GPL-3.0-or-later. The plugin is therefore GPL-3.0-or-later. See `THIRD_PARTY_NOTICES.md`, `third_party/EPHONE_COPYING.txt`, and `UPSTREAM_INFLECT_LICENSE`.

The model weights are not bundled. They are retrieved from the linked Hugging Face ONNX repository on first use.

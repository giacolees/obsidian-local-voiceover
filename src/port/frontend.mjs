import createEphone from "ephone";

export const MAX_TOKENS = 512;
const SYMBOLS =
	"_;:,.!?¡¿—…\"«»“” ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyzɑɐɒæɓʙβɔɕçɗɖðʤəɘɚɛɜɝɞɟʄɡɠɢʛɦɧħɥʜɨɪʝɭɬɫɮʟɱɯɰŋɳɲɴøɵɸθœɶʘɹɺɾɻʀʁɽʂʃʈʧʉʊʋⱱʌɣɤʍχʎʏʑʐʒʔʡʕʢǀǁǂǃˈˌːˑʼʴʰʱʲʷˠˤ˞↓↑→↗↘'̩'ᵻ";
const SYMBOL_TO_ID = new Map(
	[...SYMBOLS].map((symbol, index) => [symbol, index]),
);
const MONTHS = [
	"January",
	"February",
	"March",
	"April",
	"May",
	"June",
	"July",
	"August",
	"September",
	"October",
	"November",
	"December",
];
const LETTERS = {
	A: "ay",
	B: "bee",
	C: "see",
	D: "dee",
	E: "ee",
	F: "eff",
	G: "gee",
	H: "aitch",
	I: "eye",
	J: "jay",
	K: "kay",
	L: "ell",
	M: "em",
	N: "en",
	O: "oh",
	P: "cue",
	Q: "cue",
	R: "ar",
	S: "ess",
	T: "tee",
	U: "you",
	V: "vee",
	W: "double you",
	X: "ex",
	Y: "why",
	Z: "zee",
};
const SMALL = [
	"zero",
	"one",
	"two",
	"three",
	"four",
	"five",
	"six",
	"seven",
	"eight",
	"nine",
	"ten",
	"eleven",
	"twelve",
	"thirteen",
	"fourteen",
	"fifteen",
	"sixteen",
	"seventeen",
	"eighteen",
	"nineteen",
];
const TENS = [
	"",
	"",
	"twenty",
	"thirty",
	"forty",
	"fifty",
	"sixty",
	"seventy",
	"eighty",
	"ninety",
];

function words(value) {
	if (value < 20) return SMALL[value];
	if (value < 100)
		return `${TENS[Math.floor(value / 10)]}${value % 10 ? ` ${SMALL[value % 10]}` : ""}`;
	if (value < 1000)
		return `${SMALL[Math.floor(value / 100)]} hundred${value % 100 ? ` and ${words(value % 100)}` : ""}`;
	if (value < 1000000)
		return `${words(Math.floor(value / 1000))} thousand${value % 1000 ? ` and ${words(value % 1000)}` : ""}`;
	return String(value);
}
function ordinal(value) {
	const special = {
		one: "first",
		two: "second",
		three: "third",
		four: "fourth",
		five: "fifth",
		six: "sixth",
		seven: "seventh",
		eight: "eighth",
		nine: "ninth",
		ten: "tenth",
		eleven: "eleventh",
		twelve: "twelfth",
		thirteen: "thirteenth",
		fourteen: "fourteenth",
		fifteen: "fifteenth",
		sixteen: "sixteenth",
		seventeen: "seventeenth",
		eighteen: "eighteenth",
		nineteen: "nineteenth",
		twenty: "twentieth",
		thirty: "thirtieth",
	};
	const valueWords = words(value).split(" ");
	const last = valueWords.pop();
	return [...valueWords, special[last] ?? `${last}th`].join(" ");
}
const digitWords = (text) =>
	[...text]
		.filter((char) => /\d/.test(char))
		.map((char) => words(Number(char)))
		.join(" ");

export function stripMarkdown(input, rules) {
	let text = input;
	if (rules.links)
		text = text.replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/\[([^\]]+)\]\([^)]*\)/g, "$1").replace(/<https?:\/\/[^>]+>/g, "");
	if (rules.code)
		text = text.replace(/^\s*```[^\n]*\n?/gm, "").replace(/^\s*```\s*$/gm, "").replace(/`([^`]*)`/g, "$1");
	if (rules.headings) text = text.replace(/^\s{0,3}#{1,6}\s+(.+?)(?:\s+#+)?\s*$/gm, "$1");
	if (rules.listsAndQuotes)
		text = text.replace(/^\s{0,3}>\s?/gm, "").replace(/^\s{0,3}(?:[-+*]|\d+[.)])\s+/gm, "").replace(/^\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?$/gm, "").replace(/\|/g, " ");
	if (rules.emphasis)
		text = text.replace(/\*\*([^*]+)\*\*/g, "$1").replace(/__([^_]+)__/g, "$1").replace(/(?<!\w)\*([^*]+)\*(?!\w)/g, "$1").replace(/(?<!\w)_([^_]+)_(?!\w)/g, "$1");
	if (rules.strikethroughAndRules)
		text = text.replace(/~~([^~]+)~~/g, "$1").replace(/^\s{0,3}(?:[-*_]\s*){3,}$/gm, "");
	return text.replace(/\\([!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~])/g, "$1");
}

export function normalizeText(input) {
	let text = input
		.replace(/[‘’]/g, "'")
		.replace(/[“”]/g, '"')
		.replace(/[–—]/g, ", ")
		.replace(/…/g, "...")
		.replace(/[()[\]{}]/g, ", ")
		.replace(/\s+/g, " ")
		.trim();
	const overrides = {
		Qwen3: "Qwen three",
		Qwen: "Qwen",
		PyTorch: "pie torch",
		SQLite: "ess cue lite",
		"USB-C": "you ess bee see",
		"RTX 3060": "ar tee ex thirty sixty",
		"RTX 3090": "ar tee ex thirty ninety",
		"RTX 4090": "ar tee ex forty ninety",
		"RTX 5080": "ar tee ex fifty eighty",
		"RTX 5090": "ar tee ex fifty ninety",
	};
	for (const [from, to] of Object.entries(overrides))
		text = text.replace(
			new RegExp(`\\b${from.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "g"),
			to,
		);
	const abbreviations = {
		"Dr.": "doctor",
		"Mr.": "mister",
		"Mrs.": "missus",
		"Ms.": "miss",
		"Prof.": "professor",
		"St.": "saint",
		"vs.": "versus",
		"etc.": "et cetera",
		"e.g.": "for example",
		"i.e.": "that is",
	};
	for (const [from, to] of Object.entries(abbreviations))
		text = text.replace(
			new RegExp(`\\b${from.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "gi"),
			to,
		);
	text = text.replace(/\b([A-Z])(?:\.([A-Z]))+\./g, (match) =>
		[...match].filter((char) => /[A-Z]/.test(char)).join(" "),
	);
	text = text.replace(/\$(\d[\d,]*(?:\.\d{1,2})?)/g, (_, raw) => {
		const [dollars, cents] = raw.replace(/,/g, "").split(".");
		const amount = Number(dollars);
		return `${words(amount)} ${amount === 1 ? "dollar" : "dollars"}${cents && Number(cents) ? ` and ${words(Number(cents.padEnd(2, "0")))} ${Number(cents) === 1 ? "cent" : "cents"}` : ""}`;
	});
	text = text.replace(
		/\b(0?[1-9]|1[0-2])\/(0?[1-9]|[12]\d|3[01])\/(20\d{2}|19\d{2})\b/g,
		(_, month, day, year) =>
			`${MONTHS[Number(month) - 1]} ${ordinal(Number(day))} ${words(Number(year))}`,
	);
	text = text.replace(
		/\b(\d{1,2}):(\d{2})\s*([AaPp]\.?\s*[Mm])?(?=\s|$|[.,;:!?])/g,
		(_, hour, minute, suffix = "") =>
			`${words(Number(hour))} ${Number(minute) === 0 ? "o clock" : Number(minute) < 10 ? `oh ${words(Number(minute))}` : words(Number(minute))}${suffix ? ` ${suffix.toLowerCase().replace(/\./g, "").split("").join(" ")}` : ""}`,
	);
	text = text.replace(/\b\d+(?:\.\d+){2,}\b/g, (value) =>
		value
			.split(".")
			.map((part) => words(Number(part)))
			.join(" point "),
	);
	text = text.replace(
		/\b(\d+)\.(\d+)\b/g,
		(_, whole, fraction) =>
			`${words(Number(whole))} point ${digitWords(fraction)}`,
	);
	text = text.replace(/\b(\d+)(st|nd|rd|th)\b/gi, (_, value) =>
		ordinal(Number(value)),
	);
	text = text.replace(/\b\d[\d,]*\b/g, (value) =>
		words(Number(value.replace(/,/g, ""))),
	);
	text = text.replace(/\b[A-Z]{2,}\b/g, (value) =>
		[...value].map((letter) => LETTERS[letter]).join(" "),
	);
	return text
		.replace(/,(?:\s*,)+/g, ",")
		.replace(/,\s*([.!?])/g, "$1")
		.replace(/\s+([,;:.!?])/g, "$1")
		.replace(/([,;:.!?])(?=\S)/g, "$1 ")
		.replace(/\s+/g, " ")
		.trim();
}

function restorePunctuation(ipa, normalized) {
	const marks = [...normalized].filter((char) => /[,;:.!?]/.test(char));
	let index = 0;
	return ipa.replace(/[,;:.!?]/g, () => marks[index++] ?? ",");
}

export function splitText(text, limit = 280) {
	const normalized = text.trim().replace(/\s+/g, " ");
	const sentences = normalized.split(/(?<=[.!?;:])\s+/).filter(Boolean);
	const chunks = [];
	for (let sentence of sentences.length ? sentences : [normalized]) {
		while (sentence.length > limit) {
			const search = sentence.slice(0, limit + 1);
			const punctuation = Math.max(
				...[",", ";", ":"].map((mark) => search.lastIndexOf(mark)),
			);
			let splitAt =
				punctuation >= Math.floor(limit / 2)
					? punctuation + 1
					: sentence.lastIndexOf(" ", limit);
			if (splitAt < Math.floor(limit / 2)) splitAt = limit;
			chunks.push(sentence.slice(0, splitAt).trim());
			sentence = sentence.slice(splitAt).trim();
		}
		if (sentence) chunks.push(sentence);
	}
	return chunks;
}

function splitOversizedChunk(chunk) {
	const middle = Math.floor(chunk.length / 2);
	const findBoundary = (direction) => {
		for (
			let index = middle;
			index > 0 && index < chunk.length - 1;
			index += direction
		) {
			if (/[\s,;:]/.test(chunk[index])) return index;
		}
		return -1;
	};
	const before = findBoundary(-1);
	const boundary = before >= 0 ? before : findBoundary(1);
	if (boundary < 1)
		throw new Error(
			`A single word exceeds Inflect's ${MAX_TOKENS}-token limit`,
		);
	const offset = /\s/.test(chunk[boundary]) ? boundary : boundary + 1;
	return [chunk.slice(0, offset).trim(), chunk.slice(offset).trim()];
}

export async function createInflectFrontend() {
	const ephone = await createEphone();
	const phonemize = (text) => {
		const normalizedText = normalizeText(text);
		const phonemeText = restorePunctuation(
			ephone.textToIpa(normalizedText),
			normalizedText,
		);
		const ids = [...phonemeText].map((symbol) => {
			const id = SYMBOL_TO_ID.get(symbol);
			if (id === undefined)
				throw new Error(
					`Unsupported Inflect symbol: ${JSON.stringify(symbol)}`,
				);
			return id;
		});
		const interspersedIds = [0, ...ids.flatMap((id) => [id, 0])];
		return { normalizedText, phonemeText, ids: interspersedIds };
	};
	const phonemizeChunks = (text, markdownNormalization = "default", markdownRules) => {
		const defaultRules = { headings: true, emphasis: true, links: true, listsAndQuotes: true, code: true, strikethroughAndRules: true };
		const rules = markdownNormalization === "custom" ? { ...defaultRules, ...markdownRules } : defaultRules;
		const pending = splitText(markdownNormalization === "none" ? text : stripMarkdown(text, rules));
		const outputs = [];
		while (pending.length) {
			const source = pending.shift();
			const output = phonemize(source);
			if (output.ids.length <= MAX_TOKENS) {
				outputs.push({ ...output, source });
				continue;
			}
			const [left, right] = splitOversizedChunk(source);
			pending.unshift(left, right);
		}
		return outputs;
	};
	return { phonemize, phonemizeChunks };
}

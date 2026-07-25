import tsparser from "@typescript-eslint/parser";
import obsidianmd from "eslint-plugin-obsidianmd";

export default [
  { ignores: ["**/node_modules/**", "**/*.js", "**/*.mjs", "**/*.json", "main.js"] },
  ...obsidianmd.configs.recommended,
  {
    files: ["**/*.ts"],
    languageOptions: { parser: tsparser, parserOptions: { project: "./tsconfig.json" } }
  }
];

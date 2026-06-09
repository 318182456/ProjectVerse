import obsidianmd from "eslint-plugin-obsidianmd";

export default [
  {
    ignores: [
      "**/node_modules/**",
      "**/*.js",
      "**/*.mjs",
      "**/*.json",
      "**/*.css"
    ]
  },
  ...obsidianmd.configs.recommended,
  {
    files: ["**/*.ts"],
    languageOptions: {
      parserOptions: {
        project: "./tsconfig.json",
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "obsidianmd/no-unsupported-api": "error"
    }
  }
];

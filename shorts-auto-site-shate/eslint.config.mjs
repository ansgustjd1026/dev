import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "toss-app/dist/**",
    "next-env.d.ts",
  ]),
  {
    files: ["toss-app/src/**/*.{ts,tsx}"],
    rules: { "@next/next/no-img-element": "off" },
  },
]);

export default eslintConfig;

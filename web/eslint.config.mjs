import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // 整份 mock-topic.json 里带着答案（每个提问者缺什么、每张卡给谁会反噬）。
    // 谁 import 它，答案就又被打进包里 —— 那这次拆分就白做了。
    // 要公开数据走 @/lib/topic，要暗牌走 @/lib/secret（结算时才 fetch）。
    files: ["src/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["**/data/mock-topic.json", "@/data/mock-topic.json"],
              message:
                "别直接引 mock-topic.json，它带答案。公开数据用 @/lib/topic，暗牌用 @/lib/secret。",
            },
          ],
        },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;

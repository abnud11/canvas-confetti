import eslint from "@eslint/js";
import prettierPluginRecommended from "eslint-plugin-prettier/recommended";
import tseslint from "typescript-eslint";
import stylistic from "@stylistic/eslint-plugin";
import unicorn from "eslint-plugin-unicorn";
import compat from "eslint-plugin-compat";
export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  ...tseslint.configs.stylistic,
  ...tseslint.configs.recommendedTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  compat.configs["flat/recommended"],
  {
    languageOptions: {
      parserOptions: {
        project: true,
      },
    },
  },
  unicorn.configs.recommended,
  stylistic.configs.recommended,
  {
    rules: {
      "unicorn/no-null": "off",
    },
  },
  prettierPluginRecommended,
);

# Capacitor image sources

These are independent Custom Mode inputs for `@capacitor/assets`:

- `icon-only.png` is the sole source for native app icons.
- `splash.png` is the sole source for native splash screens.

From `artifacts/op-potato`, run `pnpm assets:generate:ios`. Do not replace
`splash.png` with the icon or use Easy Mode's single `icon.png`/`logo.png`
source, because Easy Mode generates both icons and splash screens from it.

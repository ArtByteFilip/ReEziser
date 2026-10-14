# BUILD

The ready-to-run desktop app goes here: `ReEziser.exe`, a single file that needs no installation (it needs the WebView2 runtime, which Windows 10/11 normally has).

Binaries are not kept in git. To make one:

```sh
npm run desktop:exe     # builds the app and copies it here as ReEziser.exe
npm run desktop:build   # the .msi installer, in src-tauri/target/release/bundle/msi
```

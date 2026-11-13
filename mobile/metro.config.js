// The phone app shares the website's photo checks, fix solver and camera guides (../src/lib)
// instead of copying them, so both always give the same advice.
const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");
const { exifrForHermes } = require("./scripts/exifr-hermes");

const config = getDefaultConfig(__dirname);
const shared = path.resolve(__dirname, "../src/lib");

config.watchFolders = [shared];
// Shared files import packages like exifr; resolve them from this app's node_modules, which is
// the only one installed when Expo builds the app in the cloud.
config.resolver.nodeModulesPaths = [path.resolve(__dirname, "node_modules")];

// A copy of exifr the phone's JavaScript engine can compile (see scripts/exifr-hermes.js).
const exifr = exifrForHermes();
const resolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) =>
  moduleName === "exifr"
    ? { type: "sourceFile", filePath: exifr }
    : (resolveRequest ?? context.resolveRequest)(context, moduleName, platform);

module.exports = config;

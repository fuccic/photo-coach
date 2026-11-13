// exifr's full build has one dynamic import() (only used under Node) that the phone's JavaScript
// engine, Hermes, refuses to compile. This writes a copy with that import() replaced and returns
// its path, for the bundler (metro.config.js) and the tests (vitest.config.mts) to use as "exifr".
// The lite build has no import() but can't read raw files (DNG, CR2), so it isn't used.
const fs = require("fs");
const path = require("path");

const DYNAMIC_IMPORT = "import(/* webpackIgnore: true */ e)";

function exifrForHermes() {
  const source = require.resolve("exifr/dist/full.umd.js", { paths: [path.resolve(__dirname, "..")] });
  const code = fs.readFileSync(source, "utf8");
  if (code.split(DYNAMIC_IMPORT).length !== 2) {
    throw new Error("exifr changed: update scripts/exifr-hermes.js for the new version");
  }
  const out = path.resolve(__dirname, "../node_modules/.cache/photo-coach/exifr.js");
  const patched = code.replace(DYNAMIC_IMPORT, "Promise.reject(new Error(e))");
  if (!fs.existsSync(out) || fs.readFileSync(out, "utf8") !== patched) {
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, patched);
  }
  return out;
}

module.exports = { exifrForHermes };

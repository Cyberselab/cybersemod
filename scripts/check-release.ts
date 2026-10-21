import config from "../packages/config/package.json";
import command from "../packages/command/package.json";

const tag = process.env.RELEASE_TAG;
// Build metadata is intentionally excluded: npm versions cannot differ only by metadata.
const identifier = "(?:0|[1-9]\\d*|\\d*[a-zA-Z-][0-9a-zA-Z-]*)";
const semver = new RegExp(`^v(0|[1-9]\\d*)\\.(0|[1-9]\\d*)\\.(0|[1-9]\\d*)(?:-${identifier}(?:\\.${identifier})*)?$`);
if (!tag || !semver.test(tag)) {
  throw new Error("Release tag must be v<semver>, e.g. v0.1.0 or v0.2.0-rc.1 (without build metadata).");
}
const version = tag.slice(1);
for (const pkg of [config, command]) {
  if (pkg.version !== version) {
    throw new Error(`${pkg.name} version ${pkg.version} does not match release ${tag}. Update both packages before tagging.`);
  }
}
if (process.env.RELEASE_PRERELEASE !== String(version.includes("-"))) {
  throw new Error("The GitHub Release prerelease flag must match the version's prerelease suffix.");
}
console.log(`Release ${tag} validated for ${config.name} and ${command.name}.`);

export interface BuildInfo { version: string; branch?: string; commit?: string }

export function formatBuildInfo(info: BuildInfo): string {
  return `${info.version} (${info.branch ?? "unknown"}@${info.commit ?? "unknown"})`;
}

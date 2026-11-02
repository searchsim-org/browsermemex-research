/**
 * TypeScript declarations for @browser-memex/core/agents.
 * Hand-written; mirrors the JSDoc in the .js files.
 */

export type Platform = "macos" | "linux" | "windows";

export type McpConfigFormat = "json" | "toml";

export interface PlatformPaths {
  macos?: string[];
  linux?: string[];
  windows?: string[];
}

export interface DetectionRules {
  paths?: PlatformPaths;
  binaries?: string[];
}

export interface McpConfigRules {
  paths: PlatformPaths;
  format: McpConfigFormat;
  serversKey?: string;
  tomlTablePrefix?: string;
  helpUrl?: string;
}

export interface AgentCapabilities {
  supportsMcpServers: boolean;
  supportsStdio?: boolean;
  supportsStreamableHttp?: boolean;
  supportsSse?: boolean;
}

export interface AgentDescriptor {
  id: string;
  displayName: string;
  vendor: string;
  website?: string;
  docsUrl?: string;
  detection: DetectionRules;
  mcpConfig?: McpConfigRules;
  capabilities: AgentCapabilities;
}

export interface DetectionResult {
  id: string;
  installed: boolean;
  configured: boolean;
  matchedPath: string | null;
  mcpConfigPath: string | null;
  version: string | null;
}

export interface FsProbe {
  exists(path: string): boolean | Promise<boolean>;
  matches(glob: string): boolean | Promise<boolean>;
  hasBinary(binary: string): boolean | Promise<boolean>;
  readText(path: string): string | null | Promise<string | null>;
}

export interface DetectContext {
  platform: Platform;
  env: Record<string, string | undefined>;
  home: string;
  serverIdentifier: string;
}

export interface ServerEntry {
  command: string;
  args: string[];
  env?: Record<string, string>;
}

export interface BuildServerEntryOptions {
  command: string;
  args: string[];
  env?: Record<string, string>;
}

export const ALL_AGENTS: readonly AgentDescriptor[];
export function getAgent(id: string): AgentDescriptor | undefined;

export function expandPath(
  path: string,
  env: Record<string, string | undefined>,
  home: string
): string;

export function detectOne(
  agent: AgentDescriptor,
  probe: FsProbe,
  ctx: DetectContext
): Promise<DetectionResult>;

export function detectAll(
  probe: FsProbe,
  ctx: DetectContext
): Promise<DetectionResult[]>;

export function buildServerEntry(options: BuildServerEntryOptions): ServerEntry;

export function mergeConfig(
  existingText: string | null,
  descriptor: AgentDescriptor,
  serverName: string,
  serverEntry: ServerEntry
): string;

export function mergeJsonConfig(
  existingText: string | null,
  descriptor: AgentDescriptor,
  serverName: string,
  serverEntry: ServerEntry
): string;

export function mergeTomlConfig(
  existingText: string | null,
  descriptor: AgentDescriptor,
  serverName: string,
  serverEntry: ServerEntry
): string;

export const PLATFORM: {
  readonly MACOS: "macos";
  readonly LINUX: "linux";
  readonly WINDOWS: "windows";
};

export const MCP_CONFIG_FORMAT: {
  readonly JSON: "json";
  readonly TOML: "toml";
};

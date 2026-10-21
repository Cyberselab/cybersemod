export type ConfigErrorCode =
  | "CONFIG_APP_NAME_INVALID"
  | "CONFIG_FILE_NOT_FOUND"
  | "CONFIG_FILE_READ_FAILED"
  | "CONFIG_FILE_FORMAT_UNSUPPORTED"
  | "CONFIG_FILE_PARSE_FAILED"
  | "CONFIG_FILE_ROOT_INVALID"
  | "CONFIG_ENV_PREFIX_INVALID"
  | "CONFIG_ENV_KEY_INVALID"
  | "CONFIG_ENV_KEY_CONFLICT"
  | "CONFIG_ENV_FILE_READ_FAILED"
  | "CONFIG_ENV_MODE_INVALID"
  | "CONFIG_FLAG_KEY_INVALID"
  | "CONFIG_FLAG_KEY_CONFLICT"
  | "CONFIG_VALUE_INVALID";

export class ConfigError extends Error {
  constructor(readonly code: ConfigErrorCode, message: string, cause?: unknown) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = "ConfigError";
  }
}

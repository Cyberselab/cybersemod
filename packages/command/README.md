# @cybersemod/command

对 Payboy 中 Commander 使用范式的封装与约束。项目继续拥有业务命令，包提供 `app → command → action` 的组织方式、延迟加载、配置适配和执行入口。使用原生 Commander，不引入另一套命令树描述语言。

```ts
// cli/commands/serve.command.ts
import { defineCommand } from "@cybersemod/command/command";

export const useServeCommand = defineCommand({
  name: "serve",
  description: "Start server",
  loadAction: async () => (await import("../actions/serve.action.js")).serveAction,
});

// cli/app.ts
import { createCliApp } from "@cybersemod/command/app";
const app = createCliApp({
  name: "example",
  description: "Example CLI",
  buildInfo: { version: "0.1.0", branch: "main", commit: "abc" },
  commands: [useServeCommand],
});

// main.ts
import { runCli } from "@cybersemod/command/app";
process.exitCode = await runCli(app);
```

`defineCommand()` 返回 `useXxxCommand(app)` 注册函数。`configure(command)` 可声明原生 Commander 参数、选项和别名；`loadAction()` 仅在执行该命令时调用，返回 action 函数。action 收到 `{ args, options, command }`，`args` 按 Commander 声明顺序提供，变长参数作为一个数组；`options` 只包含本命令选项。需要祖先选项时使用 `command.optsWithGlobals()`。

也可以直接编写 `useXxxCommand(app: Command)`，通过 `command` 子路径导入原生 `Command` 类型。命令注册模块应保持轻量，业务依赖只能在 action 执行时导入。

## 配置适配

在 action 中调用 `loadCommandConfig(command, options)`，返回类型由 Schema 推导；或者使用 `withConfig(options, action)` 直接适配原生 `.action()`：

```ts
import { withConfig } from "@cybersemod/command/config";

app.command("serve").action(withConfig(
  { appName: "@example/server", schema: serverConfigSchema },
  async ({ config, options, args, command }) => {
    const { start } = await import("./actions/start.js");
    await start(config);
  },
));
```

```sh
example serve --config ./server.toml --set port=4000
example create tenant --name demo --set database.pool-size=10
```

`--config` 与可重复的 `--set path=value` 是保留全局选项，可放在嵌套命令前后；子命令不能重新声明 config / set / help / version 或 `-h` / `-V`。`--set` 保留首个等号之后的完整字符串，支持空值、负数、点号路径和 kebab-case；相同路径最后一次覆盖，标量与对象路径冲突时报错。业务选项不进入配置。`--` 之后保留给 Commander 位置参数。

默认严格拒绝未知选项。`createCliApp({ ..., legacyFlags: true })` 显式启用 Payboy 旧 Flag 兼容模式：已声明选项仍由 Commander 消费，剩余长参数作为配置，例如 `--port=4000`、`--no-cache`。配置覆盖优先级为注入 `options.flags` < 旧 Flag < `--set`。兼容模式不能发现未声明长参数的拼写错误；分离式值沿用旧约定，只消费后续不以 `-` 开头的一个 token，负数请用 `--offset=-1`。配置 Flag 建议放在命令后，避免与子命令位置产生歧义。新项目使用严格模式。

兼容分流针对常规的声明式选项、别名、短选项组合与嵌套命令。不要将其与 `.passThroughOptions()`、外部可执行子命令或自行设置 `.allowUnknownOption()` 混用。需要任意透传时使用严格模式和 `--`，自行在 action 内处理位置参数。

## 执行约定

- 每次运行调用工厂创建新实例。`runCli` 接受的 `argv` 仅包含用户参数，不包含运行时或脚本路径；默认在入口读取 `process.argv.slice(2)`。
- help / version 不加载配置，也不导入业务 action。构建信息由调用方注入，不读取 git、项目 package.json 或固定前缀环境变量。
- `runCli` 返回退出码：成功、帮助或版本为 0，输入或配置错误为 2，业务执行失败为 1。库不调用 `process.exit()`，也不修改 `process.exitCode`。
- stderr 输出经过收敛的错误消息，不整体序列化异常及 cause。可直接调用 action 排查业务异常，或在应用层主动记录经脱敏的诊断。资源清理由应用 action 负责。
- `stdout` / `stderr` 回调可注入，用于捕获框架输出；业务 action 的输出由项目自身管理。

子路径：`app`、`command`、`config`、`build-info`、`errors`。Bun >= 1.3.14，ESM，暂无 Node.js 支持承诺。

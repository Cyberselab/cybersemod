# 配置与 CLI 公共包设计

状态：首期实现已落地，尚未发布。本文保留设计依据与迁移计划，实际接口和用法以两个包的 README 为准。

## 目标与依据

新项目只声明应用身份、配置 Schema 和业务命令，即可获得一致的配置加载与 CLI 行为。已有项目通过渐进迁移移除重复实现。

本次查看了本机 Payboy 的 `packages/config`、Server / Cashier / Observer 的 CLI，以及 Draupnir API 的配置实现。Payboy 已有相对完整的配置包；CLI 仍在各应用中分别组装。Draupnir 使用另一套前缀、配置发现方式和 CLI 库，说明现有项目不能直接统一替换而不处理兼容性。其他项目的采用情况尚未逐一核实。

Payboy 中值得保留的约定：

- Scoped Package Name 派生配置路径与应用环境变量前缀。
- 文件、dotenv、进程环境变量、命令行覆盖依次提高优先级；最终由应用 Schema 校验和转换。
- 配置文件只选一个，不逐文件叠加。
- CLI 采用 `createCliApp → useXxxCommand → xxxAction` 分层。
- 版本输出可以附带 branch / commit；需要资源的 action 延迟加载。

需要调整的耦合：配置包默认读取 `Bun.argv`；CLI 使用 `allowUnknownOption()` 放行参数；应用重复实现构建信息；部分命令模块静态导入 action，可能导致帮助命令提前加载业务依赖。

## 用户故事与验收目标

1. 作为新项目开发者，我只提供应用名、Schema 和命令注册函数，就能接入配置与 CLI。验收：一个独立示例应用可以启动并读取文件、环境变量与 Flag，无需复制解析代码。
2. 作为运维人员，我可以沿用 Payboy 的文件与环境变量约定。验收：兼容模式下相同输入获得相同配置，错误码和文件选择行为有回归覆盖。
3. 作为命令开发者，我可以添加业务选项而不污染应用配置。验收：`--config`、`--help`、业务选项与配置覆盖各有归属，拼错的参数得到错误提示。
4. 作为使用者，我可以在没有数据库、配置文件和网络连接时查看帮助与版本。验收：上述入口不加载配置、不导入业务 action、不创建资源。
5. 作为测试编写者，我可以显式注入环境变量、参数与目录。验收：无需修改全局 argv / env，也不依赖 `NODE_ENV=test` 隐式改变解析行为。

## 包边界

第一阶段只发布两个包，使用一个 Bun workspace 管理。先以 Bun 应用为支持对象；Node.js 支持需单独验证后再承诺。

公共包采用 `config` 与 `command` 命名。`command` 是对 Payboy 中 Commander 使用范式的封装与约束，业务命令由各项目实现。`cli` 保留为消费方应用内部目录与入口概念，现有 `cli/app.ts`、`createCliApp` 和 `runCli` 命名继续使用。

| 包 | 应负责 | 应用继续负责 |
| --- | --- | --- |
| `@cyberselab/config` | 身份与前缀、路径策略、文件读取、dotenv、环境映射、深合并、调用校验器、结构化加载错误 | Schema、业务默认值、业务配置约束、应用级缓存 |
| `@cyberselab/command` | Commander 工厂、注册约定、参数归属、action 的配置上下文、统一错误出口、帮助与版本 | 命令树、交互问题、具体 action、数据库与服务启动 |

依赖方向：CLI 的配置适配模块依赖 config；config 不依赖 CLI。CLI 直接暴露 Commander 的 Command 类型，保留原生扩展能力，不另造一套命令描述语言。

构建信息先放在 `@cyberselab/command/build-info` 子路径。只有非 CLI 消费方确实需要时再拆包。日志、进程生命周期、数据库迁移和交互表单暂不独立成包，避免把 Payboy 的业务资源模型带入基础库。

按模块提供显式导出，如 `config/load`、`config/app-name`、`command/app`、`command/config`、`command/build-info`，避免集中 barrel export。根路径导出策略在实现时统一确定。

## 配置契约

建议由位置参数改为 options 对象，以便增加可注入能力：

```ts
import { loadConfig } from "@cyberselab/config/load";

const config = await loadConfig({
  appName: "@example/server",
  schema: serverConfigSchema,
  file: { path: configFilePath, required: true },
  environment: process.env,
  flags: configOverrides,
  directories: { current: process.cwd() },
});
```

- `schema` 接受最小的同步 `parse(unknown): T` 契约，保留 Zod 的输出类型推导与原始校验错误，首期不支持异步校验。这样配置包无需绑定某个 Zod 实例或复制 Schema 定义。
- `environment` 是进程环境快照；未传时才读取当前进程环境。显式传 `{}` 表示空环境。dotenv 仍按下面的目录规则读取，可以通过独立选项关闭。
- `flags` 是已经分流的配置对象；未传时为 `{}`。配置包不自行读取 argv，也不因测试环境跳过显式输入。
- `directories` 可覆盖 current / home / system。dotenv 跟随 current，避免配置搜索目录与 dotenv 工作目录不一致。
- `file.path` 指定时只读该文件；不存在、格式错误或无权限均报错，不回退搜索。`required: false` 只允许自动搜索无结果时继续使用其他来源，默认仍要求文件存在。
- 不在模块 import 时读取配置，不设置进程级缓存，不修改全局环境。调用方可以在一次 action 内复用同一个加载 Promise。

默认保留以下优先级（由低到高）：

```text
一个配置文件
→ .env → .env.local → .env.<NODE_ENV> → .env.<NODE_ENV>.local
→ 进程环境变量
→ 命令行配置覆盖
→ Schema 校验与默认值
```

`NODE_ENV` 从进程环境快照获取，缺省时不加载模式文件；模式名称限制沿用 Payboy。Schema 默认值只在合并后字段缺失时生效，不是额外的高优先级配置来源。

默认文件搜索沿用 Payboy：system 下 `<scope>/<name>`、home 下 `.<scope>/<name>`、current 下 `<name>`，从后向前选第一个存在文件；每个目录 JSON < YAML < TOML。显式路径支持 `.yml`，自动搜索首期保持现有行为，不悄悄扩大候选集。系统目录允许注入，Windows 默认目录策略在发布前必须单独验证和记录。

环境变量继续采用 `EXAMPLE__SERVER__DATABASE__POOL_SIZE → database.poolSize`。单下划线转换 camelCase，双下划线分层。身份标准化可能使不同应用名得到相同前缀，需在文档中说明；允许项目显式覆盖前缀以处理已有名称和迁移，但不自动同时接收多个前缀。

合并规则固定为：普通对象递归合并；数组、null 和标量整体替换；不修改输入。不允许 `__proto__`、`constructor`、`prototype` 路径，文件、环境变量和 Flag 都需要覆盖。环境变量和 Flag 的原始值保持字符串，布尔值也交给 Schema 明确转换，不能把字符串 `"false"` 直接按 truthiness 转为 true。

文件/映射失败使用稳定的 `ConfigError.code`；Schema 校验错误保持原样。默认诊断不包含原始配置值。配置值来源追踪与 `config show` 留待后续设计，避免首期引入额外的敏感字段声明机制。

## CLI 参数归属

新项目默认使用明确的配置覆盖入口：

```sh
example serve --config ./server.toml --set port=4000 --set database.pool-size=10
example create tenant --name demo --set log-level=debug
```

| 输入 | 所有者 |
| --- | --- |
| `--help`、`--version` | CLI 框架，提前完成 |
| `--config <path>`、重复 `--set <path=value>` | CLI 配置适配模块 |
| `--name` 等显式声明选项、位置参数 | 业务命令 |
| `--` 之后的参数 | 保留给命令，不解析为配置 |
| 其他未声明选项 | 报错 |

`--set` 只接受 `path=value`；在第一个等号处分隔，保留后续等号和空字符串。负数可写成 `--set offset=-1`。字段路径沿用点号与 kebab-case，重复相同路径后值覆盖前值；同一次输入中对象路径与标量冲突时报错。业务命令不得重新声明保留选项。

Payboy 现有的 `--port=4000`、`--database.url ...`、`--no-feature-enabled` 作为显式启用的兼容模式保留。兼容模式先将已声明的 Commander 选项分离，再解析剩余长参数，并沿用原有负数及 `--` 规则。未知长参数在该模式下仍有误拼风险，迁移文档必须说明。禁止让两个解析器独立消费完整 argv。

CLI 对原始 argv 的读取只发生在运行入口；参数分流模块可单独测试。具体分流实现需验证嵌套命令、全局选项位置、重复参数与 help/version 短路，不依赖 Commander 未公开的内部方法。

## 调用方形态

以下示例表示预期使用体验，接口名仍可在实现阶段调整：

```ts
// cli/app.ts
import { createCliApp } from "@cyberselab/command/app";
import { withConfig } from "@cyberselab/command/config";
import { serverConfigSchema } from "../config-schema";

export function createApp() {
  const app = createCliApp({
    name: "example",
    description: "Example Server CLI",
    buildInfo: { version: "0.1.0", branch: "unknown", commit: "unknown" },
  });

  app.command("serve").action(
    withConfig({ appName: "@example/server", schema: serverConfigSchema },
      async ({ config }) => {
        const { serveAction } = await import("./actions/serve.action");
        await serveAction(config);
      }),
  );
  return app;
}
```

`createCliApp` 注册保留的全局选项；`withConfig` 适配 Commander action 参数，在实际执行时取得分流后的输入并加载配置。需要业务参数的 action 同时收到原始位置参数、业务选项与类型化配置。业务模块只接受依赖，不重新读取 argv。命令较多时仍以 `useXxxCommand(app)` 拆文件。

`--help` / `--version` 在 action 之前结束。构建信息由应用构建脚本注入，公共库不读取消费方 package.json，不执行 git，不硬编码 `PAYBOY_BUILD_*`。格式沿用 `version (branch@commit)`。

运行入口使用独立的 `runCli(app, { argv })` 统一处理错误；普通 action 抛错即可。帮助和版本成功退出，输入/配置校验错误使用退出码 2，业务执行失败使用 1。库不调用 `process.exit()`，由入口设置 `process.exitCode`；Commander 的退出行为也需接管。错误写 stderr，不把配置值或异常对象整体序列化输出。

## 渐进迁移与验证

1. 先提取 config，将 Payboy 现有测试和行为作为兼容基线。保留旧包为薄适配层，通过显式传入 environment / flags 维持旧调用方式；业务 Schema 不移动。
2. 实现 CLI 工厂、构建信息和严格模式参数契约，以一个独立示例验证接入；随后让 Payboy Cashier 作为首个真实消费者，显式启用旧 Flag 兼容模式。
3. 迁移 Server / Observer，验证帮助与版本不触发配置、数据库和业务模块加载；替换重复 app 初始化代码，保留现有命令树。
4. 再选择另一个真实项目验证边界。Draupnir 若迁移，需要显式映射旧前缀与大写字段，并处理 cosmiconfig 的旧文件约定；不能把历史兼容逻辑全部加入默认策略。
5. 第二个项目验证通过后稳定公开接口和发布流程。现有项目逐步切换到严格参数模式，新项目默认启用严格模式。

必要验证覆盖：配置来源优先级、单文件选择、dotenv 模式与环境隔离、数组替换与空值、字符串布尔转换、危险键和路径冲突、结构化错误、CLI 参数归属、嵌套命令、`--`、负数、帮助与版本无副作用、注入输入的测试隔离。发布前还需验证打包安装后的类型、子路径导出、Bun 运行和单文件编译，不以 workspace 直接引用源码代替包消费验证。

两个包使用独立版本；若 CLI 适配契约依赖 config 的变化，明确声明兼容范围并联动发布。输出 ESM 与类型声明，明确支持的 Bun 版本；第三方依赖版本在实现时核实。第一阶段不发布命令行可执行文件，使用者项目继续拥有自己的入口和二进制名称。

## 实现前待确定

- 正式 npm scope / 包名与发布权限。
- 首期是否存在必须支持 Node.js 的消费者；当前提案按 Bun 优先。
- 从 Cashier 开始接入是否符合项目优先级；当前尚未改动任何消费方。

这些事项不影响上述职责划分，但会影响包清单、运行时适配和迁移次序。

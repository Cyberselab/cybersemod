# cybersemod

供多个项目复用的配置加载与命令行基础包，设计起点是 Payboy 已有的配置机制与 CLI 组织方式。

使用 Bun workspace 管理两个基础包。已实现首期接口，尚未发布到 npm。

| 包名 | 职责 |
| --- | --- |
| [`@cybersemod/config`](packages/config/README.md) | 应用身份、配置发现、文件解析、dotenv、环境变量映射、合并与校验 |
| [`@cybersemod/command`](packages/command/README.md) | 封装和约束 Payboy 的 Commander 使用范式：应用创建、命令注册、action 分层与执行入口 |

`command` 不提供项目的业务命令。消费方保留 `cli/app.ts → cli/commands/*.command.ts → cli/actions/*.action.ts` 分层，通过注册函数组织命令，在执行 action 时才加载业务依赖。

## 开发

需要 Bun >= 1.3.14。

```sh
bun install
bun run typecheck
bun test ./packages
bun run build
bun run verify:packages
```

`build` 按 config → command 顺序生成 ESM 和类型声明。包按子路径导出，无根路径 barrel；Bun 条件引用源码，其他解析器使用构建产物。`verify:packages` 将两个包打成 tarball，在临时目录实际安装，检查类型声明、Bun 源码入口、构建 ESM 入口以及 Bun 单文件编译。该验证另需本机 Node.js，只用于检查 ESM 默认入口，不代表完整 Node.js 支持承诺。

## 示例

```sh
bun run example --help
bun run example show demo --set port=4000 --uppercase
bun run example show demo --config ./server.toml
```

示例 Schema 与业务 action 位于 [`examples/basic`](examples/basic)。也可设置 `EXAMPLE__SERVER__PORT=4000`；示例允许无配置文件，以 Schema 默认值启动。

设计依据与迁移计划见 [配置与 CLI 公共包设计](docs/config-cli-design.md)。尚未修改 Payboy 或其他消费方，也未检查 npm 包名可用性。

实现参考：[Bun workspace 文档](https://bun.com/docs/pm/workspaces)、[Commander 官方文档](https://github.com/tj/commander.js/tree/v13.1.0)。

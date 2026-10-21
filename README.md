# cybersemod

供多个项目复用的配置加载与命令行基础包，设计起点是 Payboy 已有的配置机制与 CLI 组织方式。

使用 Bun workspace 管理两个基础包，通过 GitHub Actions 同时发布到 npmjs 和 GitHub Packages。

| 包名 | 职责 |
| --- | --- |
| [`@cyberselab/config`](packages/config/README.md) | 应用身份、配置发现、文件解析、dotenv、环境变量映射、合并与校验 |
| [`@cyberselab/command`](packages/command/README.md) | 封装和约束 Payboy 的 Commander 使用范式：应用创建、命令注册、action 分层与执行入口 |

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

## CI 与发布

推送到 `main` 或创建、更新 PR 时，CI 在 Linux 和 Windows 上执行冻结锁文件安装、类型检查、测试、构建和 tarball 消费验证。Bun 版本取自根目录 `packageManager`，Node.js 24 用于验证 ESM 默认入口和运行 npm 发布命令。

两个包统一版本发布：

1. 更新 `packages/config/package.json` 和 `packages/command/package.json` 的 `version`，执行 `bun install` 同步 `bun.lock`。
2. 提交并推送，等待 CI 通过。
3. 在 GitHub 创建并发布 Release，标签必须为 `v<version>`，例如当前版本的 `v0.1.0`；标签应指向包含版本更新及工作流的提交。仅推送标签或保存 Release 草稿不会发布包。

发布工作流会重新运行完整 CI，校验两个包版本与标签一致，再分别向 npmjs 和 GitHub Packages 发布；每个注册表内按 config → command 顺序打包发布。`bun pm pack` 会将 `workspace:^` 转为实际版本范围。两个发布任务独立运行，一个失败不会取消另一个。打包前为包设置所选注册表，包括兼容仍固定 GitHub Packages 的旧标签；发布前检查文件并执行 npm 发布预演。

手动发布：在 Actions → Publish Packages → Run workflow 中选择 `main`，填写原版本标签（如 `v0.1.0`）、预发布选项和 `target`（`both`、`github` 或 `npmjs`）。已有 `v0.1.0` 在 GitHub Packages 发布成功时，选择 `npmjs` 即可补发同版本，无需移动标签。手动流程使用所选分支的工作流，CI 与发布均检出指定标签的代码。直接重跑旧任务仍会使用旧工作流。

预发布版本例如 `v0.2.0-rc.1` 必须勾选 GitHub Release 的预发布选项，发布到 `next`；正式版本使用 `latest`。版本不允许带 `+build` 元数据。已发布版本不可覆盖；两个包发布并非原子操作，若第二个包失败，应修复权限或网络问题后，仅补发失败包，或为两个包提升版本并创建新 Release。

发布前配置：

- GitHub Packages 使用内置 `GITHUB_TOKEN`，工作流已声明 `packages: write`；组织需允许该仓库使用 Actions 和创建包。首次发布的 GitHub 包默认私有，如需公开可在包设置中调整可见性。
- npmjs 使用 Trusted Publishing（OIDC），不需要配置 `NPM_TOKEN` 或 Bypass 2FA 令牌。工作流已授予 `id-token: write`，并使用 Node.js 24 和固定版本 npm 11.21.0；发布运行在 GitHub 托管的 Ubuntu runner 上。包以 `--access public` 直接发布，普通消费方安装无需令牌。

npm 端需要一次性配置两个包的 Trusted Publisher。在 `@cyberselab/config` 和 `@cyberselab/command` 各自的 Settings → Trusted publishing 中添加 GitHub Actions，并分别填写：

| 字段 | 值 |
| --- | --- |
| Organization or user | `Cyberselab`（GitHub 组织） |
| Repository | `cybersemod` |
| Workflow filename | `publish.yml`（不填目录） |
| Environment name | 留空 |
| Allowed actions | 允许直接发布：`npm publish` |

只允许 `npm stage publish` 会让版本停留在待审批状态；要实现 Release 后自动上线，必须允许 `npm publish`。两个包都要配置，且首次成功发布需在可信发布者配置创建后的两天内完成。若已过期，删除该可信发布者配置并重新创建。

Trusted Publisher 需要 npm 上已有对应包；若仅看到 `0.0.0-stage`，这是首次暂存发布创建的占位版本，实际版本需在 Staged Packages 中批准后才会上线。本地登录、Passkey 和审批只用于首次引导及账号管理，后续 Actions 发布使用 OIDC，不会要求人在电脑或手机上确认。首次联调可使用尚未发布的新版本，避免覆盖已经发布的版本。

配置完成并将本工作流推送后，发布新版本的 GitHub Release 即会自动检查、构建和发布到两个注册表；也可以用 Run workflow 选择 `npmjs` 单独验证 npm 发布。两个包的 `repository` 均关联本仓库，注册表由发布工作流明确选择。认证配置参考 [npm Trusted Publishing 文档](https://docs.npmjs.com/trusted-publishers/)。

## 安装已发布的包

从 npmjs 安装无需额外配置（首次 npmjs 发布成功后）：

```sh
bun add @cyberselab/config @cyberselab/command
```

如果之前将 `@cyberselab` 映射到 GitHub Packages，先移除 `.npmrc` 或 `bunfig.toml` 中对应的作用域映射。

如需从 GitHub Packages 安装，在消费项目的 `.npmrc` 中配置作用域注册表（不影响其他 npm 依赖）：

```ini
@cyberselab:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${NODE_AUTH_TOKEN}
```

将 `NODE_AUTH_TOKEN` 设置为具有 `read:packages` 权限的 GitHub personal access token (classic)，不要将实际令牌写入仓库。GitHub Packages 的公开 npm 包也需要身份认证。消费项目的 Actions 可以在获得包读取权限后使用自己的 `GITHUB_TOKEN`。

```sh
bun add @cyberselab/config @cyberselab/command
```

详见 [GitHub Packages npm 注册表文档](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-npm-registry)。设计依据与迁移计划见 [配置与 CLI 公共包设计](docs/config-cli-design.md)。尚未修改 Payboy 或其他消费方。

实现参考：[Bun workspace 文档](https://bun.com/docs/pm/workspaces)、[Commander 官方文档](https://github.com/tj/commander.js/tree/v13.1.0)。

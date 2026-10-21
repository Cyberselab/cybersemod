# @cyberselab/config

Payboy 配置约定的独立实现。Bun >= 1.3.14，ESM，无导入时副作用，不读取 argv、不修改全局环境、不缓存结果。

```ts
import { loadConfig } from "@cyberselab/config/load";
import { z } from "zod";

const config = await loadConfig({
  appName: "@example/server",
  schema: z.object({ port: z.coerce.number().int().positive().default(3000) }),
  file: { required: false },
});
```

优先级由低到高：一个配置文件 → `.env` → `.env.local` → `.env.<NODE_ENV>` → `.env.<NODE_ENV>.local` → 进程环境 → 显式 `flags`。合并后调用 Schema，默认值由 Schema 提供。Schema 仅需同步 `parse(unknown): T`，Zod 由调用方安装；返回值推导为 Schema 的输出类型，校验错误原样抛出。

`@example/server` 默认读取 `EXAMPLE__SERVER__PORT`；`EXAMPLE__SERVER__DATABASE__POOL_SIZE` 映射为 `database.poolSize`。环境变量和 Flag 保持字符串，类型转换由 Schema 负责。布尔字符串应显式转换，例如 Zod 的 `z.stringbool()`，不要用 truthiness 转换 `"false"`。

文件支持 JSON、YAML / YML 和 TOML。自动搜索候选由低到高排列：

```text
/etc/example/server.{json,yaml,toml}
$HOME/.example/server.{json,yaml,toml}
./server.{json,yaml,toml}
```

只选择优先级最高的一个文件，不合并多个文件。YML 仅通过显式路径读取。选中文件损坏或无法读取时直接报错，不继续回退。Windows 上 `/etc` 按当前驱动器根目录解析；可以用 `directories.system` 覆盖，不自动切换为 ProgramData。跨平台应用应显式约定部署目录。

| 选项 | 行为 |
| --- | --- |
| `file.path` | 指定文件；相对路径相对于 `directories.current`，缺失始终报错 |
| `file.required` | 默认 true；false 允许自动搜索无结果，继续读取其他来源 |
| `directories` | 注入 `current` / `home` / `system`，默认 cwd / homedir / `/etc` |
| `environment` | 注入进程环境快照；`{}` 表示无进程变量，dotenv 仍可加载 |
| `environmentPrefix` | 替换应用派生前缀；仅允许大写字母、数字和下划线 |
| `dotenv` | false 关闭 dotenv；默认从 current 加载 |
| `flags` | 注入已分流的配置对象；默认 `{}`，从不自行读取 argv |

dotenv 模式仅由进程环境快照的 `NODE_ENV` 决定，不从 dotenv 文件推导模式；未定义时跳过模式文件。相对 Payboy 原实现，这是为消除隐式环境依赖而作的明确调整。未定义的进程变量不覆盖 dotenv 值。

普通对象递归合并，数组、null 和标量整体替换。输出不共享输入对象或数组。配置限定为无环普通数据；Date、类实例和危险路径键会被拒绝。应用名派生前缀会将标点归一化为 `_`，不同应用名可能得到相同前缀，需由应用命名或 `environmentPrefix` 规避。

按模块导入，不提供统一根导出：`load`、`app-name`、`search`、`file`、`dotenv`、`environment`、`flags`、`record`、`errors`。`flags` 提供显式 `readSetConfig(["port=4000"])` 与兼容旧范式的 `readFlagConfig(argv)`；库本身从不读取命令行。

加载与映射失败抛出带稳定 `code` 的 `ConfigError`，诊断消息不包含原始值。解析器原始错误保留在 `cause` 中供主动排查，不应整体输出到日志。

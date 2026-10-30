# Run 接口、产物与版本

## 适用范围与事实来源

本记录编于 2026-10-31，参考 Run SDK 0.1.0 的源码/类型及 Req 插件 0.2.3。SDK、Runtime、DSH 是三个独立交付物；同版本标识的源码、TGZ 和已安装目录也可能不一致。目标环境的实际包、导出、Config 和运行行为优先于本记录。

本机可参考的源码位置如下。它们是项目内路径，不是要求其他电脑存在的绝对路径：

| 查什么 | 在对应项目中定位 |
|---|---|
| SDK 真正导出 | runtime-sdk 的 `src/index.ts`、`lib/index.d.ts` 和随包 contracts |
| Run 创建目录、终态处理 | Runtime 的 `src/backend.ts`、`src/files.ts` |
| 模型上下文及用量 | Runtime 的 `src/models.ts`，图片支持另查 `src/images.ts` |
| 注册、守卫和真实调用身份 | DSH tools、sandbox-policy 相关源码 |
| 安装 profile 和包解析 | DSH Plugin Manager / profile resolution 的实际实现 |
| 迁移样本 | Req 的 `src/index.ts`、`runtime.ts`、`protocol.ts`、`tests/run-entry.test.ts` |

SDK README 的占位业务函数、调试上下文创建器、调用 DSH Tool 的中文伪函数都不是 SDK API。查不到真实导出时标明需自行实现适配，不为补齐例子捏造 `tasks.create()` 等接口。

## 已核对的 SDK 形状

以下是接口摘要，使用前仍需与目标 SDK 类型核对：

```ts
registerRunTool(ctx, {
  toolId, description, inputSchema,
  execute: async (input, execution) => ({text, files}),
});
```

`toolId`、`description`、`inputSchema`、`text`、`files` 在此代表插件自己的值，并非 SDK 导出变量。业务返回 `files` 为当前任务已登记的 final artifactId 数组。

| 现有能力 | 含义/注意事项 |
|---|---|
| `execution.runId` | 宿主生成的任务标识，不自行另建并替代 |
| `execution.outputDirectory` | 宿主固定的本次任务文件根目录，不由业务输入指定 |
| `execution.signal` | 停止信号，传给模型、I/O 和子进程并主动检查 |
| `reportProgress({stage,stageName,progress?,message?})` | progress 为 0–100；不知道则不填；调用需 await |
| `log(message, stage?)` | 写入任务记录；不等于终端 console，也不等于 Python 本地日志 |
| `reportIssue({level,message,code?,stage?,fatal?})` | error 级别不必然停止；简单失败直接抛出，Run 负责失败流程 |
| `reportStatus(status,message?)` | 不应以手动 completed 取代返回结果和 Run 的最终校验 |
| `addArtifact({kind,name,relativePath,mime})` | 登记已存在的文件，不负责生成/复制，返回 Artifact |
| `registerCleanup(callback)` | 仅登记自有资源清理；停止并等待，不只发送一个信号 |
| `execution.model.selection` | 任务固定的模型引用，可能为空；不从业务输入接受凭据 |
| `execution.model.call({messages})` | 返回 `{text,usage?}`，具体请求与错误以实际类型为准 |

插件启用时登记、停用时撤销，由 SDK/Cordis 的生命周期托管。依赖至少包含实际需要的 tools 和 sfRuntime；Python 适配按实现增加 subprocess、sandboxPolicy 等，不为不存在的能力写 inject。

## 正常调用路径

本次核对的上层 Tool 如下，它们不是从 SDK 导入的 JS 函数：

| 操作 | Tool | 请求 |
|---|---|---|
| 核对真实入口 | `sf_runtime_get_tool_contract` | `{toolId}` |
| 启动任务 | `sf_runtime_run_tool` | `{toolId,input,model?,timeoutMs?}` |
| 查询/等待 | `sf_runtime_get_run` / `sf_runtime_wait_run` | `{runId}` / `{runId,afterSeq?,waitMs?}` |
| 取消 | `sf_runtime_cancel_run` | `{runId}` |
| 获取交付引用 | `sf_runtime_get_artifact` | `{runId,artifactId}` |

启动返回受理与 runId，不是同步的完整结果。服务响应还可能包在 `{ok,data}` 或 `{ok:false,error}` 中；区分外层 Tool 调用成功与内部任务受理/完成。等待超时不等于任务取消，后续等待使用实际 lastSeq。

若用户只要求网页版调用，优先复用现有 Run 网页/聊天能力，不额外做前端页面、HTTP 下载服务或自建任务中心。已有 Remote 路由应沿用实际认证上下文，不猜公共 URL。

## 目录与文件引用

此次 Runtime 创建的结构：

```text
execution.outputDirectory/          # 此次实现落在 workspace/outputs/runs/runId
  input/request.json               # Run 预先创建，业务不能覆盖
  run.json                         # Run 的权威状态/事件，业务不能自行覆盖
  manifest.json                    # 可选：业务自己的版本/索引/方法状态
  input/                           # 业务输入另取名，如 algorithm-request.json
  intermediate/                    # 初始实体、用例、E-R、模型可见往返等
  snapshots/                       # 每轮 before、after、缺口、矩阵等
  final/                           # 用户主要文档、结构化结果、检查材料归档
  logs/                            # 业务日志、错误；不记录密钥和认证头
```

以 `outputDirectory` 为根操作，不在业务插件里重拼宿主数据区。目录名、保留/清理规则仍须核对目标 Runtime；原有任务不自动搬迁。方法结果需要额外清晰区分“程序执行”“文档生成”“方法收敛/达到上限”。文件存在不等于结果正确。

- 原算法逻辑目录可通过存储适配映射：例如 `initial/` → `intermediate/initial/`，`iterations/` → `snapshots/iterations/`。不要为目录迁移重写算法。
- DataFrame 明确保存行索引、列名、二维数据及可选 CSV；三元组、集合、Path 等显式转 JSON 值，不能仅 `str(object)` 冒充结构化快照。
- 成功、失败、取消都保留已有输入和检查材料，清理进程不等于删任务目录。长期清理由用户/宿主政策决定。
- 写文件成功并校验后登记；原子临时文件、部分文件不登记为最终产物。完成打包后再登记归档，不把归档自身或正在变化的状态文件反复打入归档。
- 返回 artifactId，通过宿主接口取得认证下载引用；服务器磁盘绝对路径不是浏览器下载链接。中间材料无需自动登记为多个数据库业务输出类型。

## 模型引用与历史

启动 `model` 是顶层参数，不放进业务 `input`。省略时继承来源会话模型，指定时使用 DSH 目录给出的真实 provider/model ID，推理强度等字段以实际类型为准。不能把模型 A 的专属参数或主聊天完整历史复制给模型 B；不可用时明确失败，不静默回退。

本次查到的 Runtime 为每次 model.call 创建隔离、无工具的模型 Session，固定路由来自任务记录；没有为每次调用创建 Agent。其他版本必须重新查证。多轮历史由 messages 显式传递，日志和用量由宿主链路记录。

如项目需要图片，核对目标 ModelRequest：此版 user.content 可含 text/image_url 块，system/assistant 为文本。本地文件路径不是 image_url，应在已授权范围读入并使用支持的 Data URL 或可访问 URL。检查模型声明的图片能力及附件服务；不假设所有模型支持图片，不把文档/PDF或厂商 file_id 直接当成图片参数。日志保存附件引用，避免重复存 Base64。

## 版本与数据库边界

一个包可以保留多个业务 Tool 入口；新增 v2.1 时新增独立入口，不覆盖仍被调用的 v2.0。修接入代码通常升插件包补丁版本，算法版本保持原值。

如果涉及 HugeGraph 的 `invoke_kind=dsh_tool`、`dsh_ref=实际 Tool 名称`，它们仍只是数据库定位字段；必须检查调用端是否实现解析与正常派发。登记、迁移和审核只有用户授权后才执行，不能在插件启用时顺便写库，也不为每次任务或迭代增节点。

**允许名单发生过版本变化。** 此次最新 SDK README 和 Runtime 源码 Config 表示登记后自动可用，不需要额外 allowedToolIds；历史 Req 文档/旧 Runtime 曾使用该字段。不要照抄任何一方：核对实际安装包的 schema 和实现，必要时比较 TGZ 散列及源码/构建时间。

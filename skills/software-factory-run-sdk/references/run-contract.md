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

新开发优先使用execution.model.getConnection取得任务网关连接，沿用OpenAI／Anthropic客户端。旧model.call及Python桥接保留兼容，账号登录等网关不支持的连接按宿主适配能力使用旧接口。SDK 0.4.1只修订文档，未改变0.4.0接口。

0.4.0追加execution.interaction.ask，三种请求及返回按SDK README 4.11。依次await问题，等待不消耗任务执行预算，取消／超时抛错；不要把回答实现成模型Tool、自动默认答案或Python自行调用网页接口。主聊天来源由Host绑定，用户操作使用网页授权，任务模型凭证无回答权限。run.json保存问题和答案，重启不恢复调用栈。

0.3.0追加能力：`registerRunTool`可声明`modelProtocols`数组；`execution.model.getConnection({protocol})`返回`{baseUrl,apiKey,model,protocol}`。仅接收openai-completions、openai-responses、anthropic-messages。Runtime>=0.3.1由工具协议选择厂商已确认入口，不要求与DSH默认调用协议相同，不让AI选择协议：DeepSeek官方连接支持工具选三种入口，OpenAI官方支持Chat／Responses；自定义代理保留原地址，未登记其他入口时明确报错，不猜URL或转换正文。模型和思考强度由上层指定，apiKey为临时令牌，真实Key仅由Runtime读取。旧model.call、进度、产物和取消接口保持。完整例子见SDK README 4.10。

新请求记录在任务logs/model-calls/<requestId>.json，详情经认证getModelCall读取，不能猜公开文件URL。网关支持三种POST和SSE，不含上传、模型列表、Responses查询／删除或后台任务轮询；扩展字段按协议转发，能力由模型决定。Python可保留客户端但只能持有任务临时连接，详见[Python适配](python-adapter.md)。

## 用户配置接入

以下为当前DSH 0.2.1-alpha.2的原生机制，其他宿主版本先核对实际接口；这是插件配置能力，不是Run SDK导出的方法。

- Host通过插件`Config`声明字段、默认值和后端校验。提供自定义配置表单时，通过`ctx.settings.configure({auto:false}, ownerFiber)`登记展示策略，并随插件生命周期清理，避免重复生成通用配置页。
- Client声明原生`dsh-client-ui-settings`、`dsh-client-ui-plugin-manager`及locale依赖，用`ctx.configForms.get(实际插件条目ID)`取得读取、订阅与保存控制器。条目ID来自实际patch，不能照抄Runtime的`sf-runtime`作为其他插件ID。
- 自定义表单统一挂到组件内部的`plugins.row.config`，key严格使用`<实际Bundle包名>#<patch中的组件rowId>`，例如`@example/my-bundle#my-worker`。这样在“包含的组件”中点击对应条目进入配置页，各条目独立管理；不将用户配置仅挂到原包外层的`plugins.bundle.config`。合入新Bundle时用新包名和实际rowId登记该入口，复用同一表单，不能假设旧key会自动匹配新Bundle。
- 处理宿主传入的`view:'page'`／`view:'summary'`，在页面视图显示表单。保存调用对应条目控制器的`mutate(ops, expectedRevision)`，提供字段说明、默认值、保存／放弃修改及明确错误；沿用宿主认证、写入权限和版本冲突检查。包名、rowId和配置控制器必须指向同一个实际条目，不绑定开发者本机profile或其他组件。
- 需要保存后无需重启时，Config使用`volatile()`，业务每次启动通过`.get()`固定本任务快照；不能让编辑影响正在运行的算法。界面可显示秒／分钟，保存前换算成后端单位并校验。
- DSH负责将普通配置持久化到当前profile；插件不另写一个绕过宿主的配置文件接口。真实模型Key仍使用DSH原生凭据服务，不放普通表单状态或日志中。

Runtime 0.4.1的`src/config.ts`、`src/index.ts`及`client.js`可参考字段、保存、任务快照与组件内挂载机制；实际Bundle包名和rowId必须按目标项目填写。交付前简单检查组件配置页能打开、读取、保存及生效，兄弟组件配置不受影响；组合Bundle时核对实际挂载key。用户无需手改`.env`或配置文件，原生能力缺失时报告限制，不静默改用文件配置。开发与启动脚本尽量兼容Linux，不以文档规则宣称已通过Linux验证。

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
| `execution.model.getConnection({protocol})` | 新开发首选；返回任务的 `{baseUrl,apiKey,model,protocol}`，apiKey 为临时令牌 |
| `execution.model.call({messages})` | 兼容接口，返回 `{text,usage?}`，具体请求与错误以实际类型为准 |

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

2026-11-02补充：SDK／Runtime 0.2.0支持model.call({messages,temperature?,maxTokens?,stop?})。三个字段由算法逐次提供，不改ModelRef或前端；省略保持0.1.0行为，旧SDK插件可用新版Runtime。temperature为0～2有限数且0不能被真假判断丢弃，maxTokens为正整数，stop为至少一项的非空字符串数组。新增参数需要新Runtime；不要在旧Runtime失败后静默删参数重试。具体提供方可能忽略／不转发某项：本地DeepSeek thinking忽略温度，llm-pi-ai当前未转发stop。保留分阶段调用语义，不自动切换模型或推理模式。

如项目需要图片，核对目标 ModelRequest：此版 user.content 可含 text/image_url 块，system/assistant 为文本。本地文件路径不是 image_url，应在已授权范围读入并使用支持的 Data URL 或可访问 URL。检查模型声明的图片能力及附件服务；不假设所有模型支持图片，不把文档/PDF或厂商 file_id 直接当成图片参数。日志保存附件引用，避免重复存 Base64。

## 版本与数据库边界

一个包可以保留多个业务 Tool 入口；新增 v2.1 时新增独立入口，不覆盖仍被调用的 v2.0。修接入代码通常升插件包补丁版本，算法版本保持原值。

如果涉及 HugeGraph 的 `invoke_kind=dsh_tool`、`dsh_ref=实际 Tool 名称`，它们仍只是数据库定位字段；必须检查调用端是否实现解析与正常派发。登记、迁移和审核只有用户授权后才执行，不能在插件启用时顺便写库，也不为每次任务或迭代增节点。

**允许名单发生过版本变化。** 此次最新 SDK README 和 Runtime 源码 Config 表示登记后自动可用，不需要额外 allowedToolIds；历史 Req 文档/旧 Runtime 曾使用该字段。不要照抄任何一方：核对实际安装包的 schema 和实现，必要时比较 TGZ 散列及源码/构建时间。

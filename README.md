# 软件工厂 Run TypeScript SDK

适用：Runtime SDK 0.1.0、DSH 0.2.1-alpha.2、Node.js 24+。

本 SDK 供第三方开发者把自己的算法接入软件工厂 Run：注册可执行的 DSH Tool，接收业务参数，统一上报进度、日志、错误和产物，并按需调用 DSH 模型。算法仍由你实现，任务管理由 Runtime 提供。

推荐顺序：安装 SDK → 登记业务函数 → 接入上报与产物 → 小输入调试 → 交付 DSH 插件、用户 README 与 Agent 入库资料。SDK 是项目依赖，不是单独安装启用的 DSH 服务；实际运行还需要宿主中的 Runtime 插件。

下载交付包见本仓库的 [Releases](https://github.com/Waller-Man/software-factory-runtime-sdk/releases)。GitHub Packages安装方式见下方，代码中的SDK导入名保持不变。

- [安装与导入](#2-导入-sdk)
- [接入业务函数](#3-按这个流程接入你的代码)
- [SDK接口详解](#4-下层接口业务函数向-run-上报)
- [调试与Python接入](#6-快速启动与调试步骤)
- [常见问题与解决方案](#64-常见问题与解决方案)
- [开发者交付清单](#8-开发者应当交付什么)
- [业务README要求](#9-开发者交付的业务-readme-要写什么)
- [八类入库资料与填写示例](#10-agent入库资料八大类19项字段)
- [交给AI工具的Skill](#11-给开发者的ai工具使用)

**代码块中的业务实现均为 TS 风格伪代码，不是可以直接复制运行的完整工程。** SDK 导入路径、接口名、参数名和返回格式保持真实；“你的算法”“保存文件”“调用DSHTool”等表示需要实现或对接的步骤，不是 SDK 导出函数。

## 1. 接入前确认

先从业务项目中确定以下信息；已有说明能回答时直接沿用：

| 信息 | 需要确定什么 |
| --- | --- |
| 入口 | 本次接入哪个业务函数，对外 toolId 是什么 |
| 输入 | 实际参数名称、类型、必填项及一个小输入示例 |
| 输出 | 最终交付文本、文件或两者；哪些材料需要保留为中间产物 |
| 模型 | 算法是否需要模型；不需要时不要增加必填模型参数 |
| 取消 | 如何停止算法及清理自己创建的连接、进程等资源 |
| 环境 | DSH 服务端能否运行算法，需要哪些真实依赖 |

接入目标是**可安装、可启用、支持 DSH 网页版调用的 Host 插件**。业务算法在DSH服务端运行，通过原生聊天／编排调用Run；配套WebUI展示执行卡。业务插件无需另做运行管理页面。

推荐按职责分文件，沿用现有工程也可以：

```text
my-plugin/
├── src/index.ts          # DSH 插件入口、SDK 登记
├── src/business.ts       # 调用你的算法、统一上报
├── scripts/debug.ts     # 本地调试入口
├── python/              # 可选：已有 Python 算法
├── vendor/              # 平台交付的 SDK TGZ
├── agent-registration.json # 交给平台的Agent与版本入库资料
├── .env.example         # 仅在业务需要时提供无凭据的配置模板
└── README.md            # 本业务的安装、调用、依赖和登记资料说明
```

## 2. 导入 SDK

先取得平台交付的 `software-factory-runtime-sdk-0.1.0.tgz`，放到**你的业务插件项目**的vendor/，在该项目根目录执行：

```powershell
npm.cmd install ./vendor/software-factory-runtime-sdk-0.1.0.tgz
```

也可取得SDK ZIP，解压后将**包含package.json及lib的已构建SDK目录**作为本地依赖安装。Git源码ZIP与预编译SDK包不同；只含src的未构建源码不能替代上述TGZ。SDK不假定已发布到公共npm。

**从GitHub Packages安装（可选）**：注册名为 `@waller-man/software-factory-runtime-sdk`，通过npm别名安装为原来的SDK依赖名。在已配置私有包访问权限的开发环境中，使用项目本地.npmrc指定账号范围的仓库；认证令牌由环境变量提供，不写入源码：

```ini
@waller-man:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${NODE_AUTH_TOKEN}
```

```powershell
npm.cmd install "@software-factory/runtime-sdk@npm:@waller-man/software-factory-runtime-sdk@0.1.0"
```

需要能够读取该私有包的GitHub认证；没有相应认证时使用Release TGZ安装。GitHub包与TGZ的SDK实现相同，区别是注册名称和发布元数据；下面的import不变。

导入方式：

```ts
import { registerRunTool } from '@software-factory/runtime-sdk';
import type { ExecutionContext, BusinessResult } from '@software-factory/runtime-sdk';
```

开发环境需要Node.js 24+，以及匹配的DSH插件开发依赖（当前Cordis `4.0.5-alpha.1`、DSH Tools `0.2.1-alpha.2`）。安装器可能解析peer依赖，应使用平台提供的开发环境，不承诺离线安装。安装SDK不会安装或启动DSH、Runtime、Python或你的业务算法。

部署时在同一DSH profile先启用Runtime，再启用业务插件。SDK可按业务插件构建方式打入产物或作为可解析依赖交付；不能只在自己的电脑npm install过，就把SDK留在交付包之外。

SDK包同时包含 `examples/echo-plugin.ts` 最小接入示例、[完整协议](docs/runtime-api.md)与[AI接入Skill](skills/software-factory-run-sdk/SKILL.md)。示例是合成演示，不是已经实现的业务Agent。

## 3. 按这个流程接入你的代码

### 3.1 业务函数：接收参数、运行算法、交回结果

```ts
// 伪代码：src/business.ts
async function runBusiness(input, execution): Promise<BusinessResult> {
  execution.signal.throwIfAborted();
  await execution.log('开始处理', 'process');
  await execution.reportProgress({
    stage: 'process', stageName: '业务处理', progress: 20
  });

  // 在这里运行你的算法，input 是调用者传入的实际业务参数。
  let result = await 你的算法(input);

  // 可选：只有算法确实需要时才调用模型。
  if (业务需要模型) {
    const answer = await execution.model.call({
      messages: [{ role: 'user', content: 待处理文本 }]
    });
    result = 根据模型回答继续处理(result, answer.text);
  }

  execution.signal.throwIfAborted();
  // 可选：有中间材料时，保存到任务目录，再登记。
  保存文件(execution.outputDirectory, 'intermediate/material.json', 中间材料);
  await execution.addArtifact({
    kind: 'intermediate', name: '中间材料',
    relativePath: 'intermediate/material.json', mime: 'application/json'
  });

  保存文件(execution.outputDirectory, 'final/result.txt', result.text);
  const file = await execution.addArtifact({
    kind: 'final', name: '结果.txt',
    relativePath: 'final/result.txt', mime: 'text/plain'
  });
  return { text: result.text, files: [file.artifactId] };
}
```

只交付文本时返回 `{text:结果文本}`；只交付文件时返回 `{files:[file.artifactId]}`。不要求每个业务都生成示例中的文件或使用模型。至少交付非空文本或一个文件。

### 3.2 插件启用时登记业务入口

```ts
// 伪代码：src/index.ts；省略业务类型和具体 Schema 的展开。
export const inject = ['tools', 'sfRuntime'];

export function apply(ctx) {
  registerRunTool(ctx, {
    toolId: 'sf_your_tool',
    description: '说明你的算法做什么、接受什么、交付什么',
    inputSchema: 你的实际对象JSONSchema,
    execute: runBusiness
  });
}
```

inputSchema 必须与真实函数参数一致，例如业务接受 text，就声明 text，不能只根据数据库中的能力描述猜测参数。

登记发生在插件启用时；Run 启动每个任务时才执行 `runBusiness(input, execution)`。registerRunTool 封装了正常 DSH Tool 登记与 Run 协议接入，不办理 HugeGraph Agent 入库。

按原有 DSH 插件工程方式构建和打包，保证有效入口、bundle patch、显示信息和必要算法文件齐全。具体安装规范使用 cordis-plugin-development Skill，不在此展开工程配置。

## 4. 下层接口：业务函数向 Run 上报

下层共 9 项：登记函数、execute 回调和 7 个 execution 方法。以下各节独立说明用途、参数、返回值与伪代码。异步调用均应 await。

### 4.1 registerRunTool(ctx, definition)

用途：把业务函数登记为 DSH Tool，同时接入 Run。

| 参数 | 必填 | 含义 |
| --- | --- | --- |
| ctx | 是 | DSH 传给插件 apply 的 Context |
| definition.toolId | 是 | 唯一业务 Tool 名称 |
| definition.description | 是 | 功能说明 |
| definition.inputSchema | 是 | 实际参数的对象 JSON Schema |
| definition.execute | 是 | 本次任务执行时调用的业务函数 |

用法见 3.2。返回异步释放函数 `() => Promise<void>`，通常由 SDK 绑定的插件生命周期管理。

### 4.2 execute(input, execution)

用途：接收业务输入，运行你的代码，返回最终结果。

| 输入／输出 | 说明 |
| --- | --- |
| input | 与 inputSchema 一致的只读业务参数 |
| execution | Run 自动提供的本次任务上下文，不由调用者填写 |
| 返回值 | `Promise<{text?:string,files?:string[]}>`，files 为已登记的 final 文件 ID |

```ts
// 伪代码：最小业务回调。
async function execute(input, execution) {
  const result = await 你的算法(input);
  return { text: result.text };
}
```

上下文属性：

| 属性 | 用法 |
| --- | --- |
| execution.runId | 本次任务唯一 ID |
| execution.outputDirectory | 本次任务产物根目录 |
| execution.signal | 取消信号；调用 throwIfAborted() 检查是否应停止 |
| execution.model.selection | 本次固定的 `{provider,model,reasoningEffort?}`，也可能没有值 |

正常返回并完成结果校验后，Run 标为 completed。直接抛出带具体原因的错误，Run 会记录并进入失败处理。

### 4.3 reportStatus(status, message?)

用途：上报任务状态。返回 `Promise<void>`。

| 参数 | 必填 | 说明 |
| --- | --- | --- |
| status | 是 | running、completed、failed、cancelled |
| message | 否 | 状态说明 |

```ts
await execution.reportStatus('running', '开始处理输入');
```

开始和完成通常由 Run 自动管理。上报 completed 不会提前结束函数，实际完成以返回结果为准；failed／cancelled 会触发停止流程，业务仍需配合 signal 停止。只做取消，没有暂停。

### 4.4 reportProgress(report)

用途：上报阶段和百分比。返回 `Promise<void>`。

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| stage | 是 | 阶段标识，如 parse |
| stageName | 是 | 展示名称，如“解析输入” |
| progress | 否 | 0～100 的任务百分比 |
| message | 否 | 当前处理说明 |

```ts
await execution.reportProgress({
  stage: 'parse', stageName: '解析输入', progress: 30,
  message: '已处理部分输入'
});
```

不知道百分比时只报阶段和说明。

### 4.5 log(message, stage?)

用途：保存执行消息，供上层查看。返回 `Promise<void>`。

| 参数 | 必填 | 说明 |
| --- | --- | --- |
| message | 是 | 日志文本 |
| stage | 否 | 所属阶段标识 |

```ts
await execution.log('输入解析完成', 'parse');
```

console.log 用于本地或服务端终端调试；需要进入任务记录的消息使用 execution.log。

### 4.6 reportIssue(issue)

用途：记录告警、错误及原因。返回 `Promise<void>`。

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| level | 是 | warning 或 error |
| message | 是 | 具体原因 |
| stage | 否 | 所属阶段 |
| code | 否 | 业务错误码 |
| fatal | 否 | true 表示停止任务；省略时只记录 |

```ts
// 可继续的告警。
await execution.reportIssue({
  level: 'warning', stage: 'parse', message: '部分空白内容已跳过'
});

// 必须停止。
await execution.reportIssue({
  level: 'error', stage: 'parse', message: '没有可处理的内容', fatal: true
});
execution.signal.throwIfAborted();
```

error 级别本身不会停止任务，由 fatal 决定。简单失败也可直接 `throw new Error('具体原因')`。

### 4.7 addArtifact(file)

用途：登记已经保存的中间材料或最终文件。返回 `Promise<Artifact>`。

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| kind | 是 | intermediate 或 final |
| name | 是 | 文件展示名称 |
| relativePath | 是 | 相对 execution.outputDirectory 的路径 |
| mime | 是 | 文件媒体类型 |

```ts
// 伪代码：先保存，再登记，最后返回文件 ID。
保存文件(execution.outputDirectory, 'final/report.md', 报告内容);
const file = await execution.addArtifact({
  kind: 'final', name: '报告.md',
  relativePath: 'final/report.md', mime: 'text/markdown'
});
return { files: [file.artifactId] };
```

Artifact 包含 artifactId、kind、name、relativePath、mime、size。中间材料放 intermediate/ 或 snapshots/，最终文件放 final/，这些目录由 Run 创建。新增深层目录自行创建。

addArtifact 不生成或复制文件；最终返回的是已登记的 final 文件 ID，不是路径。认证下载引用交给上层获取。

### 4.8 model.call(request)

用途：调用本次任务固定的 DSH 模型。返回 `Promise<{text,usage?}>`。

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| messages | 是 | 至少一条消息 |
| messages[].role | 是 | system、user 或 assistant |
| messages[].content | 是 | 文本字符串；user 消息也支持文本／图片内容块数组 |
| content[].type | 数组时是 | text 或 image_url |
| content[].text | text 时是 | 文本内容 |
| content[].image_url.url | image_url 时是 | 公网 HTTP(S) 图片地址，或 data:image/...;base64,... |

```ts
const answer = await execution.model.call({
  messages: [
    { role: 'system', content: '请提取需求要点。' },
    { role: 'user', content: input.text }
  ]
});
// 伪代码：使用回答继续你的算法。
const result = 根据模型回答继续处理(answer.text);
```

图片解析仍通过同一个 call，风格与开发者直接调用模型 API 相似：

```ts
// TS 风格伪代码：图片地址来自你的业务输入。
const answer = await execution.model.call({
  messages: [
    { role: 'system', content: '请提取需求截图中的要点。' },
    {
      role: 'user',
      content: [
        { type: 'text', text: '分析以下图片' },
        { type: 'image_url', image_url: { url: 图片URL或Base64DataURL } }
        // 多图：继续添加 image_url 内容块。
      ]
    }
  ]
});
const result = 根据模型回答继续处理(answer.text);
```

本地图片先由业务代码读取，再拼成 `data:image/png;base64,...` 等 Data URL；不要直接填本机文件路径。支持 PNG、JPEG、GIF、WebP，图片由 DSH 附件服务校验、保存，再交给任务选定的视觉模型解析。

图片只放在 user 消息；system 和 assistant 保持文本。不新增 files 上传接口，不接受厂商 file_id；PDF、Word 等普通文件仍需业务代码先解析成文本或图片。

text 是模型对文本或图片的回答；usage 是可选 token 用量及缓存计数。纯算法不需要调用此接口。

启动任务时model可选：省略则使用来源会话已有模型；传入则固定provider/model及可选reasoningEffort（使用DSH目录给出的实际ID）。推理强度随任务保存并用于隔离模型请求，无须修改业务函数。没有可用模型却调用model.call会报MODEL_REQUIRED。不传API Key，不在每次模型请求中换路由。调用使用隔离模型会话，多轮所需历史由messages显式传入。

```ts
// TS 风格伪代码：手动多轮；messages 保留上一轮传入的图文内容。
messages.push({ role: 'assistant', content: answer.text });
messages.push({ role: 'user', content: '把上面的要点整理成表格' });
const next = await execution.model.call({ messages });
```

所选模型须在 DSH 实际路由元数据中声明支持 image，否则报 MODEL_IMAGE_UNSUPPORTED，不悄悄忽略图片。未启用附件服务时报 IMAGE_SERVICE_UNAVAILABLE。文本总量限制仍为 1 MiB；图片按 DSH 附件限制及模型实际能力处理，不占用这个文本限额。模型日志保存附件引用，不重复写入图片 Base64。

### 4.9 registerCleanup(callback)

用途：登记任务完成、失败、取消等结束流程的资源清理。返回 void；callback 可返回 void 或 Promise<void>。

```ts
// 伪代码：resource 是你的连接、进程或后台任务。
const resource = 创建你的资源();
execution.registerCleanup(async () => {
  await 停止并等待资源退出(resource);
});

for (const item of 待处理数据) {
  execution.signal.throwIfAborted();
  await 处理一项(item);
}
```

只清理自己创建的资源。耗时算法应定期检查 signal；持续占用线程的同步计算需要分段或放进可停止的工作线程／子进程。

## 5. 上层接口：如何传参启动和查看任务

下层是你的函数向 Run 上报；上层是网页、编排或其他调用者向 Run 发起请求。上层接口**不是从本 SDK 导入的 JS 函数**。

| 用途 | DSH Tool／Remote | request 输入 | data 输出 |
| --- | --- | --- | --- |
| 查看输入规格 | sf_runtime_get_tool_contract／getToolContract | `{toolId}` | toolId、description、inputSchema、supportsRun |
| 启动 | sf_runtime_run_tool／runTool | `{toolId,input,model?,timeoutMs?}` | `{runId,status:'queued'}` |
| 查询 | sf_runtime_get_run／getRun | `{runId}` | 状态、阶段、进度、logs、issues、artifacts、result、lastSeq 等 |
| 列表 | sf_runtime_list_runs／listRuns | `{toolId?,status?,limit?,offset?}` | `{items,total}` |
| 等待更新 | sf_runtime_wait_run／waitRun | `{runId,afterSeq?,waitMs?}` | `{run,events,lastSeq}` |
| 取消 | sf_runtime_cancel_run／cancelRun | `{runId}` | `{runId,status}` |
| 持续订阅 | 仅 Remote：watchRun | `{runId,afterSeq?}` | RunEvent 流：runId、seq、type、data、time |
| 获取文件 | sf_runtime_get_artifact／getArtifact | `{runId,artifactId}` | 文件元数据和认证 downloadUrl |

服务返回 `{ok:true,data}` 或 `{ok:false,error:{code,message}}`。Remote 使用已有 DSH 认证连接、sfRuntime 命名空间及真实 runtimeSessionId，外层还有标准 RemoteResult；接线见 [接口规范](docs/runtime-api.md)。不要自行假定存在公共 HTTP 地址。

调用流程伪代码：

```ts
// 调用DSHTool 代表宿主正常 Tool 调用链，不是 SDK 导出函数。
const accepted = await 调用DSHTool('sf_runtime_run_tool', {
  toolId: 'sf_your_tool',
  input: { text: '一段示例输入' }
  // 可选：model: { provider: 实际providerID, model: 实际modelID }
  // 可选：timeoutMs: 120000
});
检查服务返回ok(accepted);
const runId = accepted.data.runId;

const update = await 调用DSHTool('sf_runtime_wait_run', { runId, waitMs: 15000 });
const record = await 调用DSHTool('sf_runtime_get_run', { runId });
// 从 record.data.result 取得最终文本和文件。
// 需要停止时：调用 sf_runtime_cancel_run，参数 { runId }。
```

input 按实际 Schema 填写；model、timeoutMs 位于启动请求顶层。waitRun 每次最多等待 30 秒，等待到期不会取消任务；继续等待时传上次 lastSeq 为 afterSeq。文件从 getRun 返回的结果中取得真实 artifactId，再用 getArtifact 获取下载引用。

## 6. 快速启动与调试步骤

### 6.1 本地先调业务，不启动 DSH

```ts
// 伪代码：先验证算法本身。
const input = 一个小规模输入;
const result = await 你的算法(input);
打印并检查(result);

// 再验证 SDK 接入，调试上下文由你在 scripts/debug.ts 中创建。
const execution = 创建本地调试上下文({
  日志和进度: 打印到终端,
  产物目录: 本项目临时目录,
  文件登记: 检查文件存在并返回模拟artifactId,
  模型调用: 本地先不调用真实模型
});
const output = await runBusiness(input, execution);
检查文本和文件(output);
```

“创建本地调试上下文”不是 SDK 方法。替身按 ExecutionContext 实现即可，不需要做完整测试框架；它不代表真实 Tool 注册、权限或下载认证已经通过。

补齐真实实现和调试入口后，Node.js 24 可从项目根目录运行：

```powershell
node --experimental-strip-types scripts/debug.ts
```

需要断点时，使用 VS Code 的 JavaScript Debug Terminal；或执行以下命令后附加 Node 调试器：

```powershell
node --inspect-brk --experimental-strip-types scripts/debug.ts
```

在业务函数入口、算法调用、模型调用和文件返回处打断点，观察 input、execution.outputDirectory 和结果。以上命令需要真实代码，不能直接运行本指南中的占位伪代码。

### 6.2 在 DSH 网页验证完整调用

1. 按项目原有方式构建，将业务插件通过 DSH 插件管理安装到当前网页版使用的 profile；先启用 Runtime，再启用业务插件。
2. 业务插件启用时，registerRunTool 自动向 Runtime 登记入口；无需填写额外允许名单，停用时自动撤销。
3. 打开已正常运行的DSH网页，进入绑定真实工作区的聊天。宿主启动命令与地址以对应发行版说明为准；SDK不提供独立网页或启动命令。
4. 要求正常调用 sf_runtime_get_tool_contract，确认真实输入；再通过 sf_runtime_run_tool 传入小规模业务参数。
5. 用 waitRun／getRun 检查日志、阶段、进度和最终结果，用 getArtifact 验证文件引用。
6. 对一个稍长的小任务验证取消，确认算法停止且自有资源退出。

修改代码后重新构建并按宿主更新流程加载；若提示 restart-required，按要求重启。刷新网页不能证明后端代码已更新。浏览器本机路径也不能当成服务端文件路径。

### 6.3 调试时看哪里

- **代码与异常**：本地断点、DSH服务端终端。
- **进度与报错**：getRun返回的阶段、data.logs和data.issues。
- **输入与文件**：`<workspace>/outputs/runs/<runId>/`，其中input/request.json是原始输入，run.json是状态记录，intermediate／snapshots／final保存材料。

### 6.4 常见问题与解决方案

以下保留7个常见问题；先核对实际安装版本和当前任务记录。

| 常见问题 | 常见原因 | 解决方案 |
| --- | --- | --- |
| 1. SDK导入失败或找不到业务Tool | SDK包不完整、Runtime未启用或业务入口未登记 | 安装预编译SDK TGZ；在同一profile先启用Runtime，再启用业务插件，核对registerRunTool及真实toolId |
| 2. RUNTIME_CONTEXT_REQUIRED／参数校验失败 | 绕过Run调用，或按登记说明猜测参数 | 通过sf_runtime_run_tool启动；先查getToolContract，再按真实inputSchema传参 |
| 3. 更新后仍是旧代码 | 安装路径不对或宿主仍加载旧模块 | 核对安装目录与版本，按宿主提示重启；构建已链接插件前先确认运行任务，避免触发重载 |
| 4. Python已启动，网页一直停在“启动准备” | 插件额外的文件沙箱阻止写入Run任务目录，连错误日志也无法保存，失败未及时传回 | 下方给出该实际案例的处理方式：托管进程、调整额外沙箱、保留代码与权限检查、独立报告失败、确认真实写入 |
| 5. 模型或图片调用失败 | 模型未配置、不支持图片，或附件服务／输入格式不符合要求 | 选择真实可用模型；图片用user.content的image_url块，传公网URL或合法Base64 Data URL，并确认附件服务可用 |
| 6. 文件已生成但不能交付或下载 | 没登记，或返回路径而非产物ID | 先保存再addArtifact，最终返回本任务的final artifactId；下载使用getArtifact提供的认证引用 |
| 7. 取消后Python仍运行 | 没传播signal，或清理后未等待退出 | 传递取消信号，registerCleanup停止并等待自有进程退出；只清理自己启动的资源 |

**文件写入权限问题的处理案例（第4项）**

用户遇到的情况是：Python已经启动，但被本插件额外添加的文件沙箱挡住，无法写入Run创建的任务目录。错误日志同样无法写入，失败信息没有及时传回，网页因此停在“启动准备”。用户采用以下方式处理：

1. 参考文档拆分插件，用 `ctx.subprocess` 托管Python，取消本插件额外添加的文件沙箱。
2. 仍通过代码检查，只使用Run提供的 `execution.outputDirectory`，并检查工作区和会话权限。
3. 即使错误文件写入失败，也经TS适配层直接向Run报告原始失败，不依赖错误日志先保存成功。
4. 增加启动确认和超时：Python在本次任务目录实际写入成功后，才算准备完成；启动失败或超时及时报告。

**没有提权，也没有修改Windows目录权限。该案例调整后依靠插件代码约束写入范围，不再提供额外的操作系统级文件隔离。**

详细排查见Skill的[部署与验证经验](skills/software-factory-run-sdk/references/lessons-and-validation.md)和[Python适配说明](skills/software-factory-run-sdk/references/python-adapter.md)。环境探测成功不等于实际任务目录可写；生成文件也不等于算法内容正确。

只需小输入验证主要流程；不默认运行完整真实算法或消耗真实模型额度。

## 7. Python 项目接入原则

链路为：DSH 网页 → Run → TS 业务入口 → Python 算法。仍需交付 DSH 插件；Python 不直接导入 TS SDK，TS 负责统一上报和返回。

```ts
// TS 风格伪代码：描述适配职责，不限定业务自己的通信实现。
async function runPythonBusiness(input, execution) {
  execution.signal.throwIfAborted();
  await execution.reportProgress({ stage: 'python', stageName: 'Python处理' });

  const job = 启动Python算法({
    interpreter: 服务端实际解释器路径,
    script: 服务端实际脚本路径,
    input,
    outputDirectory: execution.outputDirectory,
    signal: execution.signal
  });
  execution.registerCleanup(async () => {
    await 停止并等待自有Python进程退出(job);
  });

  // 需要内部进度时，在适配层将 Python 消息转交给 SDK。
  转发阶段和日志(job, execution.reportProgress, execution.log);
  const result = await 等待Python结果(job);
  execution.signal.throwIfAborted();

  // Python 已把文件保存到本任务的 final/ 下。
  const file = await execution.addArtifact({
    kind: 'final', name: result.name,
    relativePath: result.relativePath, mime: result.mime
  });
  return { text: result.text, files: [file.artifactId] };
}
```

“启动Python算法”等由开发者的适配层实现，SDK 没有内置通用 Python 桥。简单调用可采用 JSON 输入输出；需要逐步进度时再约定消息格式，算法日志与结果应能区分。

Python 依赖在部署准备阶段安装，运行任务时不自动安装。调试顺序为：单独调 Python 函数 → 验证输入输出 → 用 TS 调试入口调用 → 在 DSH 网页调用。需要模型时优先由 TS 使用 model.call，将必要结果传给 Python，不传模型 API Key。

## 8. 开发者应当交付什么

| 交付物 | 应包含什么 |
| --- | --- |
| 可安装业务插件 | 可被DSH正常安装启用的预编译目录／ZIP／TGZ；有效package.json、bundle patch、Host入口、显示元信息、算法文件和必要运行依赖 |
| 源码与构建说明 | TS适配层、原算法／Python文件、依赖版本、构建方式；不要只给本机node_modules或绝对路径 |
| 业务README | 面向新电脑用户的安装、环境、真实输入输出、调用示例、模型、产物、升级与排错说明，见下一节 |
| Agent入库资料 | 逻辑Agent身份和描述、具体版本的八类字段及来源；建议单独保存agent-registration.json，并在业务README说明 |
| 小输入与结果说明 | 不含敏感数据的最小输入，以及应得到的文本／文件类别，不冒充真实业务效果数据 |
| 验证记录 | 入口能否正常调用，进度／问题／产物是否可读，取消是否停止自有资源；区分模拟模型、真实模型和实际宿主验证 |

验收重点：真实input与inputSchema一致；通过正常Run链执行；最终文件先保存再登记并返回artifactId；阶段与百分比来自真实处理；model按需使用；错误不能伪装成成功；signal与清理回调能停止自己的任务。

交付物不得包含API Key、数据库密码、真实用户任务材料或本机专用路径。Python等依赖在部署准备阶段安装，不在每次运行任务时自动pip install。业务插件启用不自动写HugeGraph。

## 9. 开发者交付的业务 README 要写什么

下面是**你的业务插件README**至少要回答的问题，不是要求再次复制SDK全部手册：

| 章节 | 用户需要知道什么 |
| --- | --- |
| 功能与输入输出 | 算法解决什么问题、处理对象、最终交付及中间材料；有什么明确限制 |
| 服务端环境 | 兼容DSH／Node／Python版本、解释器选择、真实第三方依赖及部署准备步骤 |
| 新电脑快速启动 | 从哪里取得预编译包，在DSH如何安装启用，Runtime与业务插件的启用顺序，如何判断入口已就绪 |
| 实际调用示例 | 真实toolId、参数名、类型、必填要求、最小请求；文件路径属于DSH服务端，不能把浏览器电脑路径当服务端路径 |
| 模型选择 | 是否需要模型，继承来源会话还是显式指定，实际所需能力；不索取或硬编码模型API Key |
| 过程、错误与取消 | 业务阶段、进度含义、常见错误、如何查询和取消；有无不易中断的业务阶段 |
| 产物与下载 | workspace/outputs/runs/runId下的final／intermediate／snapshots，最终文件类型与认证下载方式 |
| 入库资料 | 逻辑Agent与版本资料、真实dsh_ref、八类字段、论文／测试来源，未知项明确省略 |
| 更新与验证范围 | 插件包版本与业务版本，升级／重启方式；本地调试、模拟、真实工作区、真实模型分别验证了什么 |

写出可以照着执行的命令和业务请求，避免只写“安装依赖后运行”。若没有独立网页或启动服务，不要编造npm start。模型服务配置沿用DSH；其他配置仅给无凭据模板和真实用途。

## 10. Agent入库资料：八大类、19项字段

开发者按以下维度提供资料，方便平台审核入库。**这不是registerRunTool的参数表，也不是让开发者直接调用数据库。** SDK登记的是实际执行Tool；Agent／AgentVersion资料经平台Manage人工确认后保存。当前19项是平台基线，后续以实际字段元数据为准。

| 大类 | 中文字段 | 存储属性 | 填写说明 |
| --- | --- | --- | --- |
| 身份与治理 | agentID | Agent.agent_id | 逻辑身份；已有值不可修改 |
| 身份与治理 | Agent名称 | Agent.name | 真实名称，不能用版本名代替 |
| 身份与治理 | 版本 | AgentVersion.version | 业务版本，如v2.0；不同于插件包版本与runId |
| 身份与治理 | 启用状态 | AgentVersion.status | 按实际治理状态填写；enabled不代表已安装或执行验证通过 |
| 身份与治理 | 开发人员 | AgentVersion.developer | 可选，多人用顿号分隔 |
| 可执行与调用 | 调用方式 | AgentVersion.invoke_kind | 本接入示例为dsh_tool |
| 可执行与调用 | 调用入口 | AgentVersion.dsh_ref | 必须与实际SDK登记的toolId一致 |
| 训练与评估 | 性能证据 | AgentVersion.performance_evidence_json | 注明论文／真实或合成测试、实验模型与条件 |
| 适用与环境 | 运行条件 | AgentVersion.constraints_json | 真实解释器、版本及业务运行要求 |
| 适用与环境 | 模型依赖 | AgentVersion.model_dependencies_json | 业务模型需求声明；不是DSH provider/model路由ID |
| 选择策略 | 该版本的优选指标 | AgentVersion.selection_policy_json | 只写有依据的版本指标，不从Agent或分类继承 |
| 功能类 | 逻辑Agent能力描述 | Agent.description | 逻辑层真实能力；已有值保持，和版本描述独立 |
| 功能类 | 版本能力描述 | AgentVersion.description | 该版本能力；可选，不复制或回写逻辑描述 |
| 功能类 | 处理对象类别 | AgentVersion.object_categories_json | 实际处理的业务对象类别 |
| 功能类 | 输入规格 | AgentVersion.input_schema | 登记用简明业务规格，不自动作为Tool验证器 |
| 功能类 | 输出规格 | AgentVersion.output_schema | 交付文本／文件及格式 |
| 功能类 | 中间产物 | AgentVersion.intermediate_artifacts_json | 声明材料及格式，不填某次runId或运行路径 |
| 代价类 | 运行代价 | AgentVersion.cost_json | 有实据再填，未知省略 |
| 效果类 | 任务效果 | AgentVersion.effect_json | 当前任务效果的真实依据，未知省略 |

### 10.1 填写示例：需求功能逻辑补全

以下按用户提供的既有版本资料展示，供开发者理解填写方式，不能直接复制成自己Agent的身份、Tool、人员或指标：

- 逻辑Agent：agent_id为 `agent:functional-logic-completion`，名称为“需求功能逻辑补全”。本次未提供Agent.description，示例不补造，也不从版本description复制；新建逻辑Agent时开发者应另填真实描述，已有逻辑资料由平台保持。
- **AgentVersion顶点ID：`av:agent%3Afunctional-logic-completion:v2.0`**。这是已存在顶点的定位信息，不是普通属性或新顶点ID生成规则；新版本由平台创建并返回真实ID。
- 下列JSON是**版本属性的可审阅资料表示**。可下载[完整填写示例](skills/software-factory-run-sdk/references/agent-registration.example.json)，其中agent／agentVersion分组是交付资料格式，不是SDK、Manage或HugeGraph API的请求格式。

```json
{
  "version": "v2.0",
  "description": "根据用户描述的软件系统及需求，结合用例、实体关系与 CRUD 缺口分析进行迭代需求补全，生成软件需求文档。",
  "status": "enabled",
  "developer": "吴祝骏、叶博一",
  "invoke_kind": "dsh_tool",
  "dsh_ref": "sf_functional_logic_completion_v2_0",
  "input_schema": {
    "description": "用户自然语言描述的软件系统及需求",
    "x-artifact-kind": "text",
    "x-media-type": "text/plain",
    "x-required": true,
    "x-allow-blank": false
  },
  "output_schema": {
    "description": "补全后的软件需求文档",
    "x-artifact-kind": "file",
    "x-file-extension": ".docx"
  },
  "intermediate_artifacts_json": [
    { "description": "初始需求分析", "x-artifact-kind": "file", "x-file-extension": ".json" },
    { "description": "逐轮检查与补全快照", "x-artifact-kind": "file", "x-file-extension": ".json" },
    { "description": "CRUD矩阵及检查结果", "x-artifact-kind": "file", "x-file-extension": ".json" },
    { "description": "E-R图源码", "x-artifact-kind": "file", "x-file-extension": ".puml" },
    { "description": "用例图源码", "x-artifact-kind": "file", "x-file-extension": ".puml" }
  ],
  "constraints_json": { "runtime": "Python", "version": "3.12" },
  "model_dependencies_json": [
    { "vendor": "DeepSeek", "name": "deepseek-v4.1-flash" }
  ],
  "object_categories_json": ["软件系统及需求描述", "软件需求文档"],
  "performance_evidence_json": {
    "evidence_kind": "paper",
    "summary": "ICSE 2026《Unlocking the Silent Needs》，实验模型 Qwen3-32B。Table 3：PURE 的 Inventory、WebStore、Email 三个系统，每组运行3次，完整方法汇总 RR=112.9%、DR=125%、HR=0%；RR、DR为相对参考需求及实体数量的完整率，可超过100%。Figure 8：7个案例的平均 CRUD 缺口率 CR 最终为0%，正文报告2至4轮完成。"
  }
}
```

以下三个字段当前没有填写，入库时**直接省略**：

| 字段 | 中文含义 |
| --- | --- |
| selection_policy_json | 该版本的优选指标 |
| cost_json | 运行代价 |
| effect_json | 任务效果 |

不要为了凑齐19项补空字符串、null、空对象、空数组或虚构数据。其他未知可选项同样省略。

### 10.2 必须说明的存储与调用区别

1. **数据库TEXT存储**：input_schema、output_schema和所有 `*_json` 属性在HugeGraph中实际以TEXT保存。交付JSON中保留对象／数组便于审阅，写入前在平台入库边界对每个属性值执行 `JSON.stringify()`；不能只序列化整个请求，也不要把已序列化TEXT再次编码。SDK业务插件不负责直接写库。
2. **登记规格不等于Tool参数**：上面的简明输入输出没有定义真实函数参数名。实际调用必须查询插件真实Tool契约；SDK的inputSchema仍填写对象JSON Schema，不能把这段登记说明原样当验证器，也不能猜参数叫text、path或其他名字。登记里的必填／非空等业务要求应由真实接口落实。
3. **论文证据不等于当前运行效果**：示例证据来自论文，实验模型是Qwen3-32B，**不是当前DeepSeek配置的实测结果**。RR／DR相对参考数量计算，可以超过100%，不要改写成准确率或当前效果保证。

序列化规则伪代码，供入库方理解，不是SDK数据库API：

```ts
const textProperties = {};
for (const [key, value] of Object.entries(开发者提供的版本属性)) {
  textProperties[key] = key === 'input_schema' || key === 'output_schema' || key.endsWith('_json')
    ? JSON.stringify(value)
    : value;
}
// 交由平台人工审核保存，不在业务插件启用时自动提交。
```

## 11. 给开发者的AI工具使用

随包提供 Skill：**software-factory-run-sdk**，入口为 [skills/software-factory-run-sdk/SKILL.md](skills/software-factory-run-sdk/SKILL.md)。 **推荐使用例如Codex，Claude code ,Deepseekharness等工具加载此Skill辅助开发**，该Skill包含真实Run协议、Python模型桥接、部署排错以及Agent入库资料参考。

开发者可将整个Skill目录按自己AI工具的规则安装，或直接提供SKILL.md及references／agents目录。连同以下材料一起交给AI：原算法项目、SDK README、实际SDK TGZ、目标DSH版本及业务约束。仅发送Skill不会自动安装SDK依赖或Runtime。

可用提示词：

```text
请按 software-factory-run-sdk Skill 和 SDK README，保留原算法，
把本项目接入可安装的DSH后端插件，通过Run执行并上报过程和产物。
同时交付新电脑使用README及八类Agent入库资料；未知项省略，不自动写库。
```

如环境提供brainstorming、cordis-plugin-development **（deepseek官方插件开发skill）**，可用于需求与宿主开发规范；未提供时基于实际资料核对接口，不假装调用。文档处理Skill仅在业务确实需要时采用。

## 12. SDK仓库与分发说明

本仓库保存SDK源码、示例、文档及Skill；`.gitignore` 排除lib、artifacts、依赖、缓存、本地任务和凭据。当前源码仍依赖reconstruct的contracts及Runtime构建打包脚本，不能只克隆此目录就假定可独立构建。预编译TGZ供开发者直接安装，不要求复制整个reconstruct。

维护者在完整工作区生成SDK安装包后，交付TGZ／ZIP；包内包含README、公开类型、示例、协议文档与完整Skill。源码与预编译包分别管理，不把lib／artifacts提交进源码Git。

GitHub Packages由本仓库的 `Publish SDK package` 手动Actions工作流发布：先发布包含TGZ、ZIP、package-check.json和SHA256SUMS.txt的Release，再在Actions填写对应tag（如v0.1.0）运行。工作流校验Release文件，将临时发布副本命名为账号范围的 `@waller-man/software-factory-runtime-sdk`，使用仓库内置GITHUB_TOKEN发布私有包；不修改源代码导入名，也不需要将个人令牌交给仓库。工作流不承担源码独立构建，不要直接在未构建的源码目录执行npm publish。

---
name: software-factory-run-sdk
description: "使用软件工厂 Run SDK，将已有 Python、TypeScript 等算法接入可安装的 DSH 后端插件，并整理开发者交付物、业务 README 及八类 Agent 入库资料。适用于业务插件接入与迁移，不用于开发通用前端、直接写数据库或改造整个平台。"
---

# 软件工厂 Run SDK 业务插件接入

**新开发的业务插件优先使用 `execution.model.getConnection({protocol})`，通过 Runtime 网关调用模型，复用现有 OpenAI／Anthropic 客户端。`execution.model.call()` 保留兼容旧插件；账号登录等网关暂不支持的连接，仍按宿主适配能力使用旧接口。真实 API Key 不交给业务插件。** 协议与连接规则见 [run-contract.md](references/run-contract.md)，Python 接入见 [python-adapter.md](references/python-adapter.md)。

把已有算法接入 Run 的正常执行链，交付能安装到 DSH 的后端插件。Python 项目通常保留 Python，以 TypeScript 承担 SDK、模型、进程和产物适配。不为内部每个算法模块分别创建插件或数据库 Agent。

本 Skill 来自 ReqCompleter 的实际改造经验，不是一套固定版本的 SDK 文档。先读取目标项目实际提供的 README、SDK 包和宿主实现；不要把本项目的目录、依赖、工具名、进度权重和权限选择复制成通用标准。

本目录随 SDK 仓库及交付包提供，面向开发者使用的 AI 编程工具。定位实际 SDK README 和类型定义；如果用户只提供 Skill，先确定 SDK 版本及可用包，不假定工具已安装。本机已安装的其他同类 Skill 不代表目标项目已经接入。

## 开始时确认这些事实

1. 找到原项目或用户提供的 ZIP、目标插件、Run SDK 和 Runtime。以指定原始材料为算法基线，记录可复核的版本或散列。阅读适用的 AGENTS.md。
2. 按用户授权范围开展工作。要求先方案时，先交付简短方案并等确认；已确认的范围内不重复询问。设计本身不授权安装、重启、真实模型调用、数据库写入或更改 ACL。
3. 如环境提供 brainstorming、cordis-plugin-development，按任务使用并说明；若其工具或后续 Skill 缺失，如实说明，使用实际源码核对接口，不假装调用。不要为此自动安装依赖或另造宿主 API。
4. 列清实际入口、业务参数、结果、循环上限与终止条件、提示词和历史边界、文件写入、依赖、UI 启动代码、硬编码路径及直接模型请求。区分算法本身与部署/通信行为。

## 先形成最小方案

向用户说明：保留什么算法、改哪些适配文件、真实 Tool 输入输出、文件在哪里、模型与消息怎样传递、如何取消、采用哪种文件权限方案，以及做哪些小测试。标明“源码已有”“拟新增”“待验证”。不要顺带重写前端、编排系统、数据库或模型配置页。

典型链路：

```text
DSH 网页/聊天
  → Run 正常启动接口
  → registerRunTool 注册的 TS 业务入口
  → 受管 Python 子进程/已有后端
  ↔ Runtime 模型网关（getConnection 取得任务临时连接）
  → Run 目录、进度、问题、产物 ID
```

- **源码接口与交付**：阅读 [run-contract.md](references/run-contract.md)。不要把 SDK README 中的业务伪代码当成导出函数。
- **Python、模型与进程**：阅读 [python-adapter.md](references/python-adapter.md)。采用每任务子进程或复用已有服务，应按已有结构和隔离要求选，不为迁移强制改通信架构。
- **权限、卡住、测试与部署**：阅读 [lessons-and-validation.md](references/lessons-and-validation.md)。发生权限或启动问题时先读此文件，别凭“Python 已启动”推断模型正在运行。
- **交付与入库资料**：阅读 [agent-registration.md](references/agent-registration.md)，输出业务插件、用户README与Agent／AgentVersion资料；填写范例见 [agent-registration.example.json](references/agent-registration.example.json)。这是资料交付，不是数据库写入授权。

## 实施时守住这些边界

### 保留业务语义

保留原提示词、解析规则、去重规则、缺口合并、操作提示、实体扩张、循环次序及收敛判据。认为是明显 bug 也不能顺手改掉；单列问题与影响，获得对应授权后再修。必要时用 AST 指纹、差异审阅或少量固定输入证明保持一致。

可以改的部署事项包括无用 UI 依赖、启动入口、硬编码路径、模型传输、任务目录和异常传播，但应说明行为变化。API 错误或空响应不能伪装成正常业务文本继续生成文档。

### 让 Run 持有任务

使用实际 SDK 的 `registerRunTool` 登记真实版本入口。使用 `execution.runId`、`outputDirectory`、`signal` 和资源清理能力；由 Run 提供固定模型、任务状态及产物引用。业务入口必须由正常 Tool/Remote 执行链到达，不直接调用工具回调冒充已接入。

逻辑Agent身份保持稳定，业务版本可以独立插件交付，也可以在同一包内保留多个真实版本入口，按实际部署选择。插件包版本和业务版本分开管理；增加新版时保留仍受支持的旧入口。不要假设同一插件包可同时安装多个版本。

### 明确文件权限方案

`ctx.subprocess` 的进程托管、模型上下文隔离、应用层路径检查、操作系统文件沙箱是不同能力。

- 用户接受受信任后端时，可用普通受管 Python，遵守真实会话权限和任务路径检查；明确它不能从操作系统层面阻止任意 Python 代码越界写入。
- 要求强制文件隔离时，使用实际宿主沙箱并验证其授权。失败后不要静默去掉 `confine()`、提权或改 ACL。若仅改业务插件不能满足，报告缺口。
- 不把某次“权限拒绝”直接归咎于宿主；也不把另一个未使用沙箱的插件能运行当作沙箱已验证。

### 用户配置统一放在组件内部

**用户配置统一放在 DSH 对应组件内部的原生配置页，通过“插件 → 插件包 → 包含的组件”进入，填写、保存并持久化，各组件独立管理。** 独立安装或合入其他Bundle都采用此入口，不将表单仅挂在原包外层。程序路径、启动等待时间等通过表单提供，不要求用户手改`.env`、JSON或YAML。模型真实凭据继续由DSH原生凭据服务管理。

原生服务与`plugins.row.config`挂载方式见[Run协议中的用户配置接入](references/run-contract.md#用户配置接入)。合入新Bundle时按其实际包名和组件rowId重新登记入口，复用表单与独立配置，不假设挂载会自动迁移。业务README说明组件内的入口、字段、默认值及生效范围。宿主缺少必要能力时报告限制，不静默改成交付`.env`；开发过程尽量兼容Linux，具体要求见下节。

### 尽可能兼容 Linux 服务器

**业务插件应尽可能兼容 Linux，为后续服务器部署做准备。** 使用跨平台路径 API，注意文件名大小写，不写死 Windows 盘符、反斜杠、`.exe` 或 PowerShell／CMD 命令。Python、Java 等程序使用可配置路径或系统 PATH，区分虚拟环境的 `Scripts/` 与 `bin/`，不复制本机虚拟环境交付；依赖优先选支持 Linux 的版本。业务 README 说明 Linux 依赖安装与启动方式、已验证环境及限制；未在 Linux 验证时如实标注，不把兼容性设计当作验证结果。

### 复用模型，不复用主聊天历史

新开发优先使用 `execution.model.getConnection({protocol})`（SDK／Runtime>=0.3.0），把任务临时连接交给 OpenAI／Anthropic 客户端。旧项目的 `execution.model.call()` 可以保持不变；账号登录等网关不支持的连接按宿主适配能力使用旧接口，不强制迁移。真实凭据留在DSH，模型和思考强度由上层指定，协议由工具声明，不让AI选择协议。Runtime>=0.3.1按厂商已确认入口路由，不要求工具协议与DSH自己的默认协议相同：DeepSeek官方连接可供工具使用OpenAI格式，仍复用相同凭据。自定义反代不能盲目替换URL；不转换正文或假定任意厂商支持全部协议。接入细节见[Run协议](references/run-contract.md)。主聊天只传明确业务输入及必要摘要，历史按原算法显式组织。

保留算法逐次给出的采样／输出参数；网关使用对应协议的原生字段。继续采用旧model.call桥接时，SDK／Runtime>=0.2.0支持temperature、maxTokens、stop，须贯通Python／TS，Python的max_tokens映射成maxTokens。0温度不能丢失，未提供的字段不补默认值。旧插件只传messages仍可使用新版Runtime。字段约束与提供方限制见[Run协议](references/run-contract.md)，不能仅将原参数存入快照就声称已恢复算法语义。

0.3.0不再逐次持久化DSH聊天，旧接口只使用隔离内存上下文；请求记录归入任务的logs/model-calls。更早版本应核对实际会话实现，不能把旧部署行为当成新版能力。

### 提供真实阶段与产物

SDK／Runtime>=0.4.0时，确需人工信息可await execution.interaction.ask，使用select／text／mixed三种模式；select只能选给定value，text只收非空文字，mixed至少填一项。同一Run依次提问，Python经TS桥接往返，不给下层网页授权Token。问题由现有执行卡展示，算法等待真实回答后继续；取消／超时不自动选默认答案。首版不做附件上传、通用暂停恢复或服务重启后恢复，业务确认不替代宿主权限审批。接口示例见SDK README 4.11。

阶段在开始工作前上报，日志进任务记录，stdout 协议与 stderr 分开。允许不报百分比；若报，必须有明确计算规则、任务内不倒退、注明估算，不以计时器假装进度。100% 不等于需求完整或方法收敛。

原始输入、中间结果、逐轮前后状态、可见模型请求响应及最终产物按需持久保存；不能只留最后一次结果或混合日志。用真实文件登记得到的 artifactId 返回，不用路径或自行拼出的网页地址冒充下载引用。

## 完成标准

优先用小输入和模拟模型验证正常 Run 链、真实 Python 写入、错误终态、取消及产物登记。实际工作区与临时目录的权限不同，至少单独检查一次真实服务环境下的新任务目录；不因健康检查成功就跳过。未授权时不运行完整耗时算法或真实模型。

交付时说明改动范围、算法是否保持、构建/发布位置、服务端依赖与安装步骤、是否需重启。把证据分开报告：源码分析、模拟测试、真实工作区测试、真实 profile/网页测试、用户报告。不要把较低层的通过扩展成完整验证，也不要在有任务运行时构建已链接的插件触发重载。

另外交付独立的Agent入库资料与业务README。按八类字段说明真实来源，未知可选项省略，不能为凑字段编造运行代价、效果或优选指标。Agent.description与AgentVersion.description独立；登记用简明输入输出规格不替代实际Tool参数Schema；模型声明不是provider/model路由ID。JSON类型资料在交付文件中保留对象／数组，HugeGraph TEXT序列化由入库边界逐属性处理，SDK业务插件不自动写库。

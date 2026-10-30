# Python 适配、模型桥接与异常

## 适配边界

优先保留原业务模块。TS 负责注册、验证输入、固定 Run 上下文、托管 Python、转发模型请求、SDK 上报及登记产物；Python 负责原来的算法和明确的业务状态。适配层不是顺手优化算法的授权。

先查原代码实际发送给模型的内容，不只看类名是否带 Memory。Req 的原类会累积 memory，但部分实际请求仅发 system + 当前 prompt；迁移时把全部 memory 发给新模型会改变语义。反过来，原项目确实多轮时也不能随意丢掉历史。

Python 不持有 API Key，不继续独立连接厂商。移除/替换硬编码模型、地址及直接网络客户端；模型调用统一转给 TS 的 `execution.model.call()`。不要把“模型报错文本”作为实体、用例或章节继续传播。

## 通信选择

每任务一个子进程通常最容易隔离状态和取消，推荐 JSONL stdin/stdout；已有成熟的 HTTP 后端可保留，但要隔离 job、请求、历史和取消状态，后台协程崩溃必须能变成该 job 的失败终态。不要为一个简单脚本额外搭建 HTTP 服务。

下表是**本插件可自行设计的内部协议示意，不是 Run SDK 的协议或导出 API**：

| 方向 | 消息 | 必要信息 |
|---|---|---|
| TS → Python | start | 协议版本、runId、已验证业务输入、宿主 outputDirectory |
| Python → TS | ready/启动阶段完成 | 已接收输入且实际目录写入成功；不是仅进程存在 |
| Python → TS | step / log | 阶段、开始/完成、轮次及有限业务日志 |
| Python → TS | model_request | 任务内唯一 id、模块/轮次、原语义的 messages |
| TS → Python | model_response | 对应 id、runId、text 或结构化 error |
| Python → TS | artifact / final | 任务内相对路径、可序列化结果及方法状态 |
| 任意停止路径 | cancel / error | 标识、可读错误；取消仍需宿主终止兜底 |

协议实施要求：

- stdout 只输出一行一条 JSON，使用真正的换行和 flush；调试 print 改到 stderr。设置 UTF-8、无缓冲，验证中文路径和文本。
- TS 按字节流解析，处理多条粘连、半条分片、CRLF、UTF-8 多字节，限制消息及日志大小；不能把任意 stdout 当模型答案。
- 使用 runId 与请求 id 校验归属和响应匹配，拒绝重复/错序响应及未知协议版本。模型并发不是原算法能力时不为提速擅自并发。
- 发往 Python 的启动消息包含可用输出根，输入仍使用原契约；桥接器不得让业务输入覆盖宿主目录或身份。
- 取消消息可作合作式通知，但 Python 若正阻塞读或计算，需 signal 和受管进程范围终止兜底。

Req 为每次模型请求只允许两条纯文本消息，这是该项目原算法约束，不应复制成所有 Python 插件的限制。需要多轮或图片的项目应按真实 SDK 类型验证 messages。

## 启动与进程生命周期

使用 DSH 的 `ctx.subprocess.resolveExecutable()` / `spawn()` 等实际可用能力，核对绝对解释器、脚本路径、stdio、cwd、graceMs、signal。不要用插件安装目录或服务启动目录作为任务 cwd/output 的替代品。

启动应能区分：解释器找到 → 依赖探测成功 → 接收本次输入 → 实际目录可写 → 首个业务阶段 → 首个模型请求。环境 probe 不运行算法，也不能宣称等于真实目录写入成功。

Python 在原有初始化写入成功后确认 ready，然后再加载/运行业务；独立设置有限启动确认时间。确认后停止启动计时器，避免它把正常的长模型请求误杀；模型和整体任务时限各自处理。

为自有子进程登记幂等清理，正常完成、失败、取消、插件停用或宿主关闭都可触发。终止后等待 `done` 和受管进程范围退出。只停止自己创建的句柄；不要扫 PID、按端口接管别人服务或 taskkill 所有 Python。

## 错误不能依赖日志写成功

把输入目录准备、日志处理器创建、依赖导入和算法入口都纳入任务异常边界。TS 初始 manifest 写入也不能放在自有错误处理之外而假定必成功。

失败路径的顺序和不变量：

1. 保留内存中的原始错误、阶段、轮次和失败状态。
2. 尝试通过 stdout 协议、既有 HTTP job 状态或其他正常通道交还宿主，不要求日志先落盘成功。TS 保留并抛出原错误，Run 才能进入终态。
3. 日志、manifest、材料索引等尽力保存；再次失败单独记录，不覆盖首错。Python 的结构化 error 发射不应再隐式依赖会写文件的普通事件记录器。
4. 自有资源仍要清理；清理失败与业务失败分别报告。宿主自行落盘都失败时，如实报告无法保证网页状态持久化，不声称任何磁盘故障都可被插件完全修复。

注意等待关系：注册 cleanup 并不代表资源已经退出，reportIssue(error) 也不必然让业务函数停止。每个 Promise、后台协程和进程退出都必须有人观察，避免后台异常退出、上层仍无限轮询 queued/running。

## Windows 临时文件陷阱

本次现场：worker 已读到启动请求，创建 `input/worker-claim.json` 被拒绝；错误处理再保存 `logs/error.json`。调用栈停在 `tempfile._mkstemp_inner`，Python 持续消耗 CPU。

Python 3.12 的该 Windows 分支会在 PermissionError 且目录被判断存在/可写时反复换名重试。`os.access()` 在此不能代替同一受限进程的真实创建操作。不是所有 NamedTemporaryFile 都有问题，也不是所有 PermissionError 都会如此。

需要避免此类重试时，可用随机临时名 + `os.open(O_CREAT | O_EXCL, 0o600)` 做一次或有限次数的原子创建，只对确实的名称碰撞有限重试，权限拒绝立即向外抛。再写入、flush/fsync、`os.replace` 到目标文件。只有创建成功才取得临时文件的清理所有权；不要删掉碰撞的既有文件。

检查普通业务 JSON、错误日志和归档 ZIP 的临时文件路径，不能只修一处。保留任务材料不等于保留未完成临时文件作为最终成果。

## Python 环境与发布包

根据源码和依赖元数据确认最低 Python 版本，不把 Req 的 Python 3.12、pandas/docx 锁定版本当成其他项目的要求。

- 初版通常使用服务端安装的 Python＋插件独立 venv＋锁定依赖，解释器路径作为宿主配置。任务运行时不临时 pip install，不依赖全局包。
- 检查无用 Gradio、OpenAI 客户端、平台 UI 启动器能否移除；保留算法确实需要的原生依赖及跨平台限制。
- 环境探测只返回可公开的版本、依赖和可用状态；不读取或输出 `.env`、credentials.json、认证头等。
- `.venv` 不跟插件发布，不在 Windows/Linux 间复制。Linux 重新建 venv，解释器通常是 bin/python；Windows 通常是 Scripts/python.exe。
- 本地目录安装可能链接项目根，也可能链接解压的发布目录。相对 `.venv` 默认值据此变化；推荐外置 venv 并明确 pythonPath，避免“装上插件但找不到 Python”。
- 发布包包含编译后的后端、Python 源码、锁文件、合法资源与必要环境准备工具；不带密钥、测试产物、整个 node_modules 或本机虚拟环境。未来自带运行时另做平台包，不为当前接入引入自动下载器。

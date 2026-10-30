# Agent 入库资料与开发者交付

与算法适配一起交付以下内容：可安装的DSH业务插件、源码与构建说明、业务README、小输入示例和验证记录、结构化Agent入库资料。SDK登记Tool不会自动登记HugeGraph；数据库变更由平台Manage人工审核后保存，不在业务插件启用时写库或改Schema。

## 八大类、19项字段

| 大类 | 中文字段 | 归属与存储属性 |
| --- | --- | --- |
| 身份与治理 | agentID | Agent.agent_id |
| 身份与治理 | Agent名称 | Agent.name |
| 身份与治理 | 版本 | AgentVersion.version |
| 身份与治理 | 启用状态 | AgentVersion.status |
| 身份与治理 | 开发人员 | AgentVersion.developer |
| 可执行与调用 | 调用方式 | AgentVersion.invoke_kind |
| 可执行与调用 | 调用入口 | AgentVersion.dsh_ref |
| 训练与评估 | 性能证据 | AgentVersion.performance_evidence_json |
| 适用与环境 | 运行条件 | AgentVersion.constraints_json |
| 适用与环境 | 模型依赖 | AgentVersion.model_dependencies_json |
| 选择策略 | 该版本优选指标 | AgentVersion.selection_policy_json |
| 功能类 | 逻辑Agent能力描述 | Agent.description |
| 功能类 | 版本能力描述 | AgentVersion.description |
| 功能类 | 处理对象类别 | AgentVersion.object_categories_json |
| 功能类 | 输入规格 | AgentVersion.input_schema |
| 功能类 | 输出规格 | AgentVersion.output_schema |
| 功能类 | 中间产物 | AgentVersion.intermediate_artifacts_json |
| 代价类 | 运行代价 | AgentVersion.cost_json |
| 效果类 | 任务效果 | AgentVersion.effect_json |

按当前平台字段元数据填写；上述19项是当前基线，不把它硬编码为未来平台的永久字段数。未知可选字段省略，已有Agent资料由平台保持，不猜测或覆盖。

## 示例怎样用

[完整JSON示例](agent-registration.example.json)是用户提供的既有需求补全版本的资料，加上已知逻辑Agent标识和名称，作为**交付资料格式示例**。agent／agentVersion分组不是SDK、Manage或HugeGraph的API请求格式。开发者按实际业务填写，不能把示例的Tool、身份、人员、Python版本或论文指标照抄到自己的Agent。

- 示例顶点ID `av:agent%3Afunctional-logic-completion:v2.0` 是已存在版本的定位信息，不是普通属性，也不是新版本ID的生成规则。新版本使用平台真实创建结果，不伪造或修改既有vertexId。
- 示例未给出逻辑Agent.description，因此没有添加该属性，更不能把版本description复制过去。新建逻辑Agent需另行提供真实描述；已有逻辑Agent保持其现值。
- `selection_policy_json`、`cost_json`、`effect_json` 当前未填写，直接省略，不补空字符串、null、空对象或虚构数值。论文、合成测试和实际模型实测必须明确区分。

## 三个不能混淆的接口边界

1. **登记简明规格与Tool实际参数**：input_schema／output_schema可用description、x-artifact-kind等描述业务。SDK的inputSchema必须是实际对象JSON Schema，按函数的真实参数名和验证要求填写；不能把登记说明直接作为Tool参数验证器。
2. **JSON交付与数据库TEXT**：交付文件用普通JSON对象／数组便于审阅。input_schema、output_schema和所有*_json属性实际写入HugeGraph前，需对每个属性的值JSON.stringify()；不是只把整个请求转JSON，也不对已有TEXT重复编码。其他文本属性保持文本。序列化由平台入库边界处理，SDK业务插件不直接写库。
3. **模型声明与执行路由／证据**：model_dependencies_json是模型需求声明，不是DSH provider/model ID。示例论文使用Qwen3-32B，所列RR／DR／HR／CR不是当前DeepSeek配置的实测结果；RR／DR按参考数量计算可超过100%，不要改写成准确率。enabled也不证明Tool已安装或算法已验证。

## 业务README至少说明

用途与真实输入输出；DSH／Node／Python等服务端依赖；预编译包安装与升级；真实toolId和调用参数；模型继承／指定方式；阶段、取消与错误；最终文件及中间材料位置；八类入库资料与证据来源；已验证和未验证的范围。实际Tool入口、SDK登记toolId及入库dsh_ref保持一致。

交付中不带凭据、真实用户任务材料或本机固定路径。小输入与模拟模型可用于验证接入，但必须标明，不能冒充真实业务效果证据。

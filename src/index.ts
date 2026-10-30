import type { Context } from '@deepseek-ai/cordis';
import { assertObjectJsonSchema, validateJsonSchemaValue, type ToolDefinition, type ToolRunContext, type JsonSchemaNode } from '@deepseek-ai/dsh-tools';
import type { Artifact, ArtifactInput, BusinessResult, ModelRef, ModelRequest, ModelResponse, ProgressReport, IssueReport, ReportStatus, RunObject } from '@software-factory/contracts/runtime';
export type * from '@software-factory/contracts/runtime';

export interface ExecutionContext {
  readonly runId: string;
  readonly outputDirectory: string;
  readonly signal: AbortSignal;
  reportStatus(status: ReportStatus, message?: string): Promise<void>;
  reportProgress(report: ProgressReport): Promise<void>;
  log(message: string, stage?: string): Promise<void>;
  reportIssue(issue: IssueReport): Promise<void>;
  addArtifact(file: ArtifactInput): Promise<Artifact>;
  registerCleanup(callback: () => void | Promise<void>): void;
  readonly model: {
    readonly selection?: ModelRef;
    /** Stateless API-style request: user content may mix text and image_url parts. */
    call(request: ModelRequest): Promise<ModelResponse>;
  };
}
export interface RunToolDefinition<I = RunObject> {
  toolId: string;
  description: string;
  inputSchema: RunObject;
  execute(input: Readonly<I>, execution: ExecutionContext): Promise<BusinessResult>;
}
/** Host-only protocol seam. Access requires a real Tool execution minted by DSH. */
export interface RunProtocolHost {
  registerEntry(tool: ToolDefinition): () => void;
  executionFor(exec: ToolRunContext, tool: ToolDefinition): ExecutionContext;
}
declare module '@deepseek-ai/cordis' { interface Context { sfRuntime: RunProtocolHost } }

/** Register once on plugin enable. DSH still owns policy, guards and dispatch. */
export function registerRunTool<I = RunObject>(ctx: Context, definition: RunToolDefinition<I>): () => Promise<void> {
  const runtime = ctx.get('sfRuntime');
  if (!runtime) throw new Error('Runtime尚未启用；业务插件需要 inject: ["tools", "sfRuntime"]');
  assertObjectJsonSchema(definition.inputSchema as JsonSchemaNode);
  const parameters = structuredClone(definition.inputSchema);
  const tool: ToolDefinition = {
    name: definition.toolId, description: definition.description, parameters,
    output: {
      schema: { type: 'object', properties: { text: { type: 'string' }, files: { type: 'array', items: { type: 'string' } } }, additionalProperties: false },
      render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }],
    },
    async execute(input, exec) {
      const execution = runtime.executionFor(exec, tool);
      const errors = validateJsonSchemaValue(parameters as JsonSchemaNode, input, 'input');
      if (errors.length) throw new Error('INPUT_VALIDATION_FAILED: ' + errors.join('; '));
      return definition.execute(input as I, execution);
    },
  };
  return ctx.effect(() => {
    const removeTool = ctx.tools.register(tool);
    let removeEntry: () => void;
    try { removeEntry = runtime.registerEntry(tool); } catch (error) { removeTool(); throw error; }
    return () => { removeEntry(); removeTool(); };
  }, 'software-factory: run tool ' + definition.toolId);
}

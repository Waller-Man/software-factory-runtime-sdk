/** Minimal third-party backend plugin. Its own bundle must load this module. */
import type { Context } from '@deepseek-ai/cordis';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { registerRunTool } from '@software-factory/runtime-sdk';

export const inject = ['tools', 'sfRuntime'];
export function apply(ctx: Context) {
  registerRunTool<{ text: string; useModel?: boolean }>(ctx, {
    toolId: 'sf_example_echo',
    description: 'Synthetic SDK example: echo text or request the selected model, and deliver text plus a file.',
    inputSchema: {
      type: 'object', properties: { text: { type: 'string' }, useModel: { type: 'boolean' } },
      required: ['text'], additionalProperties: false,
    },
    async execute(input, execution) {
      await execution.log('开始处理');
      await execution.reportProgress({ stage: 'processing', stageName: '处理', progress: 20 });
      let text = input.text;
      if (input.useModel) text = (await execution.model.call({ messages: [{ role: 'user', content: text }] })).text;
      execution.signal.throwIfAborted();
      await writeFile(join(execution.outputDirectory, 'intermediate/input.txt'), input.text);
      await execution.addArtifact({ kind: 'intermediate', name: '原始材料', relativePath: 'intermediate/input.txt', mime: 'text/plain' });
      await writeFile(join(execution.outputDirectory, 'final/result.txt'), text);
      const file = await execution.addArtifact({ kind: 'final', name: 'result.txt', relativePath: 'final/result.txt', mime: 'text/plain' });
      await execution.reportProgress({ stage: 'delivery', stageName: '交付', progress: 100 });
      return { text, files: [file.artifactId] };
    },
  });
}

import { runNextSubagent } from './subagents';
import { SubagentQueue, SubagentResult, SubagentTask } from './types';

export interface SubagentRunner {
  runNext(queue: SubagentQueue): Promise<SubagentTask>;
}

export function createLocalSubagentRunner(handler?: (task: SubagentTask) => Promise<SubagentResult> | SubagentResult): SubagentRunner {
  return {
    runNext: (queue) => runNextSubagent(queue, handler),
  };
}

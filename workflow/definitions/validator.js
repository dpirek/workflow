import { validateExpression } from '../expression/evaluator.js';

const NODE_TYPES = new Set([
  'START',
  'END',
  'USER_TASK',
  'SERVICE_TASK',
  'SCRIPT_TASK',
  'EXCLUSIVE_GATEWAY',
  'PARALLEL_GATEWAY',
  'TIMER',
  'MESSAGE',
]);

export function validateDefinition(definition) {
  const errors = [];
  if (!definition || typeof definition !== 'object') throw new Error('Definition must be an object');
  if (!definition.key || typeof definition.key !== 'string') errors.push('key is required');
  if (!definition.name || typeof definition.name !== 'string') errors.push('name is required');
  if (!Array.isArray(definition.nodes) || definition.nodes.length === 0) errors.push('nodes must be a non-empty array');
  if (!Array.isArray(definition.edges)) errors.push('edges must be an array');
  if (errors.length) throw new Error(`Invalid workflow definition: ${errors.join('; ')}`);

  const nodeKeys = new Set();
  for (const node of definition.nodes) {
    if (!node?.key || typeof node.key !== 'string') errors.push('every node requires a string key');
    else if (nodeKeys.has(node.key)) errors.push(`duplicate node key: ${node.key}`);
    else nodeKeys.add(node.key);
    if (!NODE_TYPES.has(node?.type)) errors.push(`unsupported node type at ${node?.key || '?'}: ${node?.type}`);
    if (node?.type === 'SERVICE_TASK' && !node.workerType && !node.config?.workerType) {
      errors.push(`service task ${node.key} requires workerType`);
    }
  }

  const starts = definition.nodes.filter((node) => node.type === 'START');
  const ends = definition.nodes.filter((node) => node.type === 'END');
  if (starts.length !== 1) errors.push(`exactly one START is required (found ${starts.length})`);
  if (ends.length === 0) errors.push('at least one END is required');

  const outgoing = new Map(definition.nodes.map((node) => [node.key, []]));
  for (const edge of definition.edges) {
    if (!edge?.from || !nodeKeys.has(edge.from)) errors.push(`edge references unknown source: ${edge?.from}`);
    if (!edge?.to || !nodeKeys.has(edge.to)) errors.push(`edge references unknown target: ${edge?.to}`);
    if (edge?.from && outgoing.has(edge.from)) outgoing.get(edge.from).push(edge);
    if (edge?.condition !== undefined && edge.condition !== null) {
      try {
        validateExpression(edge.condition);
      } catch (error) {
        errors.push(`invalid condition on ${edge.from}->${edge.to}: ${error.message}`);
      }
    }
  }
  if (starts[0] && outgoing.get(starts[0].key)?.length !== 1) errors.push('START must have exactly one outgoing edge');
  for (const end of ends) if (outgoing.get(end.key)?.length) errors.push(`END ${end.key} cannot have outgoing edges`);

  if (starts[0]) {
    const reached = new Set([starts[0].key]);
    const queue = [starts[0].key];
    while (queue.length) {
      for (const edge of outgoing.get(queue.shift()) || []) {
        if (!reached.has(edge.to)) {
          reached.add(edge.to);
          queue.push(edge.to);
        }
      }
    }
    for (const node of definition.nodes) if (!reached.has(node.key)) errors.push(`unreachable node: ${node.key}`);
  }
  if (errors.length) throw new Error(`Invalid workflow definition: ${errors.join('; ')}`);
  return definition;
}

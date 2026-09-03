export const WORKFLOW_NODE_WIDTH = 132;
export const WORKFLOW_EDGE_COLOR = '#75869e';

export function fluidConnector(from, to, nodeWidth = WORKFLOW_NODE_WIDTH) {
  const halfWidth = nodeWidth / 2;
  const curve = Math.max(55, Math.abs(to.x - from.x) / 2);
  return {
    path: `M ${from.x + halfWidth} ${from.y} C ${from.x + curve} ${from.y}, ${to.x - curve} ${to.y}, ${to.x - halfWidth} ${to.y}`,
    labelX: (from.x + to.x) / 2,
    labelY: (from.y + to.y) / 2 - 9,
  };
}

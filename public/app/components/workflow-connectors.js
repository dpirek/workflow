export const WORKFLOW_NODE_WIDTH = 132;
export const WORKFLOW_NODE_HEIGHT = 76;
export const WORKFLOW_EDGE_COLOR = '#75869e';
export const WORKFLOW_ARROW_LENGTH = 10;
const SIDE_VECTORS = {
  right: { x: 1, y: 0 },
  bottom: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  top: { x: 0, y: -1 },
};

export function allocateConnectorSides(positions, edges) {
  const used = new Map([...positions.keys()].map((key) => [key, new Set()]));
  const claim = (nodeKey, otherKey) => {
    const node = positions.get(nodeKey);
    const other = positions.get(otherKey);
    if (!node || !other) return 'right';
    const distance = Math.hypot(other.x - node.x, other.y - node.y) || 1;
    const direction = { x: (other.x - node.x) / distance, y: (other.y - node.y) / distance };
    const preferences = Object.entries(SIDE_VECTORS)
      .map(([side, vector], order) => ({
        side,
        order,
        score: direction.x * vector.x + direction.y * vector.y,
      }))
      .sort((a, b) => b.score - a.score || a.order - b.order);
    const occupied = used.get(nodeKey) || new Set();
    const choice = preferences.find(({ side }) => !occupied.has(side)) || preferences[0];
    occupied.add(choice.side);
    used.set(nodeKey, occupied);
    return choice.side;
  };

  return edges.map((edge) => ({
    sourceSide: claim(edge.from, edge.to),
    targetSide: claim(edge.to, edge.from),
  }));
}

function sidePoint(node, side, halfWidth, halfHeight) {
  const vector = SIDE_VECTORS[side];
  return {
    point: {
      x: node.x + vector.x * halfWidth,
      y: node.y + vector.y * halfHeight,
    },
    vector,
  };
}

export function fluidConnector(
  from,
  to,
  nodeWidth = WORKFLOW_NODE_WIDTH,
  nodeHeight = WORKFLOW_NODE_HEIGHT,
  sides = {},
) {
  const halfWidth = nodeWidth / 2;
  const halfHeight = nodeHeight / 2;
  const deltaX = to.x - from.x;
  const deltaY = to.y - from.y;
  const horizontal = Math.abs(deltaX) / nodeWidth >= Math.abs(deltaY) / nodeHeight;
  let start;
  let end;
  let sourceDirection;
  let targetDirection;

  if (sides.sourceSide && sides.targetSide) {
    const sourcePort = sidePoint(from, sides.sourceSide, halfWidth, halfHeight);
    const targetPort = sidePoint(to, sides.targetSide, halfWidth, halfHeight);
    start = sourcePort.point;
    end = targetPort.point;
    sourceDirection = sourcePort.vector;
    targetDirection = targetPort.vector;
  } else if (horizontal) {
    const direction = deltaX >= 0 ? 1 : -1;
    start = { x: from.x + direction * halfWidth, y: from.y };
    end = { x: to.x - direction * halfWidth, y: to.y };
    sourceDirection = { x: direction, y: 0 };
    targetDirection = { x: -direction, y: 0 };
  } else {
    const direction = deltaY >= 0 ? 1 : -1;
    start = { x: from.x, y: from.y + direction * halfHeight };
    end = { x: to.x, y: to.y - direction * halfHeight };
    sourceDirection = { x: 0, y: direction };
    targetDirection = { x: 0, y: -direction };
  }

  const lineEnd = {
    x: end.x + targetDirection.x * WORKFLOW_ARROW_LENGTH,
    y: end.y + targetDirection.y * WORKFLOW_ARROW_LENGTH,
  };
  const curve = sides.sourceSide
    ? Math.max(20, Math.min(160, Math.hypot(lineEnd.x - start.x, lineEnd.y - start.y) / 2))
    : Math.max(20, horizontal ? Math.abs(lineEnd.x - start.x) / 2 : Math.abs(lineEnd.y - start.y) / 2);
  const control1 = {
    x: start.x + sourceDirection.x * curve,
    y: start.y + sourceDirection.y * curve,
  };
  const control2 = {
    x: lineEnd.x + targetDirection.x * curve,
    y: lineEnd.y + targetDirection.y * curve,
  };
  return {
    path: `M ${start.x} ${start.y} C ${control1.x} ${control1.y}, ${control2.x} ${control2.y}, ${lineEnd.x} ${lineEnd.y}`,
    labelX: (from.x + to.x) / 2,
    labelY: (from.y + to.y) / 2 - 9,
    start,
    end,
    lineEnd,
    direction: sides.sourceSide ? `${sides.sourceSide}-${sides.targetSide}` : horizontal ? 'horizontal' : 'vertical',
  };
}

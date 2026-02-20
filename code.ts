figma.showUI(__html__, { width: 360, height: 480 });

// ── Types ──────────────────────────────────────────────────────────────

interface SerializedNode {
  id: string;
  type: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  children?: SerializedNode[];
}

interface RenameOp {
  op: "rename";
  nodeId: string;
  name: string;
}

interface ApplyAutoLayoutOp {
  op: "applyAutoLayout";
  nodeId: string;
  layoutMode: "HORIZONTAL" | "VERTICAL";
  itemSpacing?: number;
  paddingLeft?: number;
  paddingRight?: number;
  paddingTop?: number;
  paddingBottom?: number;
  primaryAxisAlignItems?: "MIN" | "CENTER" | "MAX" | "SPACE_BETWEEN";
  counterAxisAlignItems?: "MIN" | "CENTER" | "MAX";
}

interface CreateFrameOp {
  op: "createFrame";
  parentId: string;
  childIds: string[];
  name?: string;
  layoutMode?: "HORIZONTAL" | "VERTICAL";
  itemSpacing?: number;
  paddingLeft?: number;
  paddingRight?: number;
  paddingTop?: number;
  paddingBottom?: number;
}

interface ReorderOp {
  op: "reorder";
  parentId: string;
  childIds: string[];
}

interface SetAbsoluteOp {
  op: "setAbsolute";
  nodeId: string;
}

type Instruction = RenameOp | ApplyAutoLayoutOp | CreateFrameOp | ReorderOp | SetAbsoluteOp;

// ── Serialization (Phase 3) ────────────────────────────────────────────

const MAX_DEPTH = 8;
const MAX_NODES = 500;
let nodeCount = 0;

function serializeNode(node: SceneNode, depth: number): SerializedNode {
  nodeCount++;
  const serialized: SerializedNode = {
    id: node.id,
    type: node.type,
    name: node.name,
    x: Math.round(node.x),
    y: Math.round(node.y),
    width: Math.round(node.width),
    height: Math.round(node.height),
  };

  if ("children" in node && depth < MAX_DEPTH && nodeCount < MAX_NODES) {
    serialized.children = [];
    for (const child of node.children) {
      if (nodeCount >= MAX_NODES) break;
      serialized.children.push(serializeNode(child, depth + 1));
    }
  }

  return serialized;
}

function serializeSelection(): SerializedNode[] | null {
  const selection = figma.currentPage.selection;
  if (selection.length === 0) return null;

  nodeCount = 0;
  return selection.map((node) => serializeNode(node, 0));
}

// ── Apply Instructions (Phase 5) ──────────────────────────────────────

// Tracks frames created by createFrame ops so later ops can reference them
const createdFrames = new Map<string, FrameNode>();

function resolveNode(nodeId: string): BaseNode | null {
  return createdFrames.get(nodeId) as BaseNode ?? figma.getNodeById(nodeId);
}

function convertGroupToFrame(group: GroupNode): FrameNode {
  const frame = figma.createFrame();
  frame.name = group.name;
  frame.x = group.x;
  frame.y = group.y;
  frame.resize(group.width, group.height);
  frame.fills = [];

  if (group.parent) {
    const idx = group.parent.children.indexOf(group);
    group.parent.insertChild(idx, frame);
  }

  while (group.children.length > 0) {
    const child = group.children[0];
    frame.appendChild(child);
  }

  group.remove();
  return frame;
}

function applyRename(op: RenameOp): void {
  const node = resolveNode(op.nodeId);
  if (!node) return;
  node.name = op.name;
}

function applyAutoLayout(op: ApplyAutoLayoutOp): void {
  let node = resolveNode(op.nodeId);
  if (!node) return;

  if (node.type === "GROUP") {
    node = convertGroupToFrame(node as GroupNode);
  }
  if (node.type !== "FRAME" && node.type !== "COMPONENT" && node.type !== "COMPONENT_SET") return;

  const frame = node as FrameNode;
  frame.layoutMode = op.layoutMode;
  if (op.itemSpacing !== undefined) frame.itemSpacing = op.itemSpacing;
  if (op.paddingLeft !== undefined) frame.paddingLeft = op.paddingLeft;
  if (op.paddingRight !== undefined) frame.paddingRight = op.paddingRight;
  if (op.paddingTop !== undefined) frame.paddingTop = op.paddingTop;
  if (op.paddingBottom !== undefined) frame.paddingBottom = op.paddingBottom;
  if (op.primaryAxisAlignItems !== undefined) frame.primaryAxisAlignItems = op.primaryAxisAlignItems;
  if (op.counterAxisAlignItems !== undefined) frame.counterAxisAlignItems = op.counterAxisAlignItems;
}

function applyCreateFrame(op: CreateFrameOp): void {
  const parentNode = resolveNode(op.parentId);
  if (!parentNode || !("children" in parentNode)) return;
  const parent = parentNode as FrameNode;

  const children: SceneNode[] = [];
  for (const cid of op.childIds) {
    const child = resolveNode(cid);
    if (child && child.type !== "PAGE" && child.type !== "DOCUMENT") {
      children.push(child as SceneNode);
    }
  }
  if (children.length === 0) return;

  const frame = figma.createFrame();
  frame.name = op.name ?? "AutoGroup";
  frame.fills = [];

  // Position the new frame at the bounding box of its children
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const c of children) {
    minX = Math.min(minX, c.x);
    minY = Math.min(minY, c.y);
    maxX = Math.max(maxX, c.x + c.width);
    maxY = Math.max(maxY, c.y + c.height);
  }
  frame.x = minX;
  frame.y = minY;
  frame.resize(maxX - minX, maxY - minY);

  // Insert the frame where the first child currently sits
  const firstChildIndex = parent.children.indexOf(children[0]);
  parent.insertChild(firstChildIndex >= 0 ? firstChildIndex : parent.children.length, frame);

  // Move children into the new frame, adjusting positions to be relative
  for (const c of children) {
    const relX = c.x - minX;
    const relY = c.y - minY;
    frame.appendChild(c);
    c.x = relX;
    c.y = relY;
  }

  // Optionally apply auto layout
  if (op.layoutMode) {
    frame.layoutMode = op.layoutMode;
    if (op.itemSpacing !== undefined) frame.itemSpacing = op.itemSpacing;
    if (op.paddingLeft !== undefined) frame.paddingLeft = op.paddingLeft;
    if (op.paddingRight !== undefined) frame.paddingRight = op.paddingRight;
    if (op.paddingTop !== undefined) frame.paddingTop = op.paddingTop;
    if (op.paddingBottom !== undefined) frame.paddingBottom = op.paddingBottom;
  }

  // Track for later ops that may reference this frame by its generated temp id
  createdFrames.set(frame.id, frame);
}

function applyReorder(op: ReorderOp): void {
  const parentNode = resolveNode(op.parentId);
  if (!parentNode || !("children" in parentNode)) return;
  const parent = parentNode as FrameNode;

  for (let i = 0; i < op.childIds.length; i++) {
    const child = resolveNode(op.childIds[i]);
    if (child && child.type !== "PAGE" && child.type !== "DOCUMENT") {
      parent.insertChild(i, child as SceneNode);
    }
  }
}

function applySetAbsolute(op: SetAbsoluteOp): void {
  const node = resolveNode(op.nodeId);
  if (!node) return;
  if ("layoutPositioning" in node) {
    (node as SceneNode & { layoutPositioning: string }).layoutPositioning = "ABSOLUTE";
  }
}

function applyInstructions(instructions: Instruction[]): number {
  let applied = 0;
  for (const instr of instructions) {
    try {
      switch (instr.op) {
        case "rename":
          applyRename(instr);
          break;
        case "applyAutoLayout":
          applyAutoLayout(instr);
          break;
        case "createFrame":
          applyCreateFrame(instr);
          break;
        case "reorder":
          applyReorder(instr);
          break;
        case "setAbsolute":
          applySetAbsolute(instr);
          break;
        default:
          continue;
      }
      applied++;
    } catch (e) {
      console.error(`Failed to apply op: ${JSON.stringify(instr)}`, e);
    }
  }
  return applied;
}

// ── Message handling ──────────────────────────────────────────────────

figma.ui.onmessage = (msg: { type: string; instructions?: Instruction[] }) => {
  if (msg.type === "analyze-selection") {
    const nodes = serializeSelection();
    if (!nodes) {
      figma.ui.postMessage({ type: "error", message: "Please select at least one layer before analyzing." });
      return;
    }
    figma.ui.postMessage({ type: "analyze", data: { nodes } });
  }

  if (msg.type === "apply" && msg.instructions) {
    createdFrames.clear();
    const count = applyInstructions(msg.instructions);
    figma.notify(`FigAlyzer applied ${count} restructuring operations.`);
    figma.ui.postMessage({ type: "apply-complete", count });
  }

  if (msg.type === "cancel") {
    figma.closePlugin();
  }
};

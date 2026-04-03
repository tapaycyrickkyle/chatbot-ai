"use client";

import { startTransition, useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import DashboardShell from "../_components/DashboardShell";
import {
  createBotFlowButton,
  createDefaultBotFlowNodeConfig,
  parseBotFlowNodeConfig,
  serializeBotFlowNodeConfig,
  type BotFlowNodeConfig,
} from "@/lib/bot-flow";

type FaqEntry = {
  id: string;
  keywords: string[];
  answer: string;
  image_attachment_id?: string;
};

type FlowNodeRecord = {
  id: string;
  keywords: string[];
  keywordInput: string;
  imageAttachmentId: string;
  config: BotFlowNodeConfig;
};

type NoticeState = {
  tone: "success" | "error";
  message: string;
};

type NodeDragState = {
  nodeId: string;
  pointerX: number;
  pointerY: number;
  originX: number;
  originY: number;
};

type ConnectionDragState = {
  sourceNodeId: string;
  buttonId: string;
  side: "left" | "right";
  startX: number;
  startY: number;
  pointerX: number;
  pointerY: number;
};

const MIN_CANVAS_WIDTH = 1100;
const MIN_CANVAS_HEIGHT = 860;
const NODE_WIDTH = 350;
const BASE_NODE_HEIGHT = 440;
const CARD_PADDING = 24;
const QUICK_REPLY_ROW_START_Y = 404;
const QUICK_REPLY_ROW_SPACING = 62;
const MAX_FLOW_BUTTONS = 3;
const MIN_ZOOM = 0.6;
const MAX_ZOOM = 1.6;
const ZOOM_STEP = 0.1;

function getCanvasPointFromElement(
  element: HTMLElement,
  canvasElement: HTMLDivElement,
  side: "left" | "right",
  zoom: number
) {
  const elementRect = element.getBoundingClientRect();
  const canvasRect = canvasElement.getBoundingClientRect();

  return {
    x: (side === "left" ? elementRect.left - canvasRect.left : elementRect.right - canvasRect.left) / zoom,
    y: (elementRect.top - canvasRect.top + elementRect.height / 2) / zoom,
  };
}

async function fetchFlowNodes(clientId: string) {
  const response = await fetch(`/api/faqs/${encodeURIComponent(clientId)}`, {
    cache: "no-store",
  });

  if (!response.ok) {
    const data = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(data?.error || "Failed to load bot flow");
  }

  return (await response.json()) as FaqEntry[];
}

function toFlowNodeRecord(entry: FaqEntry): FlowNodeRecord {
  return {
    id: entry.id,
    keywords: entry.keywords,
    keywordInput: entry.keywords.join(", "),
    imageAttachmentId: entry.image_attachment_id ?? "",
    config: createDefaultBotFlowNodeConfig(
      parseBotFlowNodeConfig(entry.answer, entry.keywords[0] || "Flow Card")
    ),
  };
}

function toApiPayload(node: FlowNodeRecord) {
  return {
    keywords: node.keywords,
    answer: serializeBotFlowNodeConfig(node.config),
    image_attachment_id: node.imageAttachmentId,
  };
}

function clampPosition(value: number, max: number) {
  return Math.min(Math.max(value, CARD_PADDING), max);
}

function buildConnectionPath(startX: number, startY: number, endX: number, endY: number) {
  const controlOffset = Math.max(120, Math.abs(endX - startX) * 0.35);
  return `M ${startX} ${startY} C ${startX + controlOffset} ${startY}, ${endX - controlOffset} ${endY}, ${endX} ${endY}`;
}

function getNodeHeight(node: FlowNodeRecord) {
  const extraButtons = Math.max(0, node.config.buttons.length - 1);
  return BASE_NODE_HEIGHT + extraButtons * QUICK_REPLY_ROW_SPACING;
}

function normalizeKeywordInput(value: string) {
  return value
    .replace(/\s*,\s*/g, ", ")
    .replace(/(,\s*){2,}/g, ", ")
    .replace(/^,\s*/g, "")
    .replace(/\s{2,}/g, " ");
}

function normalizeNodeForSave(node: FlowNodeRecord) {
  const normalizedKeywordInput = normalizeKeywordInput(node.keywordInput).trim();
  const normalizedKeywords = normalizedKeywordInput
    .split(",")
    .map((keyword) => keyword.trim())
    .filter(Boolean);
  const trimmedMessage = node.config.message.trim();
  const normalizedButtons = node.config.buttons.map((button) => ({
    ...button,
    label: button.label.trim(),
    targetNodeId: button.targetNodeId.trim(),
  }));

  return {
    normalizedNode: {
      ...node,
      keywordInput: normalizedKeywordInput,
      keywords: normalizedKeywords,
      config: {
        ...node.config,
        message: trimmedMessage,
        buttons: normalizedButtons,
      },
    },
    normalizedKeywords,
    trimmedMessage,
    normalizedButtons,
  };
}

const FaqEditorPage = () => {
  const searchParams = useSearchParams();
  const clientId = searchParams?.get("clientId") ?? "";
  const flowQuery = (searchParams?.get("q") ?? "").trim().toLowerCase();
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const nodeRefs = useRef<Record<string, HTMLElement | null>>({});
  const quickReplyRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const [nodes, setNodes] = useState<FlowNodeRecord[]>([]);
  const [isLoadingNodes, setIsLoadingNodes] = useState(true);
  const [notice, setNotice] = useState<NoticeState | null>(null);
  const [isCreatingNode, setIsCreatingNode] = useState(false);
  const [isSavingFlow, setIsSavingFlow] = useState(false);
  const [deletingNodeId, setDeletingNodeId] = useState<string | null>(null);
  const [nodeDragState, setNodeDragState] = useState<NodeDragState | null>(null);
  const [connectionDragState, setConnectionDragState] = useState<ConnectionDragState | null>(null);
  const [zoom, setZoom] = useState(1);

  const filteredNodes = nodes.filter((node) => {
    if (!flowQuery) {
      return true;
    }

    const haystacks = [
      node.config.title,
      node.config.message,
      node.imageAttachmentId,
      ...node.keywords,
      ...node.config.buttons.map((button) => button.label),
    ];

    return haystacks.some((value) => value.toLowerCase().includes(flowQuery));
  });

  const canvasWidth = Math.max(
    MIN_CANVAS_WIDTH,
    ...filteredNodes.map((node) => node.config.position.x + NODE_WIDTH + CARD_PADDING * 2)
  );

  const canvasHeight = Math.max(
    MIN_CANVAS_HEIGHT,
    ...filteredNodes.map((node) => node.config.position.y + getNodeHeight(node) + CARD_PADDING * 2)
  );

  useEffect(() => {
    const loadNodes = async () => {
      if (!clientId) {
        setNodes([]);
        setIsLoadingNodes(false);
        return;
      }

      setIsLoadingNodes(true);

      try {
        const data = await fetchFlowNodes(clientId);
        startTransition(() => {
          setNodes(data.map((entry) => toFlowNodeRecord(entry)));
        });
      } catch (error) {
        console.error(error);
        setNodes([]);
        setNotice({
          tone: "error",
          message: error instanceof Error ? error.message : "Failed to load bot flow.",
        });
      } finally {
        setIsLoadingNodes(false);
      }
    };

    void loadNodes();
  }, [clientId]);

  useEffect(() => {
    if (!notice) {
      return;
    }

    const timeoutId = window.setTimeout(() => setNotice(null), 3200);
    return () => window.clearTimeout(timeoutId);
  }, [notice]);

  const updateNode = (nodeId: string, updater: (node: FlowNodeRecord) => FlowNodeRecord) => {
    setNodes((currentNodes) => currentNodes.map((node) => (node.id === nodeId ? updater(node) : node)));
  };

  const adjustZoom = (direction: "in" | "out") => {
    setZoom((currentZoom) => {
      const nextZoom = direction === "in" ? currentZoom + ZOOM_STEP : currentZoom - ZOOM_STEP;
      return Number(Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, nextZoom)).toFixed(2));
    });
  };

  const persistNode = useCallback(async (node: FlowNodeRecord, options?: { quiet?: boolean; skipContentValidation?: boolean }) => {
    if (!clientId) {
      return false;
    }

    const {
      normalizedNode,
      normalizedKeywords,
      trimmedMessage,
      normalizedButtons,
    } = normalizeNodeForSave(node);

    if (!options?.skipContentValidation && normalizedKeywords.length === 0 && !trimmedMessage) {
      setNotice({
        tone: "error",
        message: "Add at least one keyword or a reply message before saving.",
      });
      return false;
    }

    if (!options?.skipContentValidation) {
      const hasButtonWithoutLabel = normalizedButtons.some((button) => !button.label);
      if (hasButtonWithoutLabel) {
        setNotice({
          tone: "error",
          message: "Every quick reply button needs a label before saving.",
        });
        return false;
      }

      const hasButtonWithoutTarget = normalizedButtons.some((button) => button.label && !button.targetNodeId);
      if (hasButtonWithoutTarget) {
        setNotice({
          tone: "error",
          message: "Connect every quick reply button to a target card before saving.",
        });
        return false;
      }

      if (normalizedButtons.length > MAX_FLOW_BUTTONS) {
        setNotice({
          tone: "error",
          message: `A message card can only have up to ${MAX_FLOW_BUTTONS} buttons.`,
        });
        return false;
      }
    }

    setNodes((currentNodes) =>
      currentNodes.map((currentNode) => (currentNode.id === node.id ? normalizedNode : currentNode))
    );

    try {
      const response = await fetch(`/api/faqs/${encodeURIComponent(clientId)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ faqId: node.id, ...toApiPayload(normalizedNode) }),
      });

      const result = (await response.json().catch(() => null)) as { error?: string } | null;

      if (!response.ok) {
        throw new Error(result?.error || "Unable to save card");
      }

      if (!options?.quiet) {
        setNotice({ tone: "success", message: "Card saved successfully." });
      }
      return true;
    } catch (error) {
      setNotice({
        tone: "error",
        message: error instanceof Error ? error.message : "Unable to save card.",
      });
      return false;
    }
  }, [clientId]);

  const saveFlow = async () => {
    if (!clientId || nodes.length === 0) {
      return;
    }

    setIsSavingFlow(true);

    try {
      for (const node of nodes) {
        const didSave = await persistNode(node, { quiet: true });
        if (!didSave) {
          return;
        }
      }

      setNotice({ tone: "success", message: "Flow saved successfully." });
    } finally {
      setIsSavingFlow(false);
    }
  };

  const createNode = async () => {
    if (!clientId) {
      return;
    }

    setIsCreatingNode(true);
    const offset = nodes.length * 28;
    const config = createDefaultBotFlowNodeConfig({
      title: `Card ${nodes.length + 1}`,
      position: {
        x: clampPosition(72 + offset, canvasWidth - NODE_WIDTH - CARD_PADDING),
        y: clampPosition(72 + offset, MIN_CANVAS_HEIGHT - BASE_NODE_HEIGHT - CARD_PADDING),
      },
    });

    try {
      const response = await fetch(`/api/faqs/${encodeURIComponent(clientId)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keywords: [], answer: serializeBotFlowNodeConfig(config), image_attachment_id: "" }),
      });

      const result = (await response.json().catch(() => null)) as { error?: string; faqId?: string } | null;

      if (!response.ok || !result?.faqId) {
        throw new Error(result?.error || "Unable to create card");
      }

      const faqId = result.faqId;
      setNodes((currentNodes) => [
        ...currentNodes,
        { id: faqId, keywords: [], keywordInput: "", imageAttachmentId: "", config },
      ]);
      setNotice({ tone: "success", message: "New card created." });
    } catch (error) {
      setNotice({ tone: "error", message: error instanceof Error ? error.message : "Unable to create card." });
    } finally {
      setIsCreatingNode(false);
    }
  };

  const deleteNode = async (nodeId: string) => {
    if (!clientId) {
      return;
    }

    setDeletingNodeId(nodeId);

    try {
      const response = await fetch(`/api/faqs/${encodeURIComponent(clientId)}?faqId=${encodeURIComponent(nodeId)}`, {
        method: "DELETE",
      });
      const result = (await response.json().catch(() => null)) as { error?: string } | null;

      if (!response.ok) {
        throw new Error(result?.error || "Unable to delete card");
      }

      setNodes((currentNodes) =>
        currentNodes
          .filter((node) => node.id !== nodeId)
          .map((node) => ({
            ...node,
            config: {
              ...node.config,
              buttons: node.config.buttons.map((button) =>
                button.targetNodeId === nodeId ? { ...button, targetNodeId: "" } : button
              ),
            },
          }))
      );
      setNotice({ tone: "success", message: "Card deleted." });
    } catch (error) {
      setNotice({ tone: "error", message: error instanceof Error ? error.message : "Unable to delete card." });
    } finally {
      setDeletingNodeId(null);
    }
  };

  useEffect(() => {
    if (!nodeDragState && !connectionDragState) {
      return;
    }

    const handlePointerMove = (event: PointerEvent) => {
      if (nodeDragState) {
        const deltaX = (event.clientX - nodeDragState.pointerX) / zoom;
        const deltaY = (event.clientY - nodeDragState.pointerY) / zoom;

        setNodes((currentNodes) =>
          currentNodes.map((node) => {
            if (node.id !== nodeDragState.nodeId) {
              return node;
            }

            const nodeHeight = getNodeHeight(node);

            return {
              ...node,
              config: {
                ...node.config,
                position: {
                  x: clampPosition(nodeDragState.originX + deltaX, canvasWidth - NODE_WIDTH - CARD_PADDING),
                  y: clampPosition(nodeDragState.originY + deltaY, canvasHeight - nodeHeight - CARD_PADDING),
                },
              },
            };
          })
        );
      }

      if (connectionDragState) {
        const rect = canvasRef.current?.getBoundingClientRect();
        if (!rect) {
          return;
        }

        setConnectionDragState((currentState) =>
          currentState
            ? {
                ...currentState,
                pointerX: (event.clientX - rect.left) / zoom,
                pointerY: (event.clientY - rect.top) / zoom,
              }
            : null
        );
      }
    };

    const handlePointerUp = async (event: PointerEvent) => {
      if (nodeDragState) {
        const draggedNode = nodes.find((node) => node.id === nodeDragState.nodeId);
        setNodeDragState(null);
        if (draggedNode) {
          await persistNode(draggedNode, { quiet: true, skipContentValidation: true });
        }
      }

      if (connectionDragState) {
        const dropTarget = document.elementFromPoint(event.clientX, event.clientY);
        const nodeElement = dropTarget instanceof HTMLElement ? dropTarget.closest("[data-node-id]") : null;
        const targetNodeId = nodeElement instanceof HTMLElement ? nodeElement.dataset.nodeId ?? "" : "";

        if (targetNodeId && targetNodeId !== connectionDragState.sourceNodeId) {
          const nextNodes = nodes.map((node) => {
            if (node.id !== connectionDragState.sourceNodeId) {
              return node;
            }

            return {
              ...node,
              config: {
                ...node.config,
                buttons: node.config.buttons.map((button) =>
                  button.id === connectionDragState.buttonId
                    ? { ...button, targetNodeId }
                    : button
                ),
              },
            };
          });

          setNodes(nextNodes);
          const updatedNode = nextNodes.find((node) => node.id === connectionDragState.sourceNodeId);
          if (updatedNode) {
            await persistNode(updatedNode, { quiet: true, skipContentValidation: true });
          }
        }

        setConnectionDragState(null);
      }
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [nodeDragState, connectionDragState, nodes, canvasHeight, canvasWidth, zoom, persistNode]);

  const renderedConnections = filteredNodes.flatMap((node) =>
    node.config.buttons
      .map((button, index) => {
        const targetNode = filteredNodes.find((candidate) => candidate.id === button.targetNodeId);
        if (!targetNode) {
          return null;
        }

        const sourceButtonElement = quickReplyRefs.current[button.id];
        const targetNodeElement = nodeRefs.current[targetNode.id];
        const sourcePoint =
          sourceButtonElement && canvasRef.current
            ? getCanvasPointFromElement(sourceButtonElement, canvasRef.current, "right", zoom)
            : {
                x: node.config.position.x + NODE_WIDTH,
                y: node.config.position.y + QUICK_REPLY_ROW_START_Y + index * QUICK_REPLY_ROW_SPACING,
              };
        const targetPoint =
          targetNodeElement && canvasRef.current
            ? getCanvasPointFromElement(targetNodeElement, canvasRef.current, "left", zoom)
            : {
                x: targetNode.config.position.x,
                y: targetNode.config.position.y + getNodeHeight(targetNode) / 2,
              };

        return {
          id: `${node.id}:${button.id}`,
          path: buildConnectionPath(
            sourcePoint.x,
            sourcePoint.y,
            targetPoint.x,
            targetPoint.y
          ),
        };
      })
      .filter(Boolean) as Array<{ id: string; path: string }>
  );

  const draftConnectionPath = connectionDragState
    ? buildConnectionPath(
        connectionDragState.startX,
        connectionDragState.startY,
        connectionDragState.pointerX,
        connectionDragState.pointerY
      )
    : null;

  return (
    <DashboardShell activeNav="Clients" searchPlaceholder="Search flow cards..." showTopBar={false}>
      <div className="flex flex-col gap-6">
        {notice ? (
          <div className={`rounded-2xl border px-4 py-3 text-[13px] ${notice.tone === "success" ? "border-[var(--accent-bright)]/50 bg-[rgba(8,62,35,0.52)] text-[var(--text-primary)]" : "border-[#5b2a2a] bg-[rgba(58,19,19,0.82)] text-[#ffc1c1]"}`}>
            {notice.message}
          </div>
        ) : null}

        <section className="rounded-[1.5rem] border border-[var(--border)] bg-[var(--surface)] p-2.5 sm:p-3">
          {isLoadingNodes ? (
            <div className="rounded-2xl border border-[var(--border)] bg-background px-5 py-5">
              <p className="text-[14px] text-[var(--text-muted)]">Loading bot flow...</p>
            </div>
          ) : !clientId ? (
            <div className="rounded-2xl border border-[var(--border)] bg-background px-5 py-5">
              <p className="text-[14px] text-[var(--text-muted)]">Open the builder from a connected client card to start creating conversation flows.</p>
            </div>
          ) : filteredNodes.length === 0 ? (
            <div className="rounded-2xl border border-[var(--border)] bg-background px-5 py-5">
              <p className="text-[14px] text-[var(--text-muted)]">{nodes.length === 0 ? "No cards yet. Create your first card to start building the chatbot flow." : "No cards match your current search."}</p>
            </div>
          ) : (
            <div className="scrollbar-hidden relative overflow-x-auto overflow-y-auto">
              <div
                className="relative min-w-full rounded-[1.5rem] border border-[var(--border)] bg-[linear-gradient(0deg,rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px),radial-gradient(circle_at_top_left,rgba(62,207,142,0.08),transparent_26%)] bg-[size:32px_32px,32px_32px,auto]"
                style={{ width: canvasWidth * zoom, height: canvasHeight * zoom }}
              >
                <div className="pointer-events-none absolute right-3 top-3 z-20 flex justify-end">
                  <div className="pointer-events-auto inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-background/95 px-1.5 py-1 shadow-[0_10px_20px_rgba(0,0,0,0.12)] backdrop-blur">
                    <div className="inline-flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => adjustZoom("out")}
                        disabled={zoom <= MIN_ZOOM}
                        className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-[var(--border)] bg-[var(--surface)] text-[14px] font-semibold text-[var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-45"
                        aria-label="Zoom out"
                      >
                        -
                      </button>
                      <span className="min-w-[48px] text-center text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
                        {Math.round(zoom * 100)}%
                      </span>
                      <button
                        type="button"
                        onClick={() => adjustZoom("in")}
                        disabled={zoom >= MAX_ZOOM}
                        className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-[var(--border)] bg-[var(--surface)] text-[14px] font-semibold text-[var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-45"
                        aria-label="Zoom in"
                      >
                        +
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={() => void createNode()}
                      disabled={!clientId || isCreatingNode}
                      className="rounded-lg border border-[var(--accent-bright)] bg-[var(--accent)] px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-white shadow-[0_10px_20px_rgba(0,0,0,0.14)] transition-colors hover:bg-[var(--accent-hover)] disabled:cursor-not-allowed disabled:opacity-70"
                    >
                      {isCreatingNode ? "Creating..." : "Add Card"}
                    </button>
                    <button
                      type="button"
                      onClick={() => void saveFlow()}
                      disabled={!clientId || nodes.length === 0 || isSavingFlow}
                      className="rounded-lg border border-[var(--accent-bright)] bg-[var(--accent)] px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-white shadow-[0_10px_20px_rgba(0,0,0,0.14)] transition-colors hover:bg-[var(--accent-hover)] disabled:cursor-not-allowed disabled:opacity-70"
                    >
                      {isSavingFlow ? "Saving..." : "Save Flow"}
                    </button>
                  </div>
                </div>
                <div
                  ref={canvasRef}
                  className="relative min-h-[860px] min-w-full origin-top-left"
                  style={{ width: canvasWidth, height: canvasHeight, transform: `scale(${zoom})` }}
                >
                  <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox={`0 0 ${canvasWidth} ${canvasHeight}`}>
                    {renderedConnections.map((connection) => (
                      <path key={connection.id} d={connection.path} fill="none" stroke="rgba(62,207,142,0.68)" strokeWidth="3" strokeLinecap="round" />
                    ))}
                    {draftConnectionPath ? (
                      <path d={draftConnectionPath} fill="none" stroke="rgba(255,255,255,0.38)" strokeWidth="2" strokeDasharray="8 6" strokeLinecap="round" />
                    ) : null}
                  </svg>

                  {filteredNodes.map((node) => (
                    <article
                      key={node.id}
                      data-node-id={node.id}
                      ref={(element) => {
                        nodeRefs.current[node.id] = element;
                      }}
                      className="absolute w-[350px] overflow-visible rounded-[1.35rem] border border-[var(--border)] bg-[linear-gradient(180deg,rgba(29,29,29,0.98),rgba(18,18,18,0.98))] px-4 py-4 shadow-[0_18px_40px_rgba(0,0,0,0.24)]"
                      style={{ left: node.config.position.x, top: node.config.position.y }}
                    >

                    <div
                      className="flex cursor-grab items-start justify-between gap-3 border-b border-[var(--border)] pb-3 active:cursor-grabbing"
                      onPointerDown={(event) => {
                        setNodeDragState({
                          nodeId: node.id,
                          pointerX: event.clientX,
                          pointerY: event.clientY,
                          originX: node.config.position.x,
                          originY: node.config.position.y,
                        });
                      }}
                    >
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--accent-bright)]">
                          {node.config.buttons.length > 0 ? "Quick Reply Card" : "Text Card"}
                        </p>
                        <p className="mt-1 text-[12px] text-[var(--text-subtle)]">Drag this header to move the card</p>
                      </div>
                      <button
                        type="button"
                        onPointerDown={(event) => event.stopPropagation()}
                        onClick={() => void deleteNode(node.id)}
                        disabled={deletingNodeId === node.id}
                        className="rounded-full border border-[#5a2626] bg-[#2b1717] px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.1em] text-[#ffb4b4] transition-colors hover:bg-[#372020] disabled:cursor-not-allowed disabled:opacity-70"
                      >
                        {deletingNodeId === node.id ? "..." : "Delete"}
                      </button>
                    </div>

                    <div className="mt-4 space-y-4">
                      <input
                        type="text"
                        value={node.keywordInput}
                        onChange={(event) =>
                          updateNode(node.id, (current) => {
                            const nextKeywordInput = normalizeKeywordInput(event.target.value);
                            return {
                              ...current,
                              keywordInput: nextKeywordInput,
                              keywords: nextKeywordInput
                                .split(",")
                                .map((keyword) => keyword.trim())
                                .filter(Boolean),
                            };
                          })
                        }
                        placeholder="Trigger keywords, comma separated"
                        className="w-full rounded-xl border border-[var(--border-input)] bg-background px-4 py-3 text-[14px] text-[var(--text-primary)] placeholder:text-[var(--text-subtle)] focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/20"
                      />

                      <textarea
                        rows={5}
                        value={node.config.message}
                        onChange={(event) => updateNode(node.id, (current) => ({ ...current, config: { ...current.config, message: event.target.value } }))}
                        placeholder="Reply message"
                        className="w-full resize-none rounded-xl border border-[var(--border-input)] bg-background px-4 py-3 text-[14px] text-[var(--text-primary)] placeholder:text-[var(--text-subtle)] focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/20"
                      />

                      <input
                        type="text"
                        value={node.imageAttachmentId}
                        onChange={(event) => updateNode(node.id, (current) => ({ ...current, imageAttachmentId: event.target.value }))}
                        placeholder="Image attachment ID (optional)"
                        className="w-full rounded-xl border border-[var(--border-input)] bg-background px-4 py-3 text-[14px] text-[var(--text-primary)] placeholder:text-[var(--text-subtle)] focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/20"
                      />

                      <div className="rounded-2xl border border-[var(--border)] bg-background/80 p-3">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--accent-bright)]">Quick Replies</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              if (node.config.buttons.length >= MAX_FLOW_BUTTONS) {
                                setNotice({
                                  tone: "error",
                                  message: `Only ${MAX_FLOW_BUTTONS} buttons are allowed per message card.`,
                                });
                                return;
                              }

                              updateNode(node.id, (current) => ({
                                ...current,
                                config: {
                                  ...current.config,
                                  buttons: [...current.config.buttons, createBotFlowButton()],
                                },
                              }));
                            }}
                            disabled={node.config.buttons.length >= MAX_FLOW_BUTTONS}
                            className="rounded-lg border border-[var(--accent-bright)] bg-[var(--accent)] px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-white transition-colors hover:bg-[var(--accent-hover)] disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            Add Button
                          </button>
                        </div>

                        <div className="mt-3 space-y-2">
                          {node.config.buttons.length === 0 ? <p className="text-[13px] text-[var(--text-muted)]">No quick replies yet.</p> : null}
                          {node.config.buttons.map((button, index) => (
                            <div
                              key={button.id}
                              ref={(element) => {
                                quickReplyRefs.current[button.id] = element;
                              }}
                              className="group relative rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3"
                            >
                              <button
                                type="button"
                                onPointerDown={(event) => {
                                  event.stopPropagation();
                                  const rect = canvasRef.current?.getBoundingClientRect();
                                  if (!rect) {
                                    return;
                                  }
                                  const sourceButtonElement = quickReplyRefs.current[button.id];
                                  const sourcePoint =
                                    sourceButtonElement && canvasRef.current
                                      ? getCanvasPointFromElement(sourceButtonElement, canvasRef.current, "left", zoom)
                                      : {
                                          x: node.config.position.x,
                                          y:
                                            node.config.position.y +
                                            QUICK_REPLY_ROW_START_Y +
                                            index * QUICK_REPLY_ROW_SPACING,
                                        };

                                  setConnectionDragState({
                                    sourceNodeId: node.id,
                                    buttonId: button.id,
                                    side: "left",
                                    startX: sourcePoint.x,
                                    startY: sourcePoint.y,
                                    pointerX: (event.clientX - rect.left) / zoom,
                                    pointerY: (event.clientY - rect.top) / zoom,
                                  });
                                }}
                                className="absolute left-[-12px] top-1/2 h-5 w-5 -translate-y-1/2 rounded-full border border-[var(--accent-bright)] bg-[var(--surface-strong)] opacity-0 shadow-[0_0_0_4px_rgba(62,207,142,0.08)] transition-opacity group-hover:opacity-100"
                                title="Connect from this button"
                                aria-label={`Connect ${button.label || `button ${index + 1}`} from left side`}
                              />
                              <button
                                type="button"
                                onPointerDown={(event) => {
                                  event.stopPropagation();
                                  const rect = canvasRef.current?.getBoundingClientRect();
                                  if (!rect) {
                                    return;
                                  }
                                  const sourceButtonElement = quickReplyRefs.current[button.id];
                                  const sourcePoint =
                                    sourceButtonElement && canvasRef.current
                                      ? getCanvasPointFromElement(sourceButtonElement, canvasRef.current, "right", zoom)
                                      : {
                                          x: node.config.position.x + NODE_WIDTH,
                                          y:
                                            node.config.position.y +
                                            QUICK_REPLY_ROW_START_Y +
                                            index * QUICK_REPLY_ROW_SPACING,
                                        };

                                  setConnectionDragState({
                                    sourceNodeId: node.id,
                                    buttonId: button.id,
                                    side: "right",
                                    startX: sourcePoint.x,
                                    startY: sourcePoint.y,
                                    pointerX: (event.clientX - rect.left) / zoom,
                                    pointerY: (event.clientY - rect.top) / zoom,
                                  });
                                }}
                                className="absolute right-[-12px] top-1/2 h-5 w-5 -translate-y-1/2 rounded-full border border-[var(--accent-bright)] bg-[var(--surface-strong)] opacity-0 shadow-[0_0_0_4px_rgba(62,207,142,0.08)] transition-opacity group-hover:opacity-100"
                                title="Connect from this button"
                                aria-label={`Connect ${button.label || `button ${index + 1}`} from right side`}
                              />
                              <div className="flex items-center gap-3">
                                <input
                                  type="text"
                                  value={button.label}
                                  onChange={(event) => updateNode(node.id, (current) => ({ ...current, config: { ...current.config, buttons: current.config.buttons.map((candidate) => candidate.id === button.id ? { ...candidate, label: event.target.value } : candidate) } }))}
                                  placeholder={`Button ${index + 1}`}
                                  className="min-w-0 flex-1 bg-transparent text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-subtle)] focus:outline-none"
                                />
                                <button
                                  type="button"
                                  onClick={() => updateNode(node.id, (current) => ({ ...current, config: { ...current.config, buttons: current.config.buttons.filter((candidate) => candidate.id !== button.id) } }))}
                                  className="shrink-0 rounded-full border border-[#5a2626] px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-[#ffb4b4]"
                                >
                                  Remove
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                    </div>
                    </article>
                  ))}
                </div>
              </div>
            </div>
          )}
        </section>
      </div>
    </DashboardShell>
  );
};

export default FaqEditorPage;


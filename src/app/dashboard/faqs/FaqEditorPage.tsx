"use client";

import Image from "next/image";
import { startTransition, useCallback, useEffect, useRef, useState, type MutableRefObject } from "react";
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
  manualKeywordInput: string;
  imageAttachmentIds: string[];
  imagePreviewUrls: string[];
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
const IMAGE_PREVIEW_STORAGE_KEY = "builder-image-previews";

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

function getStoredImagePreviewMap() {
  if (typeof window === "undefined") {
    return {} as Record<string, string>;
  }

  try {
    const rawValue = window.localStorage.getItem(IMAGE_PREVIEW_STORAGE_KEY);
    if (!rawValue) {
      return {};
    }

    const parsed = JSON.parse(rawValue) as Record<string, string>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function setStoredImagePreview(imageId: string, previewUrl: string) {
  if (typeof window === "undefined" || !imageId || !previewUrl) {
    return;
  }

  const currentMap = getStoredImagePreviewMap();
  currentMap[imageId] = previewUrl;
  window.localStorage.setItem(IMAGE_PREVIEW_STORAGE_KEY, JSON.stringify(currentMap));
}

function removeStoredImagePreview(imageId: string) {
  if (typeof window === "undefined" || !imageId) {
    return;
  }

  const currentMap = getStoredImagePreviewMap();
  if (!(imageId in currentMap)) {
    return;
  }

  delete currentMap[imageId];
  window.localStorage.setItem(IMAGE_PREVIEW_STORAGE_KEY, JSON.stringify(currentMap));
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.onerror = () => reject(new Error("Unable to preview image"));
    reader.readAsDataURL(file);
  });
}

function toFlowNodeRecord(entry: FaqEntry): FlowNodeRecord {
  const initialKeywordInput = entry.keywords.join(", ");
  const parsedConfig = createDefaultBotFlowNodeConfig(
    parseBotFlowNodeConfig(entry.answer, entry.keywords[0] || "Flow Card")
  );
  const imageAttachmentIds = parsedConfig.images.length
    ? parsedConfig.images
    : entry.image_attachment_id
      ? [entry.image_attachment_id]
      : [];

  return {
    id: entry.id,
    keywords: entry.keywords,
    keywordInput: initialKeywordInput,
    manualKeywordInput: initialKeywordInput,
    imageAttachmentIds,
    imagePreviewUrls: [],
    config: {
      ...parsedConfig,
      images: imageAttachmentIds,
    },
  };
}

function toApiPayload(node: FlowNodeRecord) {
  return {
    keywords: node.keywords,
    answer: serializeBotFlowNodeConfig({
      ...node.config,
      images: node.imageAttachmentIds,
    }),
    image_attachment_id: node.imageAttachmentIds[0] ?? "",
  };
}

function clampPosition(value: number, max: number) {
  return Math.min(Math.max(value, CARD_PADDING), max);
}

function buildConnectionPath(startX: number, startY: number, endX: number, endY: number) {
  const controlOffset = Math.max(120, Math.abs(endX - startX) * 0.35);
  return `M ${startX} ${startY} C ${startX + controlOffset} ${startY}, ${endX - controlOffset} ${endY}, ${endX} ${endY}`;
}

function getDropTargetNodeId(
  pointerX: number,
  pointerY: number,
  sourceNodeId: string,
  nodeRefs: MutableRefObject<Record<string, HTMLElement | null>>
) {
  const hitPadding = 18;
  const entries = Object.entries(nodeRefs.current);

  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const [nodeId, element] = entries[index] ?? [];

    if (!nodeId || !element || nodeId === sourceNodeId) {
      continue;
    }

    const rect = element.getBoundingClientRect();
    const withinX = pointerX >= rect.left - hitPadding && pointerX <= rect.right + hitPadding;
    const withinY = pointerY >= rect.top - hitPadding && pointerY <= rect.bottom + hitPadding;

    if (withinX && withinY) {
      return nodeId;
    }
  }

  return "";
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

function normalizeButtonKeyword(value: string) {
  return normalizeKeywordInput(value).replace(/,\s*/g, " ").trim();
}

function getIncomingButtonLabelsMap(nodes: FlowNodeRecord[]) {
  const incomingButtonLabels = new Map<string, string[]>();

  for (const node of nodes) {
    for (const button of node.config.buttons) {
      const targetNodeId = button.targetNodeId.trim();
      const normalizedLabel = normalizeButtonKeyword(button.label);

      if (!targetNodeId || !normalizedLabel) {
        continue;
      }

      const existingLabels = incomingButtonLabels.get(targetNodeId) ?? [];
      if (!existingLabels.includes(normalizedLabel)) {
        existingLabels.push(normalizedLabel);
        incomingButtonLabels.set(targetNodeId, existingLabels);
      }
    }
  }

  return incomingButtonLabels;
}

function syncKeywordsFromConnections(nodes: FlowNodeRecord[]) {
  const incomingButtonLabels = getIncomingButtonLabelsMap(nodes);

  return nodes.map((node) => {
    const derivedKeywords = incomingButtonLabels.get(node.id) ?? [];

    if (derivedKeywords.length === 0) {
      const manualKeywordInput = normalizeKeywordInput(node.manualKeywordInput);
      return {
        ...node,
        keywords: manualKeywordInput
          .split(",")
          .map((keyword) => keyword.trim())
          .filter(Boolean),
        keywordInput: manualKeywordInput,
      };
    }

    return {
      ...node,
      keywords: derivedKeywords,
      keywordInput: derivedKeywords.join(", "),
    };
  });
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
      manualKeywordInput: normalizedKeywordInput,
      keywords: normalizedKeywords,
      config: {
        ...node.config,
        message: trimmedMessage,
        images: node.imageAttachmentIds,
        buttons: normalizedButtons,
      },
    },
    normalizedKeywords,
    trimmedMessage,
    normalizedButtons,
  };
}

function buildNewNodeConfig(nodeCount: number, canvasWidth: number) {
  const offset = nodeCount * 28;

  return createDefaultBotFlowNodeConfig({
    title: `Card ${nodeCount + 1}`,
    position: {
      x: clampPosition(72 + offset, canvasWidth - NODE_WIDTH - CARD_PADDING),
      y: clampPosition(72 + offset, MIN_CANVAS_HEIGHT - BASE_NODE_HEIGHT - CARD_PADDING),
    },
  });
}

function ensureNodeImages(node: FlowNodeRecord): FlowNodeRecord {
  const safeImages = Array.isArray(node.imageAttachmentIds)
    ? node.imageAttachmentIds.filter(Boolean)
    : [];
  const safePreviewUrls = Array.isArray(node.imagePreviewUrls)
    ? node.imagePreviewUrls
    : [];

  return {
    ...node,
    imageAttachmentIds: safeImages,
    imagePreviewUrls: safePreviewUrls,
    config: {
      ...node.config,
      images: safeImages,
    },
  };
}

const FaqEditorPage = () => {
  const searchParams = useSearchParams();
  const clientId = searchParams?.get("clientId") ?? "";
  const flowQuery = (searchParams?.get("q") ?? "").trim().toLowerCase();
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const nodeRefs = useRef<Record<string, HTMLElement | null>>({});
  const quickReplyRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const imageInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const nodesRef = useRef<FlowNodeRecord[]>([]);

  const [nodes, setNodes] = useState<FlowNodeRecord[]>([]);
  const [isLoadingNodes, setIsLoadingNodes] = useState(true);
  const [notice, setNotice] = useState<NoticeState | null>(null);
  const [isCreatingNode, setIsCreatingNode] = useState(false);
  const [isSavingFlow, setIsSavingFlow] = useState(false);
  const [deletingNodeId, setDeletingNodeId] = useState<string | null>(null);
  const [uploadingImageNodeId, setUploadingImageNodeId] = useState<string | null>(null);
  const [imageCarouselIndexes, setImageCarouselIndexes] = useState<Record<string, number>>({});
  const [nodeDragState, setNodeDragState] = useState<NodeDragState | null>(null);
  const [connectionDragState, setConnectionDragState] = useState<ConnectionDragState | null>(null);
  const [hoveredConnectionTargetId, setHoveredConnectionTargetId] = useState("");
  const [zoom, setZoom] = useState(1);

  useEffect(() => {
    nodesRef.current = nodes;
  }, [nodes]);

  const filteredNodes = nodes.filter((node) => {
    if (!flowQuery) {
      return true;
    }

    const haystacks = [
      node.config.title,
      node.config.message,
      ...node.imageAttachmentIds,
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
  const incomingButtonLabels = getIncomingButtonLabelsMap(nodes);

  useEffect(() => {
    if (!notice) {
      return;
    }

    const timeoutId = window.setTimeout(() => setNotice(null), 3200);
    return () => window.clearTimeout(timeoutId);
  }, [notice]);

  useEffect(() => {
    if (!connectionDragState && hoveredConnectionTargetId) {
      setHoveredConnectionTargetId("");
    }
  }, [connectionDragState, hoveredConnectionTargetId]);

  useEffect(() => {
    if (nodes.length === 0) {
      return;
    }

    const storedPreviewMap = getStoredImagePreviewMap();

    setNodes((currentNodes) =>
      currentNodes.map((node) => {
        const nextPreviewUrls = node.imageAttachmentIds.map(
          (imageId, index) => node.imagePreviewUrls[index] || storedPreviewMap[imageId] || ""
        );

        if (nextPreviewUrls.every((previewUrl, index) => previewUrl === (node.imagePreviewUrls[index] || ""))) {
          return node;
        }

        return ensureNodeImages({
          ...node,
          imagePreviewUrls: nextPreviewUrls,
        });
      })
    );
  }, [nodes.length, clientId]);

  const updateNode = (nodeId: string, updater: (node: FlowNodeRecord) => FlowNodeRecord) => {
    setNodes((currentNodes) =>
      currentNodes.map((node) =>
        node.id === nodeId ? ensureNodeImages(updater(ensureNodeImages(node))) : ensureNodeImages(node)
      )
    );
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

  const createNode = useCallback(async (options?: { quiet?: boolean; seedNodesCount?: number }) => {
    if (!clientId) {
      return;
    }

    setIsCreatingNode(true);
    const nodeCount = options?.seedNodesCount ?? nodes.length;
    const config = buildNewNodeConfig(nodeCount, canvasWidth);

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
      setNodes((currentNodes) =>
        syncKeywordsFromConnections([
          ...currentNodes,
          { id: faqId, keywords: [], keywordInput: "", manualKeywordInput: "", imageAttachmentIds: [], imagePreviewUrls: [], config },
        ])
      );
      if (!options?.quiet) {
        setNotice({ tone: "success", message: "New card created." });
      }
    } catch (error) {
      setNotice({ tone: "error", message: error instanceof Error ? error.message : "Unable to create card." });
    } finally {
      setIsCreatingNode(false);
    }
  }, [canvasWidth, clientId, nodes.length]);

  const uploadNodeImage = async (nodeId: string, file: File | null) => {
    if (!clientId || !file) {
      return;
    }

    setUploadingImageNodeId(nodeId);

    try {
      const previewDataUrl = await readFileAsDataUrl(file);
      const formData = new FormData();
      formData.append("clientId", clientId);
      formData.append("file", file);

      const response = await fetch("/api/facebook/attachments", {
        method: "POST",
        body: formData,
      });

      const result = (await response.json().catch(() => null)) as
        | { error?: string; attachmentId?: string }
        | null;

      if (!response.ok || !result?.attachmentId) {
        throw new Error(result?.error || "Unable to upload image");
      }

      setStoredImagePreview(result.attachmentId, previewDataUrl);
      updateNode(nodeId, (current) => ({
        ...current,
        imageAttachmentIds: [...current.imageAttachmentIds, result.attachmentId ?? ""].filter(Boolean),
        imagePreviewUrls: [...current.imagePreviewUrls, previewDataUrl].filter(Boolean),
        config: {
          ...current.config,
          images: [...current.imageAttachmentIds, result.attachmentId ?? ""].filter(Boolean),
        },
      }));
      setImageCarouselIndexes((current) => ({
        ...current,
        [nodeId]: Math.max(0, (nodes.find((node) => node.id === nodeId)?.imageAttachmentIds.length ?? 0)),
      }));
      setNotice({ tone: "success", message: "Image uploaded and attached to the card." });
    } catch (error) {
      setNotice({
        tone: "error",
        message: error instanceof Error ? error.message : "Unable to upload image.",
      });
    } finally {
      setUploadingImageNodeId(null);
      const input = imageInputRefs.current[nodeId];
      if (input) {
        input.value = "";
      }
    }
  };

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

        if (data.length === 0) {
          const config = buildNewNodeConfig(0, MIN_CANVAS_WIDTH);
          const response = await fetch(`/api/faqs/${encodeURIComponent(clientId)}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              keywords: [],
              answer: serializeBotFlowNodeConfig(config),
              image_attachment_id: "",
            }),
          });

          const result = (await response.json().catch(() => null)) as
            | { error?: string; faqId?: string }
            | null;

          if (!response.ok || !result?.faqId) {
            throw new Error(result?.error || "Unable to create starter card");
          }

          const faqId = result.faqId;
          startTransition(() => {
            setNodes(
              syncKeywordsFromConnections([
                { id: faqId, keywords: [], keywordInput: "", manualKeywordInput: "", imageAttachmentIds: [], imagePreviewUrls: [], config },
              ])
            );
          });
          return;
        }

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
        syncKeywordsFromConnections(
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
        )
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

        const targetNodeId = getDropTargetNodeId(
          event.clientX,
          event.clientY,
          connectionDragState.sourceNodeId,
          nodeRefs
        );

        setHoveredConnectionTargetId(targetNodeId);

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
        const draggedNode = nodesRef.current.find((node) => node.id === nodeDragState.nodeId);
        setNodeDragState(null);
        if (draggedNode) {
          await persistNode(draggedNode, { quiet: true, skipContentValidation: true });
        }
      }

      if (connectionDragState) {
        const targetNodeId = getDropTargetNodeId(
          event.clientX,
          event.clientY,
          connectionDragState.sourceNodeId,
          nodeRefs
        );

        if (targetNodeId) {
          let nextNodes: FlowNodeRecord[] = [];
          setNodes((currentNodes) => {
            nextNodes = syncKeywordsFromConnections(
              currentNodes.map((node) => {
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
              })
            );

            return nextNodes;
          });
          const updatedNode = nextNodes.find((node) => node.id === connectionDragState.sourceNodeId);
          if (updatedNode) {
            await persistNode(updatedNode, { quiet: true, skipContentValidation: true });
          }
        }

        setConnectionDragState(null);
        setHoveredConnectionTargetId("");
      }
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [nodeDragState, connectionDragState, canvasHeight, canvasWidth, zoom, persistNode]);

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
                    (() => {
                      const isKeywordLocked = (incomingButtonLabels.get(node.id) ?? []).length > 0;
                      return (
                    <article
                      key={node.id}
                      data-node-id={node.id}
                      ref={(element) => {
                        nodeRefs.current[node.id] = element;
                      }}
                      className="absolute w-[350px] overflow-visible rounded-[1.35rem] border border-[var(--border)] bg-[linear-gradient(180deg,rgba(29,29,29,0.98),rgba(18,18,18,0.98))] px-4 py-4 shadow-[0_18px_40px_rgba(0,0,0,0.24)]"
                      style={{ left: node.config.position.x, top: node.config.position.y }}
                    >
                    {connectionDragState && hoveredConnectionTargetId === node.id ? (
                      <>
                        <div className="pointer-events-none absolute left-[-18px] top-1/2 h-7 w-7 -translate-y-1/2 rounded-full border border-[var(--accent-bright)] bg-[var(--surface-strong)] shadow-[0_0_0_6px_rgba(62,207,142,0.14)]" />
                        <div className="pointer-events-none absolute right-[-18px] top-1/2 h-7 w-7 -translate-y-1/2 rounded-full border border-[var(--accent-bright)] bg-[var(--surface-strong)] shadow-[0_0_0_6px_rgba(62,207,142,0.14)]" />
                      </>
                    ) : null}

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
                        readOnly={isKeywordLocked}
                        onChange={(event) =>
                          updateNode(node.id, (current) => {
                            const nextKeywordInput = normalizeKeywordInput(event.target.value);
                            return {
                              ...current,
                              keywordInput: nextKeywordInput,
                              manualKeywordInput: nextKeywordInput,
                              keywords: nextKeywordInput
                                .split(",")
                                .map((keyword) => keyword.trim())
                                .filter(Boolean),
                            };
                          })
                        }
                        placeholder={isKeywordLocked ? "Keyword is controlled by the connected button" : "Trigger keywords, comma separated"}
                        className={`w-full rounded-xl border border-[var(--border-input)] px-4 py-3 text-[14px] text-[var(--text-primary)] placeholder:text-[var(--text-subtle)] focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/20 ${isKeywordLocked ? "bg-[rgba(255,255,255,0.03)]" : "bg-background"}`}
                      />

                      <textarea
                        rows={5}
                        value={node.config.message}
                        onChange={(event) => updateNode(node.id, (current) => ({ ...current, config: { ...current.config, message: event.target.value } }))}
                        placeholder="Reply message"
                        className="scrollbar-hidden w-full resize-none overflow-y-auto rounded-xl border border-[var(--border-input)] bg-background px-4 py-3 text-[14px] text-[var(--text-primary)] placeholder:text-[var(--text-subtle)] focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/20"
                      />

                      <input
                        type="hidden"
                        value={(node.imageAttachmentIds ?? []).join(", ")}
                        readOnly
                        aria-hidden="true"
                      />
                      <div className="rounded-2xl border border-[var(--border)] bg-background/80 p-3">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--accent-bright)]">
                              {(node.imageAttachmentIds ?? []).length === 1 ? "Image" : "Images"}
                            </p>
                          </div>
                          <input
                            ref={(element) => {
                              imageInputRefs.current[node.id] = element;
                            }}
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={(event) => {
                              const file = event.target.files?.[0] ?? null;
                              void uploadNodeImage(node.id, file);
                            }}
                          />
                          <button
                            type="button"
                            onClick={() => imageInputRefs.current[node.id]?.click()}
                            disabled={uploadingImageNodeId === node.id}
                            className="rounded-lg border border-[var(--accent-bright)] bg-[var(--accent)] px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-white transition-colors hover:bg-[var(--accent-hover)] disabled:cursor-not-allowed disabled:opacity-70"
                          >
                            {uploadingImageNodeId === node.id ? "Uploading..." : "Upload Image"}
                          </button>
                        </div>
                        {(node.imageAttachmentIds ?? []).length > 0 ? (
                          <div className="mt-3 overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)]">
                            <div className="relative aspect-[16/10] w-full overflow-hidden">
                              {node.imagePreviewUrls?.[imageCarouselIndexes[node.id] ?? 0] ? (
                                <Image
                                  src={node.imagePreviewUrls[imageCarouselIndexes[node.id] ?? 0]}
                                  alt={`Uploaded preview ${Math.min((imageCarouselIndexes[node.id] ?? 0) + 1, node.imageAttachmentIds.length)}`}
                                  fill
                                  sizes="(max-width: 768px) 100vw, 320px"
                                  className="object-cover"
                                  unoptimized
                                />
                              ) : (
                                <div className="flex h-full w-full items-center justify-center bg-[radial-gradient(circle_at_top_left,_rgba(62,207,142,0.16),_transparent_45%),linear-gradient(135deg,#1d3025_0%,#101010_100%)] px-6 text-center">
                                  <div>
                                    <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--accent-bright)]">
                                      Image {Math.min((imageCarouselIndexes[node.id] ?? 0) + 1, node.imageAttachmentIds.length)}
                                    </p>
                                    <p className="mt-2 text-[13px] text-[var(--text-muted)]">
                                      Uploaded to Messenger and ready to send.
                                    </p>
                                  </div>
                                </div>
                              )}
                              {(node.imageAttachmentIds ?? []).length > 1 ? (
                                <>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setImageCarouselIndexes((current) => ({
                                        ...current,
                                        [node.id]:
                                          ((current[node.id] ?? 0) - 1 + node.imageAttachmentIds.length) %
                                          node.imageAttachmentIds.length,
                                      }))
                                    }
                                    className="absolute left-3 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-[var(--border)] bg-black/55 text-[var(--text-primary)]"
                                    aria-label="Previous image"
                                  >
                                    {"<"}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setImageCarouselIndexes((current) => ({
                                        ...current,
                                        [node.id]: ((current[node.id] ?? 0) + 1) % node.imageAttachmentIds.length,
                                      }))
                                    }
                                    className="absolute right-3 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-[var(--border)] bg-black/55 text-[var(--text-primary)]"
                                    aria-label="Next image"
                                  >
                                    {">"}
                                  </button>
                                </>
                              ) : null}
                            </div>
                            <div className="flex items-center justify-between gap-3 border-t border-[var(--border)] px-3 py-2">
                              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">
                                {Math.min((imageCarouselIndexes[node.id] ?? 0) + 1, node.imageAttachmentIds.length)} / {node.imageAttachmentIds.length}
                              </p>
                              <div className="flex items-center gap-2">
                                <div className="flex items-center gap-1.5">
                                  {node.imageAttachmentIds.map((_, imageIndex) => (
                                    <button
                                      key={`${node.id}-dot-${imageIndex}`}
                                      type="button"
                                      onClick={() =>
                                        setImageCarouselIndexes((current) => ({
                                          ...current,
                                          [node.id]: imageIndex,
                                        }))
                                      }
                                      className={`h-2.5 w-2.5 rounded-full ${imageIndex === (imageCarouselIndexes[node.id] ?? 0) ? "bg-[var(--accent-bright)]" : "bg-[var(--border)]"}`}
                                      aria-label={`Show image ${imageIndex + 1}`}
                                    />
                                  ))}
                                </div>
                                <button
                                  type="button"
                                  onClick={() =>
                                    updateNode(node.id, (current) => {
                                      const activeIndex = Math.min(
                                        imageCarouselIndexes[node.id] ?? 0,
                                        Math.max(current.imageAttachmentIds.length - 1, 0)
                                      );
                                      const nextImages = current.imageAttachmentIds.filter(
                                        (_, currentIndex) => currentIndex !== activeIndex
                                      );
                                      const nextPreviewUrls = current.imagePreviewUrls.filter(
                                        (_, currentIndex) => currentIndex !== activeIndex
                                      );
                                      const removedImageId = current.imageAttachmentIds[activeIndex] ?? "";

                                      if (removedImageId) {
                                        removeStoredImagePreview(removedImageId);
                                      }

                                      setImageCarouselIndexes((indexes) => ({
                                        ...indexes,
                                        [node.id]: Math.max(0, Math.min(activeIndex, nextImages.length - 1)),
                                      }));

                                      return {
                                        ...current,
                                        imageAttachmentIds: nextImages,
                                        imagePreviewUrls: nextPreviewUrls,
                                        config: {
                                          ...current.config,
                                          images: nextImages,
                                        },
                                      };
                                    })
                                  }
                                  className="rounded-full border border-[#5a2626] px-3 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-[#ffb4b4]"
                                >
                                  Remove
                                </button>
                              </div>
                            </div>
                          </div>
                        ) : (
                          <p className="mt-3 text-[13px] text-[var(--text-muted)]">No images yet.</p>
                        )}
                      </div>

                      <div className="rounded-2xl border border-[var(--border)] bg-background/80 p-3">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--accent-bright)]">
                              {node.config.buttons.length === 1 ? "Button" : "Buttons"}
                            </p>
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
                          {node.config.buttons.length === 0 ? <p className="text-[13px] text-[var(--text-muted)]">No buttons yet.</p> : null}
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
                                  onChange={(event) =>
                                    setNodes((currentNodes) =>
                                      syncKeywordsFromConnections(
                                        currentNodes.map((currentNode) =>
                                          currentNode.id === node.id
                                            ? {
                                                ...currentNode,
                                                config: {
                                                  ...currentNode.config,
                                                  buttons: currentNode.config.buttons.map((candidate) =>
                                                    candidate.id === button.id
                                                      ? { ...candidate, label: event.target.value }
                                                      : candidate
                                                  ),
                                                },
                                              }
                                            : currentNode
                                        )
                                      )
                                    )
                                  }
                                  placeholder={`Button ${index + 1}`}
                                  className="min-w-0 flex-1 bg-transparent text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-subtle)] focus:outline-none"
                                />
                                <div className="flex shrink-0 items-center gap-2">
                                  {button.targetNodeId ? (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setNodes((currentNodes) =>
                                          syncKeywordsFromConnections(
                                            currentNodes.map((currentNode) =>
                                              currentNode.id === node.id
                                                ? {
                                                    ...currentNode,
                                                    config: {
                                                      ...currentNode.config,
                                                      buttons: currentNode.config.buttons.map((candidate) =>
                                                        candidate.id === button.id
                                                          ? { ...candidate, targetNodeId: "" }
                                                          : candidate
                                                      ),
                                                    },
                                                  }
                                                : currentNode
                                            )
                                          )
                                        )
                                      }
                                      className="rounded-full border border-[var(--border)] px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--text-subtle)]"
                                    >
                                      Unlink
                                    </button>
                                  ) : null}
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setNodes((currentNodes) =>
                                        syncKeywordsFromConnections(
                                          currentNodes.map((currentNode) =>
                                            currentNode.id === node.id
                                              ? {
                                                  ...currentNode,
                                                  config: {
                                                    ...currentNode.config,
                                                    buttons: currentNode.config.buttons.filter(
                                                      (candidate) => candidate.id !== button.id
                                                    ),
                                                  },
                                                }
                                              : currentNode
                                          )
                                        )
                                      )
                                    }
                                    className="rounded-full border border-[#5a2626] px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-[#ffb4b4]"
                                  >
                                    Remove
                                  </button>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                    </div>
                    </article>
                      );
                    })()
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



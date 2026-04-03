export const BOT_FLOW_VERSION = 1;

export type BotFlowButton = {
  id: string;
  label: string;
  targetNodeId: string;
};

export type BotFlowNodeConfig = {
  version: number;
  title: string;
  message: string;
  buttons: BotFlowButton[];
  position: {
    x: number;
    y: number;
  };
};

type ParsedButton = Partial<BotFlowButton> | null | undefined;
type ParsedNode = Partial<BotFlowNodeConfig> | null | undefined;
type ParsedValue = ParsedNode | string;

const DEFAULT_POSITION = {
  x: 80,
  y: 80,
};

export function createDefaultBotFlowNodeConfig(seed?: Partial<BotFlowNodeConfig>): BotFlowNodeConfig {
  return {
    version: BOT_FLOW_VERSION,
    title: seed?.title?.trim() || "Untitled Card",
    message: seed?.message?.trim() || "",
    buttons: normalizeButtons(seed?.buttons ?? []),
    position: {
      x: Number.isFinite(seed?.position?.x) ? Number(seed?.position?.x) : DEFAULT_POSITION.x,
      y: Number.isFinite(seed?.position?.y) ? Number(seed?.position?.y) : DEFAULT_POSITION.y,
    },
  };
}

export function parseBotFlowNodeConfig(value: string, fallbackTitle?: string): BotFlowNodeConfig {
  if (!value.trim()) {
    return createDefaultBotFlowNodeConfig({ title: fallbackTitle, message: "" });
  }

  try {
    const parsed = parsePossiblyNestedJson(value) as ParsedValue;

    if (typeof parsed === "string") {
      return createDefaultBotFlowNodeConfig({
        title: fallbackTitle,
        message: parsed,
      });
    }

    return createDefaultBotFlowNodeConfig({
      title: parsed?.title || fallbackTitle,
      message: typeof parsed?.message === "string" ? parsed.message : value,
      buttons: Array.isArray(parsed?.buttons) ? parsed.buttons : [],
      position:
        parsed?.position && typeof parsed.position === "object"
          ? {
              x: Number(parsed.position.x),
              y: Number(parsed.position.y),
            }
          : undefined,
    });
  } catch {
    return createDefaultBotFlowNodeConfig({
      title: fallbackTitle,
      message: value,
    });
  }
}

function parsePossiblyNestedJson(value: string): ParsedValue {
  let current: unknown = value;

  for (let depth = 0; depth < 3; depth += 1) {
    if (typeof current !== "string") {
      break;
    }

    const trimmed = current.trim();

    if (!trimmed) {
      return "";
    }

    if (!trimmed.startsWith("{") && !trimmed.startsWith('"')) {
      return trimmed;
    }

    current = JSON.parse(trimmed) as unknown;
  }

  return current as ParsedValue;
}

export function serializeBotFlowNodeConfig(config: BotFlowNodeConfig) {
  return JSON.stringify(createDefaultBotFlowNodeConfig(config));
}

export function createBotFlowButton(seed?: Partial<BotFlowButton>): BotFlowButton {
  return {
    id: seed?.id?.trim() || `button_${Math.random().toString(36).slice(2, 10)}`,
    label: seed?.label?.trim() || "New Button",
    targetNodeId: seed?.targetNodeId?.trim() || "",
  };
}

export function normalizeButtons(buttons: ParsedButton[]) {
  return buttons
    .map((button) => createBotFlowButton(button ?? undefined))
    .filter((button) => button.label);
}



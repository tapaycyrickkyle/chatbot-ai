import "server-only";

import {
  cleanupAiMessageJobs,
  cleanupProcessedMessengerMessages,
} from "@/lib/database";
import { supabaseAdmin } from "@/lib/supabase";

const RATE_LIMIT_LOG_RETENTION_DAYS = 7;
const AI_MESSAGE_JOB_RETENTION_DAYS = 1;
const AI_CONVERSATION_RETENTION_DAYS = 7;
const PROCESSED_MESSENGER_MESSAGE_RETENTION_DAYS = 7;

type CleanupResult = {
  deletedRateLimitLogs: number;
  deletedAiMessageJobs: number;
  deletedAiConversations: number;
  deletedProcessedMessengerMessages: number;
  logRetentionDays: number;
  aiMessageJobRetentionDays: number;
  aiConversationRetentionDays: number;
  processedMessengerMessageRetentionDays: number;
  warnings: string[];
};

type CleanupTargetResult = {
  deletedRows: number;
  warning?: string;
};

function formatCleanupWarning(table: string, action: "count" | "delete", message?: string) {
  const reason = message ? `: ${message}` : "";

  return `Skipped ${table}; failed to ${action} old rows${reason}`;
}

async function countRowsOlderThan(table: string, column: string, cutoffIso: string) {
  const { count, error } = await supabaseAdmin
    .from(table)
    .select("*", { count: "exact", head: true })
    .lt(column, cutoffIso);

  if (error) {
    return {
      count: 0,
      warning: formatCleanupWarning(table, "count", error.message),
    };
  }

  return { count: count ?? 0 };
}

async function deleteRowsOlderThan(table: string, column: string, cutoffIso: string) {
  const { error } = await supabaseAdmin.from(table).delete().lt(column, cutoffIso);

  if (error) {
    return formatCleanupWarning(table, "delete", error.message);
  }

  return undefined;
}

async function cleanupRowsOlderThan(
  table: string,
  column: string,
  cutoffIso: string
): Promise<CleanupTargetResult> {
  const countResult = await countRowsOlderThan(table, column, cutoffIso);

  if (countResult.warning) {
    return {
      deletedRows: 0,
      warning: countResult.warning,
    };
  }

  const deleteWarning = await deleteRowsOlderThan(table, column, cutoffIso);

  if (deleteWarning) {
    return {
      deletedRows: 0,
      warning: deleteWarning,
    };
  }

  return { deletedRows: countResult.count };
}

export async function cleanupOldStorageData(): Promise<CleanupResult> {
  const now = Date.now();
  const rateLimitCutoffIso = new Date(
    now - RATE_LIMIT_LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000
  ).toISOString();
  const aiConversationCutoffIso = new Date(
    now - AI_CONVERSATION_RETENTION_DAYS * 24 * 60 * 60 * 1000
  ).toISOString();
  const processedMessengerMessageCutoffIso = new Date(
    now - PROCESSED_MESSENGER_MESSAGE_RETENTION_DAYS * 24 * 60 * 60 * 1000
  ).toISOString();
  const rateLimitLogsResult = await cleanupRowsOlderThan(
    "rate_limit_logs",
    "created_at",
    rateLimitCutoffIso
  );
  const aiMessageJobsResult: CleanupTargetResult = await cleanupAiMessageJobs()
    .then((deletedRows) => ({ deletedRows }))
    .catch((error) => ({
      deletedRows: 0,
      warning: formatCleanupWarning(
        "ai_message_jobs",
        "delete",
        error instanceof Error ? error.message : String(error)
      ),
    }));
  const aiConversationsResult = await cleanupRowsOlderThan(
    "ai_conversations",
    "last_message_at",
    aiConversationCutoffIso
  );
  const processedMessengerMessagesResult: CleanupTargetResult =
    await cleanupProcessedMessengerMessages(processedMessengerMessageCutoffIso)
      .then((deletedRows) => ({ deletedRows }))
      .catch((error) => ({
        deletedRows: 0,
        warning: formatCleanupWarning(
          "processed_messenger_messages",
          "delete",
          error instanceof Error ? error.message : String(error)
        ),
      }));
  const warnings = [
    rateLimitLogsResult.warning,
    aiMessageJobsResult.warning,
    aiConversationsResult.warning,
    processedMessengerMessagesResult.warning,
  ].filter(
    (warning): warning is string => Boolean(warning)
  );

  return {
    deletedRateLimitLogs: rateLimitLogsResult.deletedRows,
    deletedAiMessageJobs: aiMessageJobsResult.deletedRows,
    deletedAiConversations: aiConversationsResult.deletedRows,
    deletedProcessedMessengerMessages: processedMessengerMessagesResult.deletedRows,
    logRetentionDays: RATE_LIMIT_LOG_RETENTION_DAYS,
    aiMessageJobRetentionDays: AI_MESSAGE_JOB_RETENTION_DAYS,
    aiConversationRetentionDays: AI_CONVERSATION_RETENTION_DAYS,
    processedMessengerMessageRetentionDays: PROCESSED_MESSENGER_MESSAGE_RETENTION_DAYS,
    warnings,
  };
}

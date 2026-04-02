import "server-only";
import { JWT } from "google-auth-library";
import { GoogleSpreadsheet } from "google-spreadsheet";

// --- Helper to get the spreadsheet document ---
async function getDoc() {
  const auth = new JWT({
    email: process.env.GOOGLE_SHEETS_CLIENT_EMAIL!,
    key: process.env.GOOGLE_SHEETS_PRIVATE_KEY!.replace(/\\n/g, "\n"),
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });

  const doc = new GoogleSpreadsheet(process.env.GOOGLE_SHEETS_SHEET_ID!, auth);
  await doc.loadInfo();
  return doc;
}

// --- Get a specific sheet by title ---
export async function getSheet(sheetTitle: string) {
  const doc = await getDoc();
  return doc.sheetsByTitle[sheetTitle];
}

// --- Client operations ---
export async function getClients() {
  const sheet = await getSheet("clients");
  const rows = await sheet.getRows();

  return rows.map((row) => ({
    id: row.get("id"),
    client_name: row.get("client_name"),
    page_id: row.get("page_id"),
    page_access_token: row.get("page_access_token"),
    created_at: row.get("created_at"),
  }));
}

export async function addClient(clientData: {
  client_name: string;
  page_id: string;
  page_access_token: string;
}) {
  const sheet = await getSheet("clients");
  const rows = await sheet.getRows();
  const newId = (rows.length + 1).toString();

  await sheet.addRow({
    id: newId,
    client_name: clientData.client_name,
    page_id: clientData.page_id,
    page_access_token: clientData.page_access_token,
    created_at: new Date().toISOString(),
  });

  return newId;
}

// --- FAQ operations ---
export async function getFaqsForClient(clientId: string) {
  const sheet = await getSheet("faqs");
  const rows = await sheet.getRows();

  return rows
    .filter((row) => row.get("client_id") === clientId)
    .map((row) => ({
      id: row.get("id"),
      keywords: row
        .get("keywords")
        .split(",")
        .map((keyword: string) => keyword.trim()),
      answer: row.get("answer"),
      image_attachment_id: row.get("image_attachment_id"),
    }));
}

export async function getFaqById(faqId: string) {
  const sheet = await getSheet("faqs");
  const rows = await sheet.getRows();
  const row = rows.find((currentRow) => currentRow.get("id") === faqId);

  if (!row) {
    return null;
  }

  return {
    id: row.get("id"),
    client_id: row.get("client_id"),
    keywords: row
      .get("keywords")
      .split(",")
      .map((keyword: string) => keyword.trim()),
    answer: row.get("answer"),
    image_attachment_id: row.get("image_attachment_id"),
  };
}

export async function addFaq(
  clientId: string,
  keywords: string[],
  answer: string,
  image_attachment_id?: string
) {
  const sheet = await getSheet("faqs");
  const rows = await sheet.getRows();
  const newId = (rows.length + 1).toString();

  await sheet.addRow({
    id: newId,
    client_id: clientId,
    keywords: keywords.join(","),
    answer,
    image_attachment_id: image_attachment_id || "",
  });
}

export async function updateFaq(
  faqId: string,
  data: Partial<{
    keywords: string[];
    answer: string;
    image_attachment_id: string;
  }>
) {
  const sheet = await getSheet("faqs");
  const rows = await sheet.getRows();
  const row = rows.find((currentRow) => currentRow.get("id") === faqId);

  if (!row) {
    throw new Error("FAQ not found");
  }

  if (data.keywords) {
    row.set("keywords", data.keywords.join(","));
  }

  if (data.answer) {
    row.set("answer", data.answer);
  }

  if (data.image_attachment_id !== undefined) {
    row.set("image_attachment_id", data.image_attachment_id);
  }

  await row.save();
}

export async function deleteFaq(faqId: string) {
  const sheet = await getSheet("faqs");
  const rows = await sheet.getRows();
  const row = rows.find((currentRow) => currentRow.get("id") === faqId);

  if (row) {
    await row.delete();
  }
}

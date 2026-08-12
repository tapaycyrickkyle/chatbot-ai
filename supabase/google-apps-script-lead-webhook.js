/* eslint-disable @typescript-eslint/no-unused-vars */
/** Deploy as a Google Apps Script Web App with access set to "Anyone". */
function doPost(event) {
  const payload = JSON.parse(event.postData.contents || "{}");
  if (!payload.leadId || !payload.sheetTab || !payload.fields) {
    return json({ ok: false, error: "Invalid lead payload" });
  }
  const sheet = SpreadsheetApp.getActive().getSheetByName(payload.sheetTab);
  if (!sheet) return json({ ok: false, error: "Sheet tab not found" });
  const standardHeaders = ["Lead ID", "Captured At", "Page ID", "Messenger Customer ID"];
  const requestedHeaders = standardHeaders.concat(Object.keys(payload.fields));
  const currentHeaders = sheet.getLastColumn() > 0
    ? sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(String)
    : [];
  const headers = currentHeaders.length ? currentHeaders : requestedHeaders;

  requestedHeaders.forEach((header) => {
    if (!headers.includes(header)) headers.push(header);
  });
  if (headers.length !== currentHeaders.length || !currentHeaders.length) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  }

  const leadIdColumn = headers.indexOf("Lead ID") + 1;
  if (sheet.getLastRow() > 1 && sheet.getRange(2, leadIdColumn, sheet.getLastRow() - 1, 1).getValues().flat().includes(payload.leadId)) {
    return json({ ok: true, duplicate: true });
  }
  const row = headers.map((header) => {
    if (header === "Lead ID") return payload.leadId;
    if (header === "Captured At") return payload.capturedAt;
    if (header === "Page ID") return payload.pageId;
    if (header === "Messenger Customer ID") return payload.recipientId;
    return payload.fields[header] || "";
  });
  sheet.appendRow(row);
  return json({ ok: true });
}
function json(value) { return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON); }

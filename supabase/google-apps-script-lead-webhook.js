/* eslint-disable @typescript-eslint/no-unused-vars */
/** Deploy as a Google Apps Script Web App with access set to "Anyone". */
function doPost(event) {
  const payload = JSON.parse(event.postData.contents || "{}");
  if (!payload.leadId || !payload.sheetTab || !payload.fields) {
    return json({ ok: false, error: "Invalid lead payload" });
  }
  const sheet = SpreadsheetApp.getActive().getSheetByName(payload.sheetTab);
  if (!sheet) return json({ ok: false, error: "Sheet tab not found" });
  const fieldTypes = payload.fieldTypes && typeof payload.fieldTypes === "object"
    ? payload.fieldTypes
    : {};
  const requestedHeaders = Object.keys(payload.fields);
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

  const deliveredLeads = PropertiesService.getScriptProperties();
  if (deliveredLeads.getProperty(`lead:${payload.leadId}`)) {
    return json({ ok: true, duplicate: true });
  }
  const row = headers.map((header) => {
    return Object.prototype.hasOwnProperty.call(payload.fields, header)
      ? String(payload.fields[header])
      : "";
  });
  const nextRow = sheet.getLastRow() + 1;
  headers.forEach((header, columnIndex) => {
    if (fieldTypes[header] === "phone") {
      sheet.getRange(nextRow, columnIndex + 1).setNumberFormat("@");
    }
  });
  sheet.getRange(nextRow, 1, 1, headers.length).setValues([row]);
  deliveredLeads.setProperty(`lead:${payload.leadId}`, new Date().toISOString());
  return json({ ok: true });
}
function json(value) { return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON); }

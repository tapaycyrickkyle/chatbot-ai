/* eslint-disable @typescript-eslint/no-unused-vars */
/** Deploy as a Google Apps Script Web App with access set to "Anyone". */
function doPost(event) {
  const DATE_SENT_HEADER = "Date Sent";
  const FIRST_LEAD_ROW = 2;
  const LEAD_TABLE_COLUMN_COUNT = 10; // Lead Tracker columns A:J only.
  const payload = JSON.parse(event.postData.contents || "{}");
  if (!payload.leadId || !payload.sheetTab || !payload.fields) {
    return json({ ok: false, error: "Invalid lead payload" });
  }
  const sheet = SpreadsheetApp.getActive().getSheetByName(payload.sheetTab);
  if (!sheet) return json({ ok: false, error: "Sheet tab not found" });
  const fieldTypes = payload.fieldTypes && typeof payload.fieldTypes === "object"
    ? payload.fieldTypes
    : {};
  const requestedHeaders = Object.keys(payload.fields).filter((header) => header !== DATE_SENT_HEADER);
  const headers = sheet
    .getRange(1, 1, 1, LEAD_TABLE_COLUMN_COUNT)
    .getValues()[0]
    .map((header) => String(header).trim());
  const dateSentColumn = headers.indexOf(DATE_SENT_HEADER) + 1;
  const unsupportedHeaders = requestedHeaders.filter((header) => !headers.includes(header));

  if (!dateSentColumn) {
    return json({ ok: false, error: `Missing ${DATE_SENT_HEADER} header in Lead Tracker!A1:J1` });
  }
  if (unsupportedHeaders.length > 0) {
    return json({
      ok: false,
      error: `Lead fields must match Lead Tracker!A1:J1: ${unsupportedHeaders.join(", ")}`,
    });
  }

  const deliveredLeads = PropertiesService.getScriptProperties();
  if (deliveredLeads.getProperty(`lead:${payload.leadId}`)) {
    return json({ ok: true, duplicate: true });
  }
  const sentDate = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "MMMM d, yyyy");
  const row = headers.map((header) => {
    if (header === DATE_SENT_HEADER) return sentDate;
    return Object.prototype.hasOwnProperty.call(payload.fields, header)
      ? String(payload.fields[header])
      : "";
  });
  const nextRow = findFirstAvailableLeadRow(sheet, dateSentColumn, FIRST_LEAD_ROW);
  if (!nextRow) {
    return json({ ok: false, error: "Lead Tracker!A2:A1000 is full" });
  }
  headers.forEach((header, columnIndex) => {
    if (header !== DATE_SENT_HEADER && !Object.prototype.hasOwnProperty.call(payload.fields, header)) {
      return;
    }

    const cell = sheet.getRange(nextRow, columnIndex + 1);
    if (fieldTypes[header] === "phone") {
      cell.setNumberFormat("@");
    }
    cell.setValue(row[columnIndex]);
  });
  deliveredLeads.setProperty(`lead:${payload.leadId}`, new Date().toISOString());
  return json({ ok: true });
}

function findFirstAvailableLeadRow(sheet, dateSentColumn, firstLeadRow) {
  const rowCount = sheet.getMaxRows() - firstLeadRow + 1;
  const dates = sheet
    .getRange(firstLeadRow, dateSentColumn, rowCount, 1)
    .getDisplayValues();
  const firstEmptyRowIndex = dates.findIndex(([dateSent]) => !String(dateSent).trim());

  return firstEmptyRowIndex >= 0
    ? firstLeadRow + firstEmptyRowIndex
    : 0;
}

function json(value) { return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON); }

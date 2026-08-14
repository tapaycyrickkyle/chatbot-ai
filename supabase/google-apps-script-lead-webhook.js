/* eslint-disable @typescript-eslint/no-unused-vars */
/** Deploy as a Google Apps Script Web App with access set to "Anyone". */
function doPost(event) {
  const DATE_SENT_HEADER = "Date Sent";
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
  let currentHeaders = sheet.getLastColumn() > 0
    ? sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(String)
    : [];
  let headersChanged = !currentHeaders.length;
  if (currentHeaders.length && !currentHeaders.includes(DATE_SENT_HEADER)) {
    sheet.insertColumnBefore(1);
    currentHeaders = [DATE_SENT_HEADER, ...currentHeaders];
    headersChanged = true;
  }
  const headers = currentHeaders.length ? [...currentHeaders] : [DATE_SENT_HEADER, ...requestedHeaders];

  requestedHeaders.forEach((header) => {
    if (!headers.includes(header)) {
      headers.push(header);
      headersChanged = true;
    }
  });
  if (headersChanged) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
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
  const dateSentColumn = headers.indexOf(DATE_SENT_HEADER) + 1;
  const nextRow = findFirstAvailableLeadRow(sheet, dateSentColumn);
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

function findFirstAvailableLeadRow(sheet, dateSentColumn) {
  const firstLeadRow = 2;
  const lastUsedRow = sheet.getLastRow();

  if (lastUsedRow < firstLeadRow) {
    return firstLeadRow;
  }

  const rowCount = lastUsedRow - firstLeadRow + 1;
  const dates = sheet
    .getRange(firstLeadRow, dateSentColumn, rowCount, 1)
    .getDisplayValues();
  const firstEmptyRowIndex = dates.findIndex(([dateSent]) => !String(dateSent).trim());

  return firstEmptyRowIndex >= 0
    ? firstLeadRow + firstEmptyRowIndex
    : lastUsedRow + 1;
}

function json(value) { return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON); }

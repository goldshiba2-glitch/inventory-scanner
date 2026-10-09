function render() {
  app = document.getElementById("app");

  if (!app) return;

  var months = [
    "January", "February", "March", "April",
    "May", "June", "July", "August",
    "September", "October", "November", "December"
  ];

  var monthOptions = months.map(function (month) {
    return '<option value="' + month + '"' +
      (month === selectedMonth ? " selected" : "") +
      ">" + month + "</option>";
  }).join("");

  var categoryOptions = publicationCategories.map(function (item) {
    return '<option value="' + escapeHtml(item.value) + '">' +
      escapeHtml(item.label) + "</option>";
  }).join("");

  // Custom publication codes
  var customRows = Object.keys(customPublications)
    .sort()
    .map(function (code) {
      var record = customPublications[code];

      return "<tr><td>" + escapeHtml(code) +
        "</td><td>" +
        escapeHtml(categoryLabel(record.category)) +
        '</td><td><button type="button" class="inv-btn danger" data-delete-code="' +
        escapeHtml(code) +
        '">Delete</button></td></tr>';
    }).join("");

  if (!customRows) {
    customRows =
      '<tr><td colspan="3" class="inv-muted">' +
      "No custom publication codes registered yet." +
      "</td></tr>";
  }

  // Active inventory totals
  var keys = Object.keys(inventory).filter(function (key) {
    var separator = key.indexOf(":");
    var code = separator >= 0
      ? key.slice(separator + 1)
      : key;

    return isCodeActive(code);
  }).sort();

  var inventoryRows = keys.map(function (key) {
    var separator = key.indexOf(":");
    var language = separator >= 0
      ? key.slice(0, separator)
      : "";

    var code = separator >= 0
      ? key.slice(separator + 1)
      : key;

    return "<tr><td>" + escapeHtml(code) +
      "</td><td>" + escapeHtml(getCategory(code)) +
      "</td><td>" + escapeHtml(language) +
      "</td><td>" + escapeHtml(inventory[key]) +
      '</td><td><button type="button" class="inv-btn danger" data-delete="' +
      escapeHtml(key) +
      '">Delete</button></td></tr>';
  }).join("");

  // Preserve inventory history, including deleted publications
  var historyRows = history.map(function (item, index) {
    var deleted = isDeletedCode(item.code);

    return '<div' +
      (deleted ? ' style="color:#667085"' : "") +
      ">" +
      (index + 1) + ". " +
      escapeHtml(item.code) + " - " +
      escapeHtml(item.language) + " — " +
      escapeHtml(item.quantity) +
      (deleted ? " (deleted publication; history kept)" : "") +
      "</div>";
  }).join("");

  var total = keys.reduce(function (sum, key) {
    return sum + (Number(inventory[key]) || 0);
  }, 0);

  // Display order:
  // 1. Scan Publication
  // 2. Paste Checklist
  // 3. Manage Publication Codes
  // 4. History
  // 5. Monthly Reporting

  app.innerHTML = [

    // 1. SCAN PUBLICATION
    '<section class="inv-card">' +
      '<h1 class="inv-title">Inventory Scanner</h1>' +
      '<p class="inv-muted">' +
        "Capture or upload a photo of publication boxes. " +
        "The scanner looks for registered publication codes." +
      "</p>" +
    "</section>",

    '<section class="inv-card">' +
      "<h2>1. Scan Publication</h2>" +

      '<p class="inv-muted">' +
        "Choose the language printed on the boxes. " +
        "Review detected codes and adjust quantities before adding them." +
      "</p>" +

      '<div class="inv-controls">' +
        '<label for="scan-language">Language:</label>' +
        '<select id="scan-language">' +
          '<option value="TG">TG — Tagalog</option>' +
          '<option value="E">E — English</option>' +
        "</select>" +

        '<label for="photo">Capture or upload photo:</label>' +
        '<input id="photo" type="file" accept="image/*" capture="environment">' +

        '<button type="button" class="inv-btn" id="read">' +
          "Scan Photo" +
        "</button>" +
      "</div>" +

      '<img id="preview" alt="Selected photo preview">' +

      '<div id="status" aria-live="polite">' +
        "Ready. Take a clear photo with publication codes facing the camera." +
      "</div>" +

      '<div id="scan-results"></div>' +
    "</section>",

    // 2. PASTE A CHECKLIST
    '<section class="inv-card">' +
      "<h2>2. Paste a Checklist</h2>" +

      '<p class="inv-muted">' +
        "Paste multiple inventory lines. Use one line per publication. " +
        "Math expressions using + are calculated automatically." +
      "</p>" +

      '<textarea id="bulk-notepad" placeholder="' +
        "Example:\\nnwt - TG - 1500 + 375 + 2125\\n" +
        "bhs - E - 25 + 10\\n" +
        'S-4 - TG - 5"></textarea>' +

      '<div class="inv-controls">' +
        '<button type="button" class="inv-btn" id="add-bulk">' +
          "Process List" +
        "</button>" +

        '<button type="button" class="inv-btn secondary" id="clear-text">' +
          "Clear Text" +
        "</button>" +
      "</div>" +
    "</section>",

    // 3. MANAGE PUBLICATION CODES
    '<section class="inv-card">' +
      "<h2>3. Manage Publication Codes</h2>" +

      '<p class="inv-muted">' +
        "Add new books, magazines, tracts, or other publications. " +
        "Delete a custom code when it is no longer required." +
      "</p>" +

      '<form id="publication-form">' +
        '<div class="publication-fields">' +

          '<label for="new-code">' +
            "Publication Code" +
            '<input id="new-code" type="text" maxlength="40" ' +
              'placeholder="e.g. newbook1" autocomplete="off" required>' +
          "</label>" +

          '<label for="new-category">' +
            "Category" +
            '<select id="new-category">' +
              categoryOptions +
            "</select>" +
          "</label>" +

          '<button type="submit" class="inv-btn">' +
            "Add / Update Code" +
          "</button>" +

        "</div>" +
      "</form>" +

      '<div class="inv-table-wrap">' +
        "<table>" +
          "<thead>" +
            "<tr>" +
              "<th>Custom Code</th>" +
              "<th>Category</th>" +
              "<th>Action</th>" +
            "</tr>" +
          "</thead>" +
          "<tbody>" + customRows + "</tbody>" +
        "</table>" +
      "</div>" +

      '<p class="inv-muted">' +
        "To make code changes permanent for everyone, download the updated " +
        "template and replace September-Inventory.xlsx in your GitHub repository." +
      "</p>" +

      '<div class="inv-controls">' +
        '<button type="button" class="inv-btn success" id="download-template">' +
          "Download Updated Template" +
        "</button>" +
      "</div>" +
    "</section>",

    // 4. HISTORY
    '<section class="inv-card">' +
      "<h2>4. History</h2>" +
      '<div class="inv-history">' +
        (historyRows ||
          '<div class="inv-muted">No history yet.</div>') +
      "</div>" +
    "</section>",

    // 5. MONTHLY REPORTING — LAST SECTION
    '<section class="inv-card">' +
      "<h2>5. Monthly Reporting</h2>" +

      '<div class="inv-controls">' +
        '<label for="report-month">Reporting Month:</label>' +
        '<select id="report-month">' +
          monthOptions +
        "</select>" +

        '<button type="button" class="inv-btn" id="export">' +
          "Download Excel" +
        "</button>" +

        '<button type="button" class="inv-btn danger" id="clear">' +
          "Clear Entries" +
        "</button>" +
      "</div>" +

      "<p><strong>Running Total:</strong> " +
        total.toLocaleString() +
      "</p>" +

      '<div class="inv-table-wrap">' +
        "<table>" +
          "<thead>" +
            "<tr>" +
              "<th>Code</th>" +
              "<th>Category</th>" +
              "<th>Language</th>" +
              "<th>Total</th>" +
              "<th>Action</th>" +
            "</tr>" +
          "</thead>" +

          "<tbody>" +
            (inventoryRows ||
              '<tr><td colspan="5">' +
              "No active inventory entries yet." +
              "</td></tr>") +
          "</tbody>" +
        "</table>" +
      "</div>" +
    "</section>"

  ].join("");

  // Checklist buttons
  document.getElementById("add-bulk").addEventListener(
    "click",
    processBulkInput
  );

  document.getElementById("clear-text").addEventListener(
    "click",
    function () {
      document.getElementById("bulk-notepad").value = "";
      setStatus("Checklist text cleared.");
    }
  );

  // Publication manager
  document.getElementById("publication-form").addEventListener(
    "submit",
    addPublicationCode
  );

  document.getElementById("download-template").addEventListener(
    "click",
    downloadUpdatedTemplate
  );

  Array.prototype.forEach.call(
    app.querySelectorAll("[data-delete-code]"),
    function (button) {
      button.addEventListener("click", function () {
        deletePublicationCode(
          button.getAttribute("data-delete-code")
        );
      });
    }
  );

  // Photo scanning
  document.getElementById("read").addEventListener(
    "click",
    readPhoto
  );

  // Excel reporting
  document.getElementById("export").addEventListener(
    "click",
    exportExcel
  );

  document.getElementById("clear").addEventListener(
    "click",
    clearAll
  );

  document.getElementById("report-month").addEventListener(
    "change",
    function (event) {
      selectedMonth = event.target.value;
    }
  );

  // Delete individual inventory entries
  Array.prototype.forEach.call(
    app.querySelectorAll("[data-delete]"),
    function (button) {
      button.addEventListener("click", function () {
        removeInventory(button.getAttribute("data-delete"));
      });
    }
  );
}

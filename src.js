(function () {
  "use strict";

  var inventory = {};
  var history = [];
  var customPublications = {};
  var ocrPromise = null;
  var zipPromise = null;
  var selectedMonth = "September";

  var publicationCategories = [
    { value: "Bibles", label: "Bibles" },
    { value: "Books", label: "Books" },
    { value: "Brochures and Booklets", label: "Brochures and Booklets" },
    { value: "Forms and Supplies", label: "Forms and Supplies" },
    { value: "Tracts", label: "Tracts" },
    { value: "Public Magazines", label: "Magazines" }
  ];

  var validCodesMaster = [
    "nwt", "nwtpkt", "bhs", "bt", "lfb", "lff", "rr", "scl", "sjj", "sjjls",
    "sjjyls", "wcg", "yp1", "yp2", "fg", "hf", "la", "lc", "lffi", "ll",
    "lmd", "mb", "rj", "wfg", "ypq", "jwcd1", "jwcd9", "jwcd10", "S-4", "inv",
    "t30", "t31", "t32", "t33", "t34", "t35", "t36", "t37", "g18.1", "g18.2",
    "g18.3", "g19.1", "g19.2", "g19.3", "g20.1", "g20.2", "g20.3", "g21.1",
    "g21.2", "g21.3", "g22.1", "g23.1", "g24.1", "g25.1", "wp18.1", "wp18.2",
    "wp18.3", "wp19.1", "wp19.2", "wp19.3", "wp20.1", "wp20.2", "wp20.3",
    "wp21.1", "wp21.2", "wp21.3", "wp22.1", "wp23.1", "wp24.1", "wp25.1", "wp26.1"
  ];

  var validCodes = Object.create(null);

  function normCode(code) {
    code = String(code || "").toLowerCase().trim().replace(/\s+/g, "");
    code = code.replace(/^llf$/, "lff");

    if (/^t-?\d+$/.test(code)) {
      code = "t" + code.replace(/\D/g, "");
    }

    return code;
  }

  validCodesMaster.forEach(function (code) {
    validCodes[normCode(code)] = true;
  });

  // Load previously saved data.
  try {
    var savedInventory = JSON.parse(
      localStorage.getItem("inventory") || "{}"
    );

    var savedHistory = JSON.parse(
      localStorage.getItem("history") || "[]"
    );

    var savedCustom = JSON.parse(
      localStorage.getItem("customPublications") || "{}"
    );

    if (
      savedInventory &&
      typeof savedInventory === "object" &&
      !Array.isArray(savedInventory)
    ) {
      inventory = savedInventory;
    }

    if (Array.isArray(savedHistory)) {
      history = savedHistory;
    }

    if (
      savedCustom &&
      typeof savedCustom === "object" &&
      !Array.isArray(savedCustom)
    ) {
      customPublications = savedCustom;
    }
  } catch (e) {
    inventory = {};
    history = [];
    customPublications = {};
  }

  function isCodeValid(code) {
    code = normCode(code);

    return !!validCodes[code] ||
      Object.prototype.hasOwnProperty.call(customPublications, code);
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function categoryLabel(category) {
    for (var i = 0; i < publicationCategories.length; i++) {
      if (publicationCategories[i].value === category) {
        return publicationCategories[i].label;
      }
    }

    return category || "Uncategorized";
  }

  function getCategory(code) {
    code = normCode(code);

    if (
      Object.prototype.hasOwnProperty.call(customPublications, code)
    ) {
      return categoryLabel(customPublications[code]);
    }

    return validCodes[code]
      ? "Standard publication"
      : "Uncategorized";
  }

  function setStatus(message) {
    var status = document.getElementById("status");

    if (status) {
      status.textContent = message;
    }
  }

  // Page styling.
  function addStyles() {
    if (document.getElementById("inventory-scanner-styles")) {
      return;
    }

    var style = document.createElement("style");
    style.id = "inventory-scanner-styles";

    style.textContent = [
      "#app{max-width:1100px;margin:28px auto;padding:0 18px;font-family:Arial,sans-serif;color:#202124;line-height:1.45}",
      ".inv-card{background:#fff;border:1px solid #dfe3e8;border-radius:12px;padding:20px;margin:16px 0;box-shadow:0 2px 8px rgba(0,0,0,.04)}",
      ".inv-title{font-size:28px;margin:0 0 6px}.inv-muted{color:#5f6368;font-size:14px}",
      ".inv-controls{display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-top:12px}",
      ".inv-btn{border:0;border-radius:7px;padding:10px 14px;cursor:pointer;background:#155eef;color:#fff;font-weight:600}",
      ".inv-btn.secondary{background:#eef2f7;color:#202124}.inv-btn.danger{background:#b42318;color:#fff}.inv-btn:disabled{opacity:.6;cursor:wait}",
      "#bulk-notepad{box-sizing:border-box;width:100%;min-height:190px;padding:12px;border:1px solid #c9ced6;border-radius:8px;font:14px/1.5 Consolas,monospace;resize:vertical}",
      ".inv-table-wrap{overflow:auto}table{border-collapse:collapse;width:100%;font-size:14px}th,td{text-align:left;border-bottom:1px solid #e5e7eb;padding:10px 8px}th{background:#f7f8fa}tr.invalid-code{color:#b42318;background:#fff6f5}",
      ".inv-badge{font-size:11px;background:#b42318;color:#fff;padding:2px 6px;border-radius:4px;margin-left:5px}",
      ".publication-fields{display:grid;grid-template-columns:minmax(150px,1fr) minmax(180px,1fr) auto;gap:10px;align-items:end}",
      ".publication-fields label{display:block;font-size:13px;font-weight:600;color:#475467}",
      ".publication-fields input,.publication-fields select{display:block;box-sizing:border-box;width:100%;margin-top:6px;padding:10px;border:1px solid #c9ced6;border-radius:7px;background:#fff}",
      "#preview{display:none;max-width:100%;max-height:260px;margin-top:12px;border-radius:8px}",
      "#status{white-space:pre-wrap;font-size:13px;color:#475467;margin-top:10px}.inv-history{max-height:220px;overflow:auto;font-family:Consolas,monospace;font-size:13px}",
      "@media(max-width:600px){.inv-title{font-size:23px}.inv-card{padding:14px}.publication-fields{grid-template-columns:1fr}}"
    ].join("\n");

    document.head.appendChild(style);
  }

  // Save inventory, history, and custom publication definitions.
  function save() {
    try {
      localStorage.setItem("inventory", JSON.stringify(inventory));
      localStorage.setItem("history", JSON.stringify(history));
      localStorage.setItem(
        "customPublications",
        JSON.stringify(customPublications)
      );
    } catch (e) {
      console.warn("Inventory could not be saved in this browser.", e);
    }

    render();
  }

  // Add a new publication code or change its category.
  function addPublicationCode(event) {
    event.preventDefault();

    var codeInput = document.getElementById("new-code");
    var categoryInput = document.getElementById("new-category");

    var code = normCode(codeInput && codeInput.value);
    var category = categoryInput && categoryInput.value;

    if (!code) {
      alert("Enter a publication code first.");
      return;
    }

    if (!/^[a-z0-9][a-z0-9.-]*$/.test(code)) {
      alert(
        "Use only letters, numbers, periods, and hyphens in the code. Do not include spaces."
      );
      return;
    }

    if (
      validCodes[code] &&
      !Object.prototype.hasOwnProperty.call(customPublications, code)
    ) {
      alert("That code is already in the standard publication list.");
      return;
    }

    if (
      !publicationCategories.some(function (item) {
        return item.value === category;
      })
    ) {
      alert("Choose a category from the list.");
      return;
    }

    var existed = Object.prototype.hasOwnProperty.call(
      customPublications,
      code
    );

    customPublications[code] = category;

    save();

    setStatus(
      (existed ? "Updated category for " : "Added publication code ") +
      code + " (" + categoryLabel(category) + ")."
    );

    var refreshedInput = document.getElementById("new-code");

    if (refreshedInput) {
      refreshedInput.value = "";
      refreshedInput.focus();
    }
  }

  // A custom code cannot be removed while it has inventory totals.
  function removePublicationCode(code) {
    code = normCode(code);

    var inUse = Object.keys(inventory).some(function (key) {
      var splitAt = key.indexOf(":");

      return (
        (splitAt >= 0 ? key.slice(splitAt + 1) : key) === code
      );
    });

    if (inUse) {
      alert(
        "This code still has inventory totals. Delete its inventory entries before removing the code."
      );
      return;
    }

    if (
      !Object.prototype.hasOwnProperty.call(customPublications, code)
    ) {
      return;
    }

    if (!window.confirm("Remove custom publication code '" + code + "'?")) {
      return;
    }

    delete customPublications[code];

    save();

    setStatus("Removed custom publication code " + code + ".");
  }

  // Read checklist lines such as: nwt - TG - 1500 + 375 + 2125
  function parseBulkLine(line) {
    var match = String(line || "").match(
      /^\s*(.*?)\s*-\s*(TG|E)\s*-\s*(.*?)\s*$/i
    );

    var code;
    var language;
    var expression;

    if (match) {
      code = match[1].trim();
      language = match[2].toUpperCase();
      expression = match[3].trim();
    } else {
      match = String(line || "").match(
        /^\s*(TG|E)\s*-\s*(.*?)\s*-\s*(.*?)\s*$/i
      );

      if (!match) {
        return null;
      }

      language = match[1].toUpperCase();
      code = match[2].trim();
      expression = match[3].trim();
    }

    if (!code || !expression) {
      return null;
    }

    var numbers = expression.match(/\d[\d,]*/g) || [];

    if (!numbers.length) {
      return null;
    }

    var quantity = numbers.reduce(function (sum, value) {
      return sum + (
        parseInt(value.replace(/,/g, ""), 10) || 0
      );
    }, 0);

    return {
      code: normCode(code),
      language: language,
      quantity: quantity
    };
  }

  function processBulkInput() {
    var area = document.getElementById("bulk-notepad");

    if (!area) {
      return;
    }

    var processed = 0;
    var skipped = 0;

    area.value.split(/\r?\n/).forEach(function (rawLine) {
      if (!rawLine.trim()) {
        return;
      }

      var item = parseBulkLine(rawLine);

      if (!item) {
        skipped++;
        return;
      }

      var key = item.language + ":" + item.code;

      inventory[key] =
        (Number(inventory[key]) || 0) + item.quantity;

      history.push({
        code: item.code,
        language: item.language,
        quantity: item.quantity
      });

      processed++;
    });

    area.value = "";

    save();

    if (skipped) {
      alert(
        "Loaded " + processed + " line(s). Skipped " + skipped +
        " line(s). Use CODE - TG - 100 + 25 or CODE - E - 100 + 25."
      );
    } else {
      alert("Success! Loaded " + processed + " line(s).");
    }
  }

  function removeInventory(key) {
    delete inventory[key];

    history = history.filter(function (item) {
      return item.language + ":" + item.code !== key;
    });

    save();
  }

  function clearAll() {
    if (
      !window.confirm(
        "Clear all inventory entries and history? Custom publication codes will be kept."
      )
    ) {
      return;
    }

    inventory = {};
    history = [];

    save();
  }

  // Load an external library only when needed.
  function loadScript(url, globalName, currentPromise) {
    if (window[globalName]) {
      return Promise.resolve(window[globalName]);
    }

    if (currentPromise.value) {
      return currentPromise.value;
    }

    currentPromise.value = new Promise(function (resolve, reject) {
      var script = document.createElement("script");

      script.src = url;
      script.async = true;

      script.onload = function () {
        if (window[globalName]) {
          resolve(window[globalName]);
        } else {
          reject(new Error(globalName + " did not initialize."));
        }
      };

      script.onerror = function () {
        reject(new Error("Could not load " + globalName + "."));
      };

      document.head.appendChild(script);
    }).catch(function (error) {
      currentPromise.value = null;
      throw error;
    });

    return currentPromise.value;
  }

  function loadOCR() {
    return loadScript(
      "https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js",
      "Tesseract",
      {
        get value() { return ocrPromise; },
        set value(v) { ocrPromise = v; }
      }
    );
  }

  function loadJSZip() {
    return loadScript(
      "https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js",
      "JSZip",
      {
        get value() { return zipPromise; },
        set value(v) { zipPromise = v; }
      }
    );
  }

  // Read publication codes from an image using OCR.
  function readPhoto() {
    var input = document.getElementById("photo");
    var file = input && input.files ? input.files[0] : null;
    var preview = document.getElementById("preview");

    if (!file) {
      alert("Choose a photo first.");
      return;
    }

    if (preview.dataset.objectUrl) {
      URL.revokeObjectURL(preview.dataset.objectUrl);
    }

    preview.dataset.objectUrl = URL.createObjectURL(file);
    preview.src = preview.dataset.objectUrl;
    preview.style.display = "block";

    setStatus("Preparing photo for OCR...");

    var button = document.getElementById("read");
    button.disabled = true;

    loadOCR().then(function (Tesseract) {
      return Tesseract.recognize(file, "eng", {
        logger: function (msg) {
          if (msg && msg.status) {
            setStatus(
              "OCR: " + msg.status +
              (typeof msg.progress === "number"
                ? " " + Math.round(msg.progress * 100) + "%"
                : "")
            );
          }
        }
      });
    }).then(function (result) {
      var text = result && result.data && result.data.text
        ? result.data.text.trim()
        : "";

      if (!text) {
        setStatus(
          "No readable text was found. Try a clearer photo or type the line manually."
        );
        return;
      }

      var found = [];

      text.split(/\r?\n/).forEach(function (line) {
        var item = parseBulkLine(line);

        if (item) {
          found.push(
            item.code + " - " +
            item.language + " - " +
            item.quantity
          );
        }
      });

      var area = document.getElementById("bulk-notepad");

      if (area && found.length) {
        area.value +=
          (area.value.trim() ? "\n" : "") +
          found.join("\n");
      }

      setStatus(
        (found.length
          ? "Added " + found.length +
            " detected line(s) to the checklist. Review them and click Process List.\n\n"
          : "No complete inventory line was detected. Review the text below and enter the line manually.\n\n"
        ) + "OCR text:\n" + text
      );
    }).catch(function (error) {
      setStatus(
        "OCR unavailable: " + error.message +
        "\nEnter the checklist manually instead."
      );
    }).then(function () {
      button.disabled = false;
    });
  }

  function downloadBlob(blob, filename) {
    var url = URL.createObjectURL(blob);
    var link = document.createElement("a");

    link.href = url;
    link.download = filename;

    document.body.appendChild(link);
    link.click();
    link.remove();

    window.setTimeout(function () {
      URL.revokeObjectURL(url);
    }, 2000);
  }

  // CSV backup when Excel export is unavailable.
  function downloadCSV(month) {
    var rows = [
      ["Code", "Category", "Language", "Quantity"]
    ];

    Object.keys(inventory).sort().forEach(function (key) {
      var splitAt = key.indexOf(":");
      var language = splitAt >= 0 ? key.slice(0, splitAt) : "";
      var code = splitAt >= 0 ? key.slice(splitAt + 1) : key;

      rows.push([
        code,
        getCategory(code),
        language,
        Number(inventory[key]) || 0
      ]);
    });

    var csv = "\uFEFF" + rows.map(function (row) {
      return row.map(function (value) {
        return '"' + String(value == null ? "" : value)
          .replace(/"/g, '""') + '"';
      }).join(",");
    }).join("\r\n");

    downloadBlob(
      new Blob([csv], { type: "text/csv;charset=utf-8;" }),
      month + "-Inventory.csv"
    );
  }

  function decodeXml(value) {
    return String(value || "")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&amp;/g, "&");
  }

  function getSharedStrings(zip) {
    var file = zip.file("xl/sharedStrings.xml");

    if (!file) {
      return Promise.resolve([]);
    }

    return file.async("string").then(function (xml) {
      var doc = new DOMParser().parseFromString(
        xml,
        "application/xml"
      );

      var items = doc.getElementsByTagName("si");
      var strings = [];

      for (var i = 0; i < items.length; i++) {
        var textNodes = items[i].getElementsByTagName("t");
        var text = "";

        for (var j = 0; j < textNodes.length; j++) {
          text += textNodes[j].textContent || "";
        }

        strings.push(text);
      }

      return strings;
    });
  }

  function cellText(cell, sharedStrings) {
    if (!cell) {
      return "";
    }

    var type = cell.getAttribute("t") || "";

    if (type === "s") {
      var sharedValue = cell.getElementsByTagName("v")[0];

      return sharedValue
        ? (sharedStrings[Number(sharedValue.textContent)] || "")
        : "";
    }

    if (type === "inlineStr") {
      var textNodes = cell.getElementsByTagName("t");
      var inlineText = "";

      for (var i = 0; i < textNodes.length; i++) {
        inlineText += textNodes[i].textContent || "";
      }

      return inlineText;
    }

    var value = cell.getElementsByTagName("v")[0];

    return value ? decodeXml(value.textContent) : "";
  }

  function rowCells(row) {
    return Array.prototype.slice.call(
      row.getElementsByTagName("c")
    );
  }

  function findColumnCell(row, column) {
    var cells = rowCells(row);

    for (var i = 0; i < cells.length; i++) {
      if (
        (cells[i].getAttribute("r") || "").match(
          new RegExp("^" + column + "\\d+$")
        )
      ) {
        return cells[i];
      }
    }

    return null;
  }

  function rowLabel(row, sharedStrings) {
    return cellText(
      findColumnCell(row, "A"),
      sharedStrings
    ).trim();
  }

  // Find where new codes belong in the workbook's category sections.
  function findInsertionIndex(labels, category) {
    var names = publicationCategories.map(function (item) {
      return item.value.toLowerCase();
    });

    var desired = String(category || "Books").toLowerCase();
    var header = -1;

    // Start at index 1 because row 1 is the column heading.
    for (var i = 1; i < labels.length; i++) {
      if (labels[i].toLowerCase() === desired) {
        header = i;
        break;
      }
    }

    if (header < 0) {
      return labels.length;
    }

    var nextSection = labels.length;

    for (var j = header + 1; j < labels.length; j++) {
      if (names.indexOf(labels[j].toLowerCase()) !== -1) {
        nextSection = j;
        break;
      }
    }

    for (var k = header + 1; k < nextSection; k++) {
      if (labels[k].toLowerCase() === "others") {
        return k;
      }
    }

    // Forms and Supplies has no Others row, so insert before Tracts.
    // Public Magazines is the last section, so new rows are appended.
    return nextSection;
  }

  // Build a styled row for a new publication in Excel.
  function makeCustomRow(doc, rowNumber, code) {
    var ns = doc.documentElement.namespaceURI ||
      "http://schemas.openxmlformats.org/spreadsheetml/2006/main";

    var row = doc.createElementNS(ns, "row");

    row.setAttribute("r", String(rowNumber));
    row.setAttribute("ht", "18");
    row.setAttribute("customHeight", "1");

    var a = doc.createElementNS(ns, "c");
    a.setAttribute("r", "A" + rowNumber);
    a.setAttribute("s", "5");
    a.setAttribute("t", "inlineStr");

    var inlineString = doc.createElementNS(ns, "is");
    var textNode = doc.createElementNS(ns, "t");

    textNode.textContent = "(" + code + ")";

    inlineString.appendChild(textNode);
    a.appendChild(inlineString);

    var b = doc.createElementNS(ns, "c");
    b.setAttribute("r", "B" + rowNumber);
    b.setAttribute("s", "6");
    b.setAttribute("t", "n");

    var value = doc.createElementNS(ns, "v");
    value.textContent = "0";

    b.appendChild(value);
    row.appendChild(a);
    row.appendChild(b);

    return row;
  }

  function renumberRow(row, rowNumber) {
    row.setAttribute("r", String(rowNumber));

    var cells = rowCells(row);

    cells.forEach(function (cell) {
      var ref = cell.getAttribute("r") || "";
      var match = ref.match(/^([A-Z]+)\d+$/);

      if (match) {
        cell.setAttribute("r", match[1] + rowNumber);
      }
    });
  }

  function setNumericCell(row, rowNumber, quantity, doc) {
    var cell = findColumnCell(row, "B");
    var ns = doc.documentElement.namespaceURI ||
      "http://schemas.openxmlformats.org/spreadsheetml/2006/main";

    if (!cell) {
      cell = doc.createElementNS(ns, "c");
      cell.setAttribute("r", "B" + rowNumber);
      cell.setAttribute("s", "6");
      row.appendChild(cell);
    }

    cell.setAttribute("t", "n");

    while (cell.firstChild) {
      cell.removeChild(cell.firstChild);
    }

    var value = doc.createElementNS(ns, "v");
    value.textContent = String(Number(quantity) || 0);

    cell.appendChild(value);
  }

  // Add custom codes to their category sections and update quantities.
  function updateWorksheet(xml, language, sharedStrings) {
    var doc = new DOMParser().parseFromString(
      xml,
      "application/xml"
    );

    if (doc.getElementsByTagName("parsererror").length) {
      throw new Error("The workbook contains invalid worksheet XML.");
    }

    var sheetData = doc.getElementsByTagName("sheetData")[0];

    if (!sheetData) {
      return xml;
    }

    var originalRows = Array.prototype.filter.call(
      sheetData.childNodes,
      function (node) {
        return node.nodeType === 1 &&
          (node.localName || node.nodeName) === "row";
      }
    );

    var labels = originalRows.map(function (row) {
      return rowLabel(row, sharedStrings);
    });

    var existingCodes = Object.create(null);

    labels.forEach(function (label) {
      var match = label.match(/\(([^)]+)\)/);

      if (match) {
        existingCodes[normCode(match[1])] = true;
      }
    });

    var insertions = Object.create(null);

    Object.keys(customPublications).sort().forEach(function (code) {
      if (existingCodes[code]) {
        return;
      }

      var category = customPublications[code];

      if (!publicationCategories.some(function (item) {
        return item.value === category;
      })) {
        category = "Books";
      }

      var index = findInsertionIndex(labels, category);

      if (!insertions[index]) {
        insertions[index] = [];
      }

      insertions[index].push(code);
    });

    var planned = [];

    for (var i = 0; i <= originalRows.length; i++) {
      (insertions[i] || []).sort().forEach(function (code) {
        planned.push({ custom: code });
      });

      if (i < originalRows.length) {
        planned.push({ node: originalRows[i] });
      }
    }

    // Rebuild the worksheet rows and update their cell references.
    originalRows.forEach(function (row) {
      sheetData.removeChild(row);
    });

    planned.forEach(function (item, index) {
      var rowNumber = index + 1;
      var row = item.custom
        ? makeCustomRow(doc, rowNumber, item.custom)
        : item.node;

      if (!item.custom) {
        renumberRow(row, rowNumber);
      }

      sheetData.appendChild(row);
    });

    var dimension = doc.getElementsByTagName("dimension")[0];

    if (dimension) {
      dimension.setAttribute("ref", "A1:B" + planned.length);
    }

    // Write each item's quantity to column B.
    var finalRows = Array.prototype.filter.call(
      sheetData.childNodes,
      function (node) {
        return node.nodeType === 1 &&
          (node.localName || node.nodeName) === "row";
      }
    );

    finalRows.forEach(function (row, index) {
      var rowNumber = Number(
        row.getAttribute("r") || (index + 1)
      );

      var label = rowLabel(row, sharedStrings);
      var match = label.match(/\(([^)]+)\)/);

      if (!match) {
        return;
      }

      var code = normCode(match[1]);

      if (!isCodeValid(code)) {
        return;
      }

      var quantity = inventory[language + ":" + code] || 0;

      setNumericCell(row, rowNumber, quantity, doc);
    });

    return new XMLSerializer().serializeToString(doc);
  }

  // Always use September-Inventory.xlsx as the template.
  // The selected month determines the downloaded filename.
  function exportExcel() {
    var monthSelect = document.getElementById("report-month");
    var button = document.getElementById("export");

    selectedMonth = monthSelect
      ? monthSelect.value
      : selectedMonth;

    if (button) {
      button.disabled = true;
      button.textContent = "Preparing download...";
    }

    loadJSZip().then(function (JSZip) {
      return fetch(
        "./September-Inventory.xlsx?cacheBust=" + Date.now(),
        { cache: "no-store" }
      ).then(function (response) {
        if (!response.ok) {
          throw new Error(
            "September-Inventory.xlsx was not found beside index.html."
          );
        }

        return response.arrayBuffer();
      }).then(function (buffer) {
        return JSZip.loadAsync(buffer);
      });
    }).then(function (zip) {
      return getSharedStrings(zip).then(function (sharedStrings) {
        var sheets = [
          { path: "xl/worksheets/sheet1.xml", lang: "TG" },
          { path: "xl/worksheets/sheet2.xml", lang: "E" }
        ];

        return Promise.all(sheets.map(function (sheet) {
          var file = zip.file(sheet.path);

          if (!file) {
            return Promise.resolve();
          }

          return file.async("string").then(function (xml) {
            zip.file(
              sheet.path,
              updateWorksheet(xml, sheet.lang, sharedStrings)
            );
          });
        })).then(function () {
          return zip;
        });
      });
    }).then(function (zip) {
      return zip.generateAsync({
        type: "blob",
        mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      });
    }).then(function (blob) {
      downloadBlob(
        blob,
        selectedMonth + "-Inventory.xlsx"
      );

      setStatus(
        "Downloaded " + selectedMonth +
        "-Inventory.xlsx with current inventory quantities."
      );
    }).catch(function (error) {
      console.warn("Excel export failed; downloading CSV instead.", error);

      downloadCSV(selectedMonth);

      setStatus(
        "The formatted workbook could not be created. A CSV backup was downloaded. Check that September-Inventory.xlsx is in the published repository."
      );
    }).then(function () {
      if (button) {
        button.disabled = false;
        button.textContent = "Download Excel";
      }
    });
  }

  // Render the interface.
  function render() {
    var app = document.getElementById("app");

    if (!app) {
      return;
    }

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

    var customRows = Object.keys(customPublications).sort().map(function (code) {
      return "<tr><td>" + escapeHtml(code) +
        "</td><td>" + escapeHtml(categoryLabel(customPublications[code])) +
        '</td><td><button type="button" class="inv-btn danger" data-remove-code="' +
        escapeHtml(code) + '">Remove</button></td></tr>';
    }).join("");

    if (!customRows) {
      customRows =
        '<tr><td colspan="3" class="inv-muted">No custom publication codes added yet.</td></tr>';
    }

    var keys = Object.keys(inventory).sort();

    var inventoryRows = keys.map(function (key) {
      var separator = key.indexOf(":");
      var language = separator >= 0 ? key.slice(0, separator) : "";
      var code = separator >= 0 ? key.slice(separator + 1) : key;
      var valid = isCodeValid(code);

      var invalidClass = valid ? "" : ' class="invalid-code"';
      var badge = valid
        ? ""
        : '<span class="inv-badge">Invalid code</span>';

      return "<tr" + invalidClass +
        "><td>" + escapeHtml(code) + badge +
        "</td><td>" + escapeHtml(getCategory(code)) +
        "</td><td>" + escapeHtml(language) +
        "</td><td>" + escapeHtml(inventory[key]) +
        '</td><td><button type="button" class="inv-btn danger" data-delete="' +
        escapeHtml(key) + '">Delete</button></td></tr>';
    }).join("");

    var historyRows = history.map(function (item, index) {
      return '<div' +
        (isCodeValid(item.code)
          ? ""
          : ' style="color:#b42318;font-weight:bold"') +
        ">" + (index + 1) + ". " +
        escapeHtml(item.code) + " - " +
        escapeHtml(item.language) + " — " +
        escapeHtml(item.quantity) + "</div>";
    }).join("");

    var total = keys.reduce(function (sum, key) {
      return sum + (Number(inventory[key]) || 0);
    }, 0);

    app.innerHTML = [
      '<section class="inv-card">',
      '<h1 class="inv-title">Inventory Scanner</h1>',
      '<div class="inv-muted">Paste your entire notepad checklist here. Math symbols (+) are calculated automatically.</div>',
      '<textarea id="bulk-notepad" placeholder="Example:\nnwt - TG - 1500 + 375 + 2125\nbhs - E - 25 + 10\nS-4 - TG - 5"></textarea>',
      '<div class="inv-controls">',
      '<button type="button" class="inv-btn" id="add-bulk">Process List</button>',
      '<button type="button" class="inv-btn secondary" id="clear-text">Clear text</button>',
      '</div></section>',

      '<section class="inv-card">',
      '<h2>Manage Publication Codes</h2>',
      '<p class="inv-muted">Register new publications and choose their category. Codes are saved in this browser and added to the matching section of Excel exports.</p>',
      '<form id="publication-form">',
      '<div class="publication-fields">',
      '<label for="new-code">Publication code<input id="new-code" type="text" maxlength="40" placeholder="e.g. newbook1" autocomplete="off" required></label>',
      '<label for="new-category">Category<select id="new-category">' + categoryOptions + '</select></label>',
      '<button type="submit" class="inv-btn">Add / Update Code</button>',
      '</div></form>',
      '<div class="inv-table-wrap"><table>',
      '<thead><tr><th>Custom code</th><th>Category</th><th>Action</th></tr></thead>',
      '<tbody>' + customRows + '</tbody></table></div></section>',

      '<section class="inv-card"><h2>Read code from photo</h2>',
      '<div class="inv-controls"><label for="photo">Choose a photo:</label>',
      '<input id="photo" type="file" accept="image/*">',
      '<button type="button" class="inv-btn secondary" id="read">Read Photo</button></div>',
      '<img id="preview" alt="Selected photo preview">',
      '<div id="status" aria-live="polite">Ready.</div></section>',

      '<section class="inv-card"><h2>Counts Reporting</h2>',
      '<div class="inv-controls"><label for="report-month">Month:</label>',
      '<select id="report-month">' + monthOptions + '</select>',
      '<button type="button" class="inv-btn" id="export">Download Excel</button>',
      '<button type="button" class="inv-btn danger" id="clear">Clear entries</button></div>',
      '<p><strong>Running total:</strong> ' + total.toLocaleString() + '</p>',
      '<div class="inv-table-wrap"><table>',
      '<thead><tr><th>Code</th><th>Category</th><th>Language</th><th>Total</th><th>Action</th></tr></thead>',
      '<tbody>' + (inventoryRows ||
        '<tr><td colspan="5">No inventory entries yet.</td></tr>') +
      '</tbody></table></div></section>',

      '<section class="inv-card"><h2>History</h2><div class="inv-history">' +
        (historyRows || '<div class="inv-muted">No history yet.</div>') +
      '</div></section>'
    ].join("");

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

    document.getElementById("publication-form").addEventListener(
      "submit",
      addPublicationCode
    );

    Array.prototype.forEach.call(
      app.querySelectorAll("[data-remove-code]"),
      function (button) {
        button.addEventListener("click", function () {
          removePublicationCode(
            button.getAttribute("data-remove-code")
          );
        });
      }
    );

    document.getElementById("read").addEventListener(
      "click",
      readPhoto
    );

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

    Array.prototype.forEach.call(
      app.querySelectorAll("[data-delete]"),
      function (button) {
        button.addEventListener("click", function () {
          removeInventory(button.getAttribute("data-delete"));
        });
      }
    );
  }

  function init() {
    var app = document.getElementById("app");

    if (!app) {
      app = document.createElement("main");
      app.id = "app";
      document.body.appendChild(app);
    }

    addStyles();
    render();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();

(function () {
  "use strict";

  var inventory = {};
  var history = [];
  var customPublications = {};
  var deletedPublications = {};
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
  var app = null;

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

  function validCategory(category) {
    return publicationCategories.some(function (item) {
      return item.value === category;
    });
  }

  // Support the older storage format and the newer custom-code format.
  function normalizeCustomRegistry(saved) {
    var result = {};

    if (!saved || typeof saved !== "object" || Array.isArray(saved)) {
      return result;
    }

    Object.keys(saved).forEach(function (originalCode) {
      var code = normCode(originalCode);
      var value = saved[originalCode];

      if (!code) return;

      if (typeof value === "string") {
        result[code] = {
          category: validCategory(value) ? value : "Books",
          active: true
        };
      } else if (value && typeof value === "object") {
        result[code] = {
          category: validCategory(value.category) ? value.category : "Books",
          active: value.active !== false
        };
      }
    });

    return result;
  }

  function normalizeDeletedRegistry(saved) {
    var result = {};

    if (!saved || typeof saved !== "object" || Array.isArray(saved)) {
      return result;
    }

    Object.keys(saved).forEach(function (originalCode) {
      var code = normCode(originalCode);
      var value = saved[originalCode];

      if (!code) return;

      var category = value && typeof value === "object"
        ? value.category
        : value;

      result[code] = {
        category: validCategory(category) ? category : "Books"
      };
    });

    return result;
  }

  // Load saved inventory, history, custom codes, and deleted-code records.
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

    var savedDeleted = JSON.parse(
      localStorage.getItem("deletedPublications") || "{}"
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

    customPublications = normalizeCustomRegistry(savedCustom);
    deletedPublications = normalizeDeletedRegistry(savedDeleted);
  } catch (error) {
    inventory = {};
    history = [];
    customPublications = {};
    deletedPublications = {};
  }

  function isDeletedCode(code) {
    return Object.prototype.hasOwnProperty.call(
      deletedPublications,
      normCode(code)
    );
  }

  // Keep a record of deletions so codes aren't re-imported from an old template.
  function isCustomCode(code) {
    code = normCode(code);

    return Object.prototype.hasOwnProperty.call(customPublications, code) ||
      isDeletedCode(code);
  }

  function isCodeActive(code) {
    code = normCode(code);

    if (isDeletedCode(code)) return false;
    if (validCodes[code]) return true;

    return Object.prototype.hasOwnProperty.call(customPublications, code) &&
      customPublications[code].active !== false;
  }

  function isCodeValid(code) {
    return isCodeActive(code);
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

    if (Object.prototype.hasOwnProperty.call(customPublications, code)) {
      return categoryLabel(customPublications[code].category);
    }

    if (isDeletedCode(code)) {
      return categoryLabel(deletedPublications[code].category);
    }

    return validCodes[code] ? "Standard publication" : "Uncategorized";
  }

  function setStatus(message) {
    var status = document.getElementById("status");

    if (status) {
      status.textContent = message;
    }
  }

  // Add styling without requiring changes to style.css.
  function addStyles() {
    if (document.getElementById("inventory-scanner-styles")) return;

    var style = document.createElement("style");
    style.id = "inventory-scanner-styles";

    style.textContent = [
      "#app{max-width:1100px;margin:28px auto;padding:0 18px;font-family:Arial,sans-serif;color:#202124;line-height:1.45}",
      ".inv-card{background:#fff;border:1px solid #dfe3e8;border-radius:12px;padding:20px;margin:16px 0;box-shadow:0 2px 8px rgba(0,0,0,.04)}",
      ".inv-title{font-size:28px;margin:0 0 6px}.inv-muted{color:#5f6368;font-size:14px}",
      ".inv-controls{display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-top:12px}",
      ".inv-btn{border:0;border-radius:7px;padding:10px 14px;cursor:pointer;background:#155eef;color:#fff;font-weight:600}",
      ".inv-btn.secondary{background:#eef2f7;color:#202124}.inv-btn.danger{background:#b42318;color:#fff}.inv-btn.success{background:#087443;color:#fff}.inv-btn:disabled{opacity:.6;cursor:wait}",
      "#bulk-notepad{box-sizing:border-box;width:100%;min-height:190px;padding:12px;border:1px solid #c9ced6;border-radius:8px;font:14px/1.5 Consolas,monospace;resize:vertical}",
      ".inv-table-wrap{overflow:auto}table{border-collapse:collapse;width:100%;font-size:14px}th,td{text-align:left;border-bottom:1px solid #e5e7eb;padding:10px 8px}th{background:#f7f8fa}tr.invalid-code{color:#b42318;background:#fff6f5}",
      ".inv-badge{font-size:11px;background:#b42318;color:#fff;padding:2px 6px;border-radius:4px;margin-left:5px}.retired-badge{font-size:11px;background:#667085;color:white;padding:2px 6px;border-radius:4px;margin-left:5px}",
      ".publication-fields{display:grid;grid-template-columns:minmax(150px,1fr) minmax(180px,1fr) auto;gap:10px;align-items:end}",
      ".publication-fields label{display:block;font-size:13px;font-weight:600;color:#475467}",
      ".publication-fields input,.publication-fields select{display:block;box-sizing:border-box;width:100%;margin-top:6px;padding:10px;border:1px solid #c9ced6;border-radius:7px;background:#fff}",
      "#preview{display:none;max-width:100%;max-height:260px;margin-top:12px;border-radius:8px}",
      "#status{white-space:pre-wrap;font-size:13px;color:#475467;margin-top:10px}.inv-history{max-height:220px;overflow:auto;font-family:Consolas,monospace;font-size:13px}",
      "#scan-results{margin-top:12px}#scan-results input{box-sizing:border-box;border:1px solid #c9ced6;border-radius:6px}",
      "@media(max-width:600px){.inv-title{font-size:23px}.inv-card{padding:14px}.publication-fields{grid-template-columns:1fr}}"
    ].join("\n");

    document.head.appendChild(style);
  }

  // Save all data locally in this browser.
  function save() {
    try {
      localStorage.setItem("inventory", JSON.stringify(inventory));
      localStorage.setItem("history", JSON.stringify(history));

      localStorage.setItem(
        "customPublications",
        JSON.stringify(customPublications)
      );

      localStorage.setItem(
        "deletedPublications",
        JSON.stringify(deletedPublications)
      );
    } catch (error) {
      console.warn("Inventory could not be saved in this browser.", error);
    }

    render();
  }

  // Add a custom publication or update its category.
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
      alert("Use only letters, numbers, periods, and hyphens in the code. Do not include spaces.");
      return;
    }

    if (validCodes[code] && !isCustomCode(code)) {
      alert("That code already exists in the standard publication list.");
      return;
    }

    if (!validCategory(category)) {
      alert("Choose a category from the list.");
      return;
    }

    var existed = Object.prototype.hasOwnProperty.call(
      customPublications,
      code
    );

    // Re-adding a deleted code explicitly restores it.
    delete deletedPublications[code];

    customPublications[code] = {
      category: category,
      active: true
    };

    save();

    setStatus(
      (existed ? "Updated publication " : "Added publication code ") +
      code + " (" + categoryLabel(category) + ")."
    );

    var refreshedInput = document.getElementById("new-code");

    if (refreshedInput) {
      refreshedInput.value = "";
      refreshedInput.focus();
    }
  }

  // Delete the custom definition and current totals but keep its history.
  function deletePublicationCode(code) {
    code = normCode(code);

    if (!Object.prototype.hasOwnProperty.call(customPublications, code)) {
      return;
    }

    var record = customPublications[code];

    if (!window.confirm(
      "Delete publication '" + code +
      "'? Its current inventory totals will be removed. Its history will remain. Download Updated Template to remove its row from the workbook."
    )) {
      return;
    }

    // This record prevents an old template from bringing the deleted code back.
    deletedPublications[code] = {
      category: record.category || "Books"
    };

    delete customPublications[code];

    Object.keys(inventory).forEach(function (key) {
      var separator = key.indexOf(":");
      var itemCode = separator >= 0 ? key.slice(separator + 1) : key;

      if (normCode(itemCode) === code) {
        delete inventory[key];
      }
    });

    save();

    setStatus(
      "Deleted " + code +
      " from Publication Codes. Download Updated Template, then replace September-Inventory.xlsx in GitHub to make the deletion permanent for all visitors."
    );
  }

  // Parse checklist lines such as CODE - TG - 100 + 25.
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

    if (!area) return;

    var processed = 0;
    var skippedLines = [];

    area.value.split(/\r?\n/).forEach(function (rawLine) {
      if (!rawLine.trim()) return;

      var item = parseBulkLine(rawLine);

      if (!item || !isCodeActive(item.code)) {
        skippedLines.push(rawLine);
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

    // Keep unrecognized/deleted lines for correction.
    area.value = skippedLines.join("\n");

    save();

    if (skippedLines.length) {
      alert(
        "Loaded " + processed + " line(s). " +
        skippedLines.length +
        " line(s) were not processed because their format/code is invalid " +
        "or the publication is deleted/unregistered. Those lines remain in the checklist."
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
    if (!window.confirm(
      "Clear all inventory entries and history? Custom publication codes and deleted-code records will be kept."
    )) {
      return;
    }

    inventory = {};
    history = [];

    save();
  }

  // Load browser libraries only when required.
  function loadLibrary(url, globalName, libraryName) {
    if (window[globalName]) {
      return Promise.resolve(window[globalName]);
    }

    var existingPromise = libraryName === "Tesseract"
      ? ocrPromise
      : zipPromise;

    if (existingPromise) {
      return existingPromise;
    }

    var promise = new Promise(function (resolve, reject) {
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
      if (libraryName === "Tesseract") {
        ocrPromise = null;
      } else {
        zipPromise = null;
      }

      throw error;
    });

    if (libraryName === "Tesseract") {
      ocrPromise = promise;
    } else {
      zipPromise = promise;
    }

    return promise;
  }

  function loadOCR() {
    return loadLibrary(
      "https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js",
      "Tesseract",
      "Tesseract"
    );
  }

  function loadJSZip() {
    return loadLibrary(
      "https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js",
      "JSZip",
      "JSZip"
    );
  }

  function escapeRegex(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  // Detect registered codes in OCR text, even when the image has no quantity.
  function detectPublicationCodes(text) {
    var codes = Object.keys(validCodes);

    Object.keys(customPublications).forEach(function (code) {
      if (isCodeActive(code)) {
        codes.push(code);
      }
    });

    codes = codes.filter(function (code, index, all) {
      return isCodeActive(code) && all.indexOf(code) === index;
    }).sort(function (a, b) {
      return b.length - a.length;
    });

    var lowerText = String(text || "").toLowerCase();
    var found = [];

    codes.forEach(function (code) {
      var regex = new RegExp(
        "(^|[^a-z0-9])" + escapeRegex(code) + "(?=$|[^a-z0-9])",
        "gi"
      );

      if (regex.test(lowerText)) {
        found.push(code);
      }
    });

    return found.sort();
  }

  // Show detected codes with editable box quantities.
  function renderScanResults(codes) {
    var results = document.getElementById("scan-results");

    if (!results) return;

    if (!codes.length) {
      results.innerHTML =
        '<p class="inv-muted">No registered publication codes were detected. Try a clearer photo, or add the new code in Manage Publication Codes first.</p>';
      return;
    }

    results.innerHTML = [
      '<p class="inv-muted">Review each detected code. Quantity starts at 1 per unique code. Adjust it to match the actual number of boxes.</p>',
      '<div class="inv-table-wrap"><table><thead><tr><th>Detected code</th><th>Category</th><th>Quantity to add</th></tr></thead><tbody>',
      codes.map(function (code) {
        return '<tr data-scan-row="' + escapeHtml(code) + '">' +
          '<td>' + escapeHtml(code) + '</td>' +
          '<td>' + escapeHtml(getCategory(code)) + '</td>' +
          '<td><input class="scan-quantity" type="number" min="0" step="1" value="1" aria-label="Quantity for ' +
          escapeHtml(code) + '" style="width:100px;padding:8px"></td></tr>';
      }).join(""),
      '</tbody></table></div>',
      '<div class="inv-controls"><button type="button" class="inv-btn success" id="add-scanned-results">Add scanned codes to inventory</button></div>'
    ].join("");

    document.getElementById("add-scanned-results").addEventListener(
      "click",
      addScannedResults
    );
  }

  function addScannedResults() {
    var languageSelect = document.getElementById("scan-language");
    var language = languageSelect ? languageSelect.value : "TG";
    var rows = document.querySelectorAll("[data-scan-row]");
    var added = 0;
    var ignored = 0;

    Array.prototype.forEach.call(rows, function (row) {
      var code = normCode(row.getAttribute("data-scan-row"));
      var quantityInput = row.querySelector(".scan-quantity");
      var quantity = quantityInput
        ? parseInt(quantityInput.value, 10)
        : 0;

      if (
        !isCodeActive(code) ||
        !Number.isFinite(quantity) ||
        quantity <= 0
      ) {
        ignored++;
        return;
      }

      var key = language + ":" + code;

      inventory[key] = (Number(inventory[key]) || 0) + quantity;

      history.push({
        code: code,
        language: language,
        quantity: quantity
      });

      added++;
    });

    if (!added) {
      alert(
        "No quantities were added. Enter a quantity greater than zero for at least one detected code."
      );
      return;
    }

    save();

    setStatus(
      "Added " + added + " detected code(s) in " + language +
      " to inventory." +
      (ignored ? " Skipped " + ignored + " empty/zero quantity row(s)." : "") +
      " Download Excel to create the report."
    );
  }

  // Upload or capture a photo, run OCR, and detect registered publication codes.
  function readPhoto() {
    var input = document.getElementById("photo");
    var file = input && input.files ? input.files[0] : null;
    var preview = document.getElementById("preview");

    if (!file) {
      alert("Capture a photo or choose an image of publication boxes first.");
      return;
    }

    if (preview.dataset.objectUrl) {
      URL.revokeObjectURL(preview.dataset.objectUrl);
    }

    preview.dataset.objectUrl = URL.createObjectURL(file);
    preview.src = preview.dataset.objectUrl;
    preview.style.display = "block";

    setStatus("Reading the photo and looking for publication codes...");

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
        renderScanResults([]);

        setStatus(
          "No readable text was found. Try a closer, clearer photo with the code facing the camera."
        );
        return;
      }

      var codes = detectPublicationCodes(text);

      renderScanResults(codes);

      setStatus(
        "Photo scan complete. Found " + codes.length +
        " unique recognized publication code(s). Choose the correct language and check quantities before adding." +
        "\n\nRecognized text:\n" + text
      );
    }).catch(function (error) {
      setStatus(
        "Photo scanning failed: " + error.message +
        "\nTry another image or enter the code manually."
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

  // CSV fallback if Excel export is unavailable.
  function downloadCSV(month) {
    var rows = [["Code", "Category", "Language", "Quantity"]];

    Object.keys(inventory).sort().forEach(function (key) {
      var separator = key.indexOf(":");
      var language = separator >= 0 ? key.slice(0, separator) : "";
      var code = separator >= 0 ? key.slice(separator + 1) : key;

      if (!isCodeActive(code)) return;

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

    if (!file) return Promise.resolve([]);

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
    if (!cell) return "";

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
    return Array.prototype.filter.call(
      row.getElementsByTagName("c"),
      function (cell) {
        return cell.parentNode === row;
      }
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

  function readCodeFromLabel(label) {
    var match = String(label || "").match(/^\s*\(([^)]+)\)/);
    return match ? normCode(match[1]) : "";
  }

  function categoryFromHeader(label) {
    for (var i = 0; i < publicationCategories.length; i++) {
      if (
        publicationCategories[i].value.toLowerCase() ===
        String(label || "").trim().toLowerCase()
      ) {
        return publicationCategories[i].value;
      }
    }

    return "";
  }

  // Read custom codes from an updated template after it has been published.
  function importCustomCodesFromTemplate(zip, sharedStrings) {
    var file = zip.file("xl/worksheets/sheet1.xml");

    if (!file) return Promise.resolve(false);

    return file.async("string").then(function (xml) {
      var doc = new DOMParser().parseFromString(
        xml,
        "application/xml"
      );

      var sheetData = doc.getElementsByTagName("sheetData")[0];

      if (!sheetData) return false;

      var rows = Array.prototype.filter.call(
        sheetData.childNodes,
        function (node) {
          return node.nodeType === 1 &&
            (node.localName || node.nodeName) === "row";
        }
      );

      var currentCategory = "Books";
      var changed = false;

      rows.forEach(function (row, index) {
        var label = rowLabel(row, sharedStrings);
        var header = categoryFromHeader(label);

        if (header) {
          if (!(index === 0 && header === "Bibles")) {
            currentCategory = header;
          }

          return;
        }

        var code = readCodeFromLabel(label);

        if (
          !code ||
          validCodes[code] ||
          isCustomCode(code)
        ) {
          return;
        }

        customPublications[code] = {
          category: currentCategory,
          active: true
        };

        changed = true;
      });

      if (changed) save();

      return changed;
    });
  }

  function loadTemplateZip() {
    return loadJSZip().then(function (JSZip) {
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
    });
  }

  function findInsertionIndex(labels, category) {
    var wanted = String(category || "Books").toLowerCase();
    var headerIndex = -1;

    for (var i = 1; i < labels.length; i++) {
      if (
        String(labels[i] || "").trim().toLowerCase() === wanted
      ) {
        headerIndex = i;
        break;
      }
    }

    if (headerIndex < 0) return labels.length;

    if (wanted === "public magazines") return labels.length;

    var knownHeaders = publicationCategories.map(function (item) {
      return item.value.toLowerCase();
    });

    var nextSection = labels.length;

    for (var j = headerIndex + 1; j < labels.length; j++) {
      if (
        knownHeaders.indexOf(
          String(labels[j] || "").trim().toLowerCase()
        ) >= 0
      ) {
        nextSection = j;
        break;
      }
    }

    for (var k = headerIndex + 1; k < nextSection; k++) {
      if (
        String(labels[k] || "").trim().toLowerCase() === "others"
      ) {
        return k;
      }
    }

    return nextSection;
  }

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
    var text = doc.createElementNS(ns, "t");

    text.textContent = "(" + code + ")";

    inlineString.appendChild(text);
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

    rowCells(row).forEach(function (cell) {
      var ref = cell.getAttribute("r") || "";
      var match = ref.match(/^([A-Z]+)\d+$/);

      if (match) {
        cell.setAttribute("r", match[1] + rowNumber);
      }
    });
  }

  function setNumericCell(row, rowNumber, quantity, doc) {
    var ns = doc.documentElement.namespaceURI ||
      "http://schemas.openxmlformats.org/spreadsheetml/2006/main";

    var cell = findColumnCell(row, "B");

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

  // Rebuild a worksheet with active custom codes and current quantities.
  function updateWorksheet(xml, language, sharedStrings, mode) {
    var doc = new DOMParser().parseFromString(
      xml,
      "application/xml"
    );

    if (doc.getElementsByTagName("parsererror").length) {
      throw new Error("The workbook contains invalid worksheet XML.");
    }

    var sheetData = doc.getElementsByTagName("sheetData")[0];

    if (!sheetData) return xml;

    var originalRows = Array.prototype.filter.call(
      sheetData.childNodes,
      function (node) {
        return node.nodeType === 1 &&
          (node.localName || node.nodeName) === "row";
      }
    );

    var retainedRows = [];

    originalRows.forEach(function (row) {
      var code = readCodeFromLabel(rowLabel(row, sharedStrings));

      // Custom codes are recreated below in their current category.
      // Deleted custom codes are excluded from the new workbook.
      if (code && isCustomCode(code)) return;

      retainedRows.push(row);
    });

    var labels = retainedRows.map(function (row) {
      return rowLabel(row, sharedStrings);
    });

    var insertions = Object.create(null);

    Object.keys(customPublications).forEach(function (code) {
      if (customPublications[code].active === false) return;

      var category = customPublications[code].category;

      if (!validCategory(category)) category = "Books";

      var index = findInsertionIndex(labels, category);

      if (!insertions[index]) insertions[index] = [];

      insertions[index].push(code);
    });

    Object.keys(insertions).forEach(function (key) {
      insertions[key].sort();
    });

    var planned = [];

    for (var i = 0; i <= retainedRows.length; i++) {
      (insertions[i] || []).forEach(function (code) {
        planned.push({ customCode: code });
      });

      if (i < retainedRows.length) {
        planned.push({ row: retainedRows[i] });
      }
    }

    originalRows.forEach(function (row) {
      sheetData.removeChild(row);
    });

    planned.forEach(function (item, index) {
      var rowNumber = index + 1;
      var row = item.customCode
        ? makeCustomRow(doc, rowNumber, item.customCode)
        : item.row;

      if (!item.customCode) {
        renumberRow(row, rowNumber);
      }

      sheetData.appendChild(row);
    });

    var dimension = doc.getElementsByTagName("dimension")[0];

    if (dimension) {
      dimension.setAttribute("ref", "A1:B" + planned.length);
    }

    var finalRows = Array.prototype.filter.call(
      sheetData.childNodes,
      function (node) {
        return node.nodeType === 1 &&
          (node.localName || node.nodeName) === "row";
      }
    );

    finalRows.forEach(function (row, index) {
      var rowNumber = Number(row.getAttribute("r") || index + 1);
      var code = readCodeFromLabel(rowLabel(row, sharedStrings));

      if (!code || !isCodeValid(code)) return;

      var quantity = mode === "template"
        ? 0
        : (Number(inventory[language + ":" + code]) || 0);

      setNumericCell(row, rowNumber, quantity, doc);
    });

    return new XMLSerializer().serializeToString(doc);
  }

  function transformWorkbook(zip, mode) {
    return getSharedStrings(zip).then(function (sharedStrings) {
      return importCustomCodesFromTemplate(
        zip,
        sharedStrings
      ).then(function () {
        var sheets = [
          { path: "xl/worksheets/sheet1.xml", language: "TG" },
          { path: "xl/worksheets/sheet2.xml", language: "E" }
        ];

        return Promise.all(sheets.map(function (sheet) {
          var file = zip.file(sheet.path);

          if (!file) return Promise.resolve();

          return file.async("string").then(function (xml) {
            zip.file(
              sheet.path,
              updateWorksheet(
                xml,
                sheet.language,
                sharedStrings,
                mode
              )
            );
          });
        })).then(function () {
          return zip;
        });
      });
    });
  }

  // Use September-Inventory.xlsx as the single template.
  // The chosen month determines the downloaded filename.
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

    loadTemplateZip().then(function (zip) {
      return transformWorkbook(zip, "report");
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
        "-Inventory.xlsx with current active inventory quantities."
      );
    }).catch(function (error) {
      console.warn(
        "Excel export failed; downloading CSV instead.",
        error
      );

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

  // Produce a clean workbook template with custom changes and zero quantities.
  // The owner must replace the repository's workbook manually to publish it.
  function downloadUpdatedTemplate() {
    if (!window.confirm(
      "Create an updated template copy? Active custom codes will be included, deleted custom codes removed, and all quantities reset to zero. This downloads a file; it does not directly modify GitHub."
    )) {
      return;
    }

    var button = document.getElementById("download-template");

    if (button) {
      button.disabled = true;
      button.textContent = "Preparing template...";
    }

    loadTemplateZip().then(function (zip) {
      return transformWorkbook(zip, "template");
    }).then(function (zip) {
      return zip.generateAsync({
        type: "blob",
        mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      });
    }).then(function (blob) {
      downloadBlob(
        blob,
        "September-Inventory-UPDATED-TEMPLATE.xlsx"
      );

      setStatus(
        "Updated template downloaded. To make the changes permanent for all users, replace September-Inventory.xlsx in your GitHub repository with this clean template file, renamed to September-Inventory.xlsx."
      );
    }).catch(function (error) {
      console.error("Template update failed.", error);

      setStatus(
        "Could not create the updated template: " + error.message
      );

      alert(
        "Could not create the updated template. Make sure September-Inventory.xlsx is available and try again."
      );
    }).then(function () {
      if (button) {
        button.disabled = false;
        button.textContent = "Download Updated Template";
      }
    });
  }

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

    var customRows = Object.keys(customPublications).sort().map(function (code) {
      var record = customPublications[code];

      return "<tr><td>" + escapeHtml(code) +
        (record.active === false
          ? ' <span class="retired-badge">Inactive</span>'
          : "") +
        "</td><td>" + escapeHtml(categoryLabel(record.category)) +
        '</td><td><button type="button" class="inv-btn danger" data-delete-code="' +
        escapeHtml(code) + '">Delete</button></td></tr>';
    }).join("") ||
      '<tr><td colspan="3" class="inv-muted">No custom publication codes registered yet.</td></tr>';

    var keys = Object.keys(inventory).filter(function (key) {
      var separator = key.indexOf(":");
      var code = separator >= 0
        ? key.slice(separator + 1)
        : key;

      return isCodeActive(code);
    }).sort();

    var inventoryRows = keys.map(function (key) {
      var separator = key.indexOf(":");
      var language = separator >= 0 ? key.slice(0, separator) : "";
      var code = separator >= 0 ? key.slice(separator + 1) : key;

      return "<tr><td>" + escapeHtml(code) +
        "</td><td>" + escapeHtml(getCategory(code)) +
        "</td><td>" + escapeHtml(language) +
        "</td><td>" + escapeHtml(inventory[key]) +
        '</td><td><button type="button" class="inv-btn danger" data-delete="' +
        escapeHtml(key) + '">Delete</button></td></tr>';
    }).join("");

    var historyRows = history.map(function (item, index) {
      var deleted = isDeletedCode(item.code);
      var inactive = isCustomCode(item.code) &&
        !deleted &&
        Object.prototype.hasOwnProperty.call(
          customPublications,
          normCode(item.code)
        ) &&
        customPublications[normCode(item.code)].active === false;

      return '<div' +
        ((deleted || inactive) ? ' style="color:#667085"' : "") +
        ">" +
        (index + 1) + ". " +
        escapeHtml(item.code) + " - " +
        escapeHtml(item.language) + " — " +
        escapeHtml(item.quantity) +
        (deleted
          ? " (publication deleted; history kept)"
          : (inactive ? " (inactive; history kept)" : "")) +
        "</div>";
    }).join("");

    var total = keys.reduce(function (sum, key) {
      return sum + (Number(inventory[key]) || 0);
    }, 0);

    app.innerHTML = [
      '<section class="inv-card"><h1 class="inv-title">Inventory Scanner</h1>',
      '<div class="inv-muted">Capture or upload a photo of publication boxes. The scanner looks for registered publication codes.</div></section>',

      '<section class="inv-card"><h2>1. Scan Publication Boxes</h2>',
      '<p class="inv-muted">Choose the language printed on the boxes. The scanner detects unique registered codes; set each quantity to the number of boxes before adding.</p>',
      '<div class="inv-controls"><label for="scan-language">Language:</label><select id="scan-language"><option value="TG">TG — Tagalog</option><option value="E">E — English</option></select>',
      '<label for="photo">Capture or upload photo:</label><input id="photo" type="file" accept="image/*" capture="environment">',
      '<button type="button" class="inv-btn" id="read">Scan Photo</button></div>',
      '<img id="preview" alt="Selected photo preview">',
      '<div id="status" aria-live="polite">Ready. Take a clear photo with publication codes facing the camera.</div>',
      '<div id="scan-results"></div></section>',

      '<section class="inv-card"><h2>2. Manage Publication Codes</h2>',
      '<p class="inv-muted">Register new publications and choose their category. Delete a code when it is no longer needed. Deletion clears current totals; history is retained.</p>',
      '<form id="publication-form"><div class="publication-fields">',
      '<label for="new-code">Publication code<input id="new-code" type="text" maxlength="40" placeholder="e.g. newbook1" autocomplete="off" required></label>',
      '<label for="new-category">Category<select id="new-category">' + categoryOptions + '</select></label>',
      '<button type="submit" class="inv-btn">Add / Update Code</button></div></form>',
      '<div class="inv-table-wrap"><table><thead><tr><th>Custom code</th><th>Category</th><th>Action</th></tr></thead><tbody>' + customRows + '</tbody></table></div>',
      '<p class="inv-muted">To make additions/deletions permanent for all visitors, download the updated template and replace September-Inventory.xlsx in GitHub with it.</p>',
      '<div class="inv-controls"><button type="button" class="inv-btn success" id="download-template">Download Updated Template</button></div></section>',

      '<section class="inv-card"><h2>3. Paste a Checklist Manually</h2>',
      '<div class="inv-muted">Use one line per item, like CODE - TG - 1500 + 375 or CODE - E - 25.</div>',
      '<textarea id="bulk-notepad" placeholder="Example:\nnwt - TG - 1500 + 375 + 2125\nbhs - E - 25 + 10\nS-4 - TG - 5"></textarea>',
      '<div class="inv-controls"><button type="button" class="inv-btn" id="add-bulk">Process List</button><button type="button" class="inv-btn secondary" id="clear-text">Clear text</button></div></section>',

      '<section class="inv-card"><h2>4. Monthly Reporting</h2>',
      '<div class="inv-controls"><label for="report-month">Month:</label><select id="report-month">' + monthOptions + '</select>',
      '<button type="button" class="inv-btn" id="export">Download Excel</button>',
      '<button type="button" class="inv-btn danger" id="clear">Clear entries</button></div>',
      '<p><strong>Running total:</strong> ' + total.toLocaleString() + '</p>',
      '<div class="inv-table-wrap"><table><thead><tr><th>Code</th><th>Category</th><th>Language</th><th>Total</th><th>Action</th></tr></thead><tbody>' +
      (inventoryRows || '<tr><td colspan="5">No active inventory entries yet.</td></tr>') +
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
    app = document.getElementById("app");

    if (!app) {
      app = document.createElement("main");
      app.id = "app";
      document.body.appendChild(app);
    }

    addStyles();
    render();

    // Import custom codes already included in the published template.
    loadTemplateZip().then(function (zip) {
      return getSharedStrings(zip).then(function (sharedStrings) {
        return importCustomCodesFromTemplate(zip, sharedStrings);
      });
    }).catch(function (error) {
      console.info("Template code sync skipped:", error.message);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();

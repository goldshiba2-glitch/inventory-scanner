(function () {
  "use strict";

  var inventory = {};
  var history = [];
  var ocrPromise = null;
  var zipPromise = null;
  var app = null;
  var selectedMonth = "September";
  var previewUrl = null;

  // Official publication codes
  var validCodesMaster = [
    "nwt", "nwtpkt", "bhs", "bt", "lfb", "lff", "rr", "scl",
    "sjj", "sjjls", "sjjyls", "wcg", "yp1", "yp2", "fg", "hf",
    "la", "lc", "lffi", "ll", "lmd", "mb", "rj", "wfg", "ypq",
    "jwcd1", "jwcd9", "jwcd10", "S-4", "inv",
    "t30", "t31", "t32", "t33", "t34", "t35", "t36", "t37",
    "g18.1", "g18.2", "g18.3",
    "g19.1", "g19.2", "g19.3",
    "g20.1", "g20.2", "g20.3",
    "g21.1", "g21.2", "g21.3",
    "g22.1", "g23.1", "g24.1", "g25.1",
    "wp18.1", "wp18.2", "wp18.3",
    "wp19.1", "wp19.2", "wp19.3",
    "wp20.1", "wp20.2", "wp20.3",
    "wp21.1", "wp21.2", "wp21.3",
    "wp22.1", "wp23.1", "wp24.1", "wp25.1", "wp26.1"
  ];

  var validCodes = Object.create(null);

  validCodesMaster.forEach(function (code) {
    validCodes[normalizeCode(code)] = true;
  });

  // Load previously saved inventory safely
  try {
    var savedInventory = JSON.parse(
      localStorage.getItem("inventory") || "{}"
    );

    var savedHistory = JSON.parse(
      localStorage.getItem("history") || "[]"
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
  } catch (error) {
    inventory = {};
    history = [];
  }

  var months = [
    "January", "February", "March", "April",
    "May", "June", "July", "August",
    "September", "October", "November", "December"
  ];

  // Normalize publication codes
  function normalizeCode(code) {
    code = String(code || "").trim();

    // Remove surrounding parentheses
    code = code.replace(/^\((.*)\)$/, "$1");

    code = code.toLowerCase().trim();

    // Common correction
    code = code.replace(/^llf$/, "lff");

    // Normalize t-30, T-30, etc. to t30
    if (/^t-?\d+$/.test(code)) {
      code = "t" + code.replace(/[^0-9]/g, "");
    }

    return code;
  }

  // Escape text before inserting it into HTML
  function escapeHTML(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function isCodeValid(code) {
    return !!validCodes[normalizeCode(code)];
  }

  function setStatus(message) {
    var status = document.getElementById("status");

    if (status) {
      status.textContent = message;
    }
  }

  // Save inventory and history
  function save() {
    try {
      localStorage.setItem("inventory", JSON.stringify(inventory));
      localStorage.setItem("history", JSON.stringify(history));
    } catch (error) {
      console.warn("Could not save inventory locally:", error);
    }

    render();
  }

  // Calculate expressions such as 1500 + 375 + 2125
  function calculateQuantity(expression) {
    var matches = String(expression || "").match(/\d[\d,]*/g) || [];
    var total = 0;

    matches.forEach(function (value) {
      var number = parseInt(value.replace(/,/g, ""), 10);

      if (!isNaN(number)) {
        total += number;
      }
    });

    return {
      total: total,
      valid: matches.length > 0
    };
  }

  // Accept CODE-TG-QUANTITY, CODE-E-QUANTITY,
  // CODE - TG - QUANTITY, and similar formats.
  function parseBulkLine(line) {
    var match = String(line || "").trim().match(
      /^\s*(.*?)\s*(?:[-–—]|\s+)\s*(TG|E)\s*(?:[-–—]|\s+)\s*(.*?)\s*$/i
    );

    // Also support language-first lines such as TG-NWT-100
    if (!match) {
      var alternate = String(line || "").trim().match(
        /^\s*(TG|E)\s*[-–—]\s*(.+?)\s*[-–—]\s*(.*?)\s*$/i
      );

      if (alternate) {
        match = [
          alternate[0],
          alternate[2],
          alternate[1],
          alternate[3]
        ];
      }
    }

    if (!match) {
      return null;
    }

    var code = normalizeCode(match[1]);
    var language = String(match[2]).toUpperCase();
    var quantity = calculateQuantity(match[3]);

    if (!code || !quantity.valid) {
      return null;
    }

    return {
      code: code,
      language: language,
      quantity: quantity.total
    };
  }

  // Process multiple notepad lines
  function processBulkInput() {
    var area = document.getElementById("bulk-notepad");

    if (!area) {
      return;
    }

    var lines = area.value.split(/\r?\n/);
    var processedCount = 0;
    var skippedLines = [];

    lines.forEach(function (rawLine) {
      var line = rawLine.trim();

      if (!line) {
        return;
      }

      var item = parseBulkLine(line);

      if (!item) {
        skippedLines.push(rawLine);
        return;
      }

      var key = item.language + ":" + item.code;

      inventory[key] = (Number(inventory[key]) || 0) + item.quantity;

      history.push({
        code: item.code,
        language: item.language,
        quantity: item.quantity
      });

      processedCount++;
    });

    // Render the updated inventory
    save();

    // Keep any lines that need correction instead of deleting them
    var newArea = document.getElementById("bulk-notepad");

    if (newArea) {
      newArea.value = skippedLines.join("\n");
    }

    if (skippedLines.length > 0) {
      alert(
        "Processed " + processedCount + " item(s).\n" +
        skippedLines.length +
        " line(s) could not be read. These lines remain in the notepad for correction."
      );
    } else {
      alert("Successfully processed " + processedCount + " item(s)!");
    }
  }

  // Delete a code from the inventory
  function remove(key) {
    delete inventory[key];

    history = history.filter(function (item) {
      return item.language + ":" + item.code !== key;
    });

    save();
  }

  // Clear all inventory entries
  function clearAll() {
    if (confirm("Are you sure you want to clear all inventory entries and history?")) {
      inventory = {};
      history = [];
      save();
    }
  }

  // Load external browser libraries when needed
  function loadLibrary(url, globalName) {
    if (window[globalName]) {
      return Promise.resolve(window[globalName]);
    }

    if (globalName === "Tesseract" && ocrPromise) {
      return ocrPromise;
    }

    if (globalName === "JSZip" && zipPromise) {
      return zipPromise;
    }

    var promise = new Promise(function (resolve, reject) {
      var script = document.createElement("script");

      script.src = url;
      script.async = true;

      script.onload = function () {
        if (window[globalName]) {
          resolve(window[globalName]);
        } else {
          reject(new Error(globalName + " failed to initialize."));
        }
      };

      script.onerror = function () {
        reject(new Error("Could not load " + globalName + "."));
      };

      document.head.appendChild(script);
    });

    if (globalName === "Tesseract") {
      ocrPromise = promise;
    } else if (globalName === "JSZip") {
      zipPromise = promise;
    }

    promise.catch(function () {
      if (globalName === "Tesseract") {
        ocrPromise = null;
      } else if (globalName === "JSZip") {
        zipPromise = null;
      }
    });

    return promise;
  }

  function loadOCR() {
    return loadLibrary(
      "https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js",
      "Tesseract"
    );
  }

  // Read text from an image
  function readPhoto() {
    var input = document.getElementById("photo");
    var file = input && input.files ? input.files[0] : null;
    var preview = document.getElementById("preview");

    if (!file) {
      alert("Please choose a photo first.");
      return;
    }

    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }

    previewUrl = URL.createObjectURL(file);

    if (preview) {
      preview.src = previewUrl;
      preview.style.display = "block";
    }

    setStatus("Loading photo recognition library...");

    loadOCR()
      .then(function (Tesseract) {
        return Tesseract.recognize(file, "eng", {
          logger: function (message) {
            if (message.status) {
              setStatus(
                message.status + " " +
                Math.round((message.progress || 0) * 100) + "%"
              );
            }
          }
        });
      })
      .then(function (result) {
        var text = String(
          result && result.data ? result.data.text : ""
        ).trim();

        if (!text) {
          setStatus("No text was recognized. Try a clearer photo.");
          return;
        }

        // Convert readable lines into the standard inventory format
        var recognizedItems = [];

        text.split(/\r?\n/).forEach(function (line) {
          var item = parseBulkLine(line);

          if (item) {
            recognizedItems.push(
              item.code + "-" +
              item.language + "-" +
              item.quantity
            );
          }
        });

        var area = document.getElementById("bulk-notepad");

        if (area && recognizedItems.length > 0) {
          area.value +=
            (area.value.trim() ? "\n" : "") +
            recognizedItems.join("\n");
        }

        var message = "OCR completed.\n";

        if (recognizedItems.length > 0) {
          message +=
            "Added " + recognizedItems.length +
            " recognized inventory line(s) to the notepad.\n\n";
        } else {
          message +=
            "No complete inventory lines were detected. Enter them manually after reviewing the text below.\n\n";
        }

        message += "Recognized text:\n" + text;

        setStatus(message);
      })
      .catch(function (error) {
        setStatus(
          "Photo scanning failed: " +
          error.message +
          "\nPlease enter the inventory data manually."
        );
      });
  }

  // Download a file in the browser
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

  // CSV fallback if an Excel workbook template is unavailable
  function exportCSV(month) {
    var csvRows = [["Code", "Language", "Total"]];

    Object.keys(inventory).sort().forEach(function (key) {
      var separator = key.indexOf(":");
      var language = key.substring(0, separator);
      var code = key.substring(separator + 1);

      csvRows.push([code, language, inventory[key]]);
    });

    var csv = csvRows.map(function (row) {
      return row.map(function (value) {
        return '"' + String(value).replace(/"/g, '""') + '"';
      }).join(",");
    }).join("\r\n");

    downloadBlob(
      new Blob(["\uFEFF" + csv], {
        type: "text/csv;charset=utf-8;"
      }),
      month + "-Inventory.csv"
    );
  }

  function decodeXML(value) {
    return String(value || "")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&amp;/g, "&");
  }

  // Read Excel shared strings, including rich-text cells
  function parseSharedStrings(xml) {
    var parser = new DOMParser();
    var doc = parser.parseFromString(xml, "application/xml");
    var items = doc.getElementsByTagName("si");
    var strings = [];

    for (var i = 0; i < items.length; i++) {
      var textNodes = items[i].getElementsByTagName("t");
      var value = "";

      for (var j = 0; j < textNodes.length; j++) {
        value += textNodes[j].textContent || "";
      }

      strings.push(value);
    }

    return strings;
  }

  // Read the visible value of an Excel cell
  function getCellText(cellXML, sharedStrings) {
    var typeMatch = cellXML.match(/\bt="([^"]+)"/);
    var type = typeMatch ? typeMatch[1] : "";

    var valueMatch = cellXML.match(
      /<v\b[^>]*>([\s\S]*?)<\/v>/
    );

    if (type === "s" && valueMatch) {
      var index = parseInt(valueMatch[1], 10);

      return sharedStrings[index] || "";
    }

    var textRegex = /<t\b[^>]*>([\s\S]*?)<\/t>/g;
    var textMatch;
    var text = "";

    while ((textMatch = textRegex.exec(cellXML)) !== null) {
      text += decodeXML(textMatch[1]);
    }

    if (text) {
      return text;
    }

    return valueMatch ? decodeXML(valueMatch[1]) : "";
  }

  // Replace a quantity cell while preserving its style
  function replaceQuantityCell(rowXML, rowNumber, quantity) {
    var found = false;

    var updatedRow = rowXML.replace(
      /<c\b([^>]*)>([\s\S]*?)<\/c>/g,
      function (cellXML, attributes) {
        var referenceMatch = attributes.match(/\br="([^"]+)"/);

        if (
          !referenceMatch ||
          referenceMatch[1] !== "B" + rowNumber
        ) {
          return cellXML;
        }

        found = true;

        var cleanAttributes = attributes.replace(
          /\s+t="[^"]*"/g,
          ""
        );

        return (
          "<c" + cleanAttributes + ' t="n">' +
          "<v>" + quantity + "</v>" +
          "</c>"
        );
      }
    );

    if (!found) {
      updatedRow = updatedRow.replace(
        /<\/row>\s*$/,
        '<c r="B' + rowNumber + '" t="n"><v>' +
        quantity +
        "</v></c></row>"
      );
    }

    return updatedRow;
  }

  // Update quantities on the template workbook's worksheets
  function updateWorkbook(zip) {
    var sharedFile = zip.file("xl/sharedStrings.xml");

    var stringsPromise = sharedFile
      ? sharedFile.async("string").then(parseSharedStrings)
      : Promise.resolve([]);

    var sheets = [
      {
        path: "xl/worksheets/sheet1.xml",
        language: "TG"
      },
      {
        path: "xl/worksheets/sheet2.xml",
        language: "E"
      }
    ];

    return stringsPromise.then(function (sharedStrings) {
      return Promise.all(
        sheets.map(function (sheet) {
          var file = zip.file(sheet.path);

          if (!file) {
            return Promise.resolve();
          }

          return file.async("string").then(function (xml) {
            var updatedXML = xml.replace(
              /<row\b[^>]*>[\s\S]*?<\/row>/g,
              function (rowXML) {
                var cellA = rowXML.match(
                  /<c\b([^>]*\br="A(\d+)"[^>]*)>[\s\S]*?<\/c>/
                );

                if (!cellA) {
                  return rowXML;
                }

                var rowNumber = cellA[2];
                var cellText = getCellText(
                  cellA[0],
                  sharedStrings
                );

                var codeMatch = cellText.match(/\(([^)]+)\)/);

                var code = normalizeCode(
                  codeMatch ? codeMatch[1] : cellText
                );

                // Avoid changing headings and unrelated rows
                if (!code || !isCodeValid(code)) {
                  return rowXML;
                }

                var key = sheet.language + ":" + code;
                var quantity = Number(inventory[key]) || 0;

                return replaceQuantityCell(
                  rowXML,
                  rowNumber,
                  quantity
                );
              }
            );

            zip.file(sheet.path, updatedXML);
          });
        })
      );
    });
  }

  // Export an Excel workbook using the existing template
  function exportExcel() {
    var button = document.getElementById("export");
    var monthSelect = document.getElementById("report-month");

    if (monthSelect) {
      selectedMonth = monthSelect.value;
    }

    if (!button) {
      return;
    }

    button.disabled = true;
    button.textContent = "Generating Workbook...";

    var templateName = selectedMonth + "-Inventory.xlsx";

    fetch(templateName + "?cache=" + Date.now(), {
      cache: "no-store"
    })
      .then(function (response) {
        if (!response.ok) {
          throw new Error(
            "Template workbook not found: " + templateName
          );
        }

        return response.arrayBuffer();
      })
      .then(function (buffer) {
        return loadLibrary(
          "https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js",
          "JSZip"
        ).then(function (JSZip) {
          return JSZip.loadAsync(buffer);
        });
      })
      .then(function (zip) {
        return updateWorkbook(zip).then(function () {
          return zip.generateAsync({
            type: "blob"
          });
        });
      })
      .then(function (blob) {
        downloadBlob(
          blob,
          selectedMonth + "-Inventory.xlsx"
        );

        setStatus("Excel workbook downloaded successfully.");
      })
      .catch(function (error) {
        // A CSV remains available if the template or library is missing
        exportCSV(selectedMonth);

        setStatus(
          "The Excel template could not be loaded. " +
          "A CSV file was downloaded instead. " +
          "To export XLSX, make sure " +
          selectedMonth +
          "-Inventory.xlsx is in your repository beside index.html."
        );
      })
      .then(function () {
        button.disabled = false;
        button.textContent = "Download Excel";
      });
  }

  // Build the page and render inventory data
  function render() {
    if (!app) {
      return;
    }

    var keys = Object.keys(inventory).sort();
    var totalQuantity = 0;

    keys.forEach(function (key) {
      totalQuantity += Number(inventory[key]) || 0;
    });

    var rows = keys.map(function (key) {
      var separator = key.indexOf(":");
      var language = key.substring(0, separator);
      var code = key.substring(separator + 1);
      var valid = isCodeValid(code);

      return (
        '<tr class="' + (valid ? "" : "invalid-row") + '">' +
          "<td>" + escapeHTML(code) +
            (valid ? "" : ' <span class="warning">Invalid code</span>') +
          "</td>" +
          "<td>" + escapeHTML(language) + "</td>" +
          "<td class=\"quantity\">" +
            escapeHTML(inventory[key]) +
          "</td>" +
          '<td><button type="button" class="delete-btn" data-delete="' +
            escapeHTML(key) +
          '">Delete</button></td>' +
        "</tr>"
      );
    }).join("");

    if (!rows) {
      rows = '<tr><td colspan="4" class="empty">No inventory entries yet.</td></tr>';
    }

    var historyHTML = history.map(function (item, index) {
      var valid = isCodeValid(item.code);

      return (
        '<div class="history-item ' +
          (valid ? "" : "invalid-history") +
        '">' +
          "<span>" + (index + 1) + ".</span> " +
          escapeHTML(item.code) + " - " +
          escapeHTML(item.language) + " — " +
          escapeHTML(item.quantity) +
        "</div>"
      );
    }).join("");

    if (!historyHTML) {
      historyHTML = '<p class="empty">No history available.</p>';
    }

    var monthOptions = months.map(function (month) {
      return (
        '<option value="' + month + '"' +
          (month === selectedMonth ? " selected" : "") +
        ">" + month + "</option>"
      );
    }).join("");

    app.innerHTML = `
      <style>
        #app {
          font-family: Arial, Helvetica, sans-serif;
          color: #202938;
          line-height: 1.5;
        }

        #app * {
          box-sizing: border-box;
        }

        .inventory-app {
          max-width: 1050px;
          margin: 24px auto;
          padding: 24px;
          background: #ffffff;
          border: 1px solid #e1e6ee;
          border-radius: 14px;
          box-shadow: 0 5px 22px rgba(20, 32, 50, 0.07);
        }

        .inventory-app h1 {
          margin: 0 0 6px;
          font-size: 28px;
          color: #18253b;
        }

        .subtitle {
          color: #637087;
          margin: 0 0 24px;
        }

        .panel {
          border: 1px solid #e1e6ee;
          border-radius: 10px;
          padding: 18px;
          margin-bottom: 18px;
          min-width: 0;
        }

        .panel h2 {
          margin: 0 0 12px;
          font-size: 18px;
        }

        #bulk-notepad {
          width: 100%;
          min-height: 180px;
          resize: vertical;
          padding: 12px;
          border: 1px solid #cbd5e1;
          border-radius: 8px;
          font: 14px/1.6 Consolas, monospace;
          background: #fbfcfe;
        }

        .help {
          margin: 8px 0 14px;
          font-size: 13px;
          color: #64748b;
        }

        .button-row {
          display: flex;
          flex-wrap: wrap;
          gap: 9px;
          align-items: center;
        }

        .inventory-app button {
          border: 0;
          border-radius: 7px;
          padding: 10px 15px;
          background: #245bd6;
          color: #fff;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
        }

        .inventory-app button:hover {
          filter: brightness(0.94);
        }

        .inventory-app button:disabled {
          opacity: 0.6;
          cursor: wait;
        }

        .inventory-app .secondary-btn {
          background: #e9eef6;
          color: #26344a;
        }

        .inventory-app .danger-btn,
        .inventory-app .delete-btn {
          background: #c83b43;
          color: #fff;
        }

        .inventory-app .delete-btn {
          padding: 6px 10px;
          font-size: 12px;
        }

        .stats {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 12px;
          margin-bottom: 18px;
        }

        .stat-card {
          padding: 16px;
          border: 1px solid #e1e6ee;
          border-radius: 10px;
          background: #f8faff;
        }

        .stat-label {
          display: block;
          color: #68768c;
          font-size: 13px;
        }

        .stat-value {
          display: block;
          font-size: 26px;
          font-weight: 700;
          margin-top: 4px;
        }

        .month-select {
          padding: 9px 12px;
          border: 1px solid #cbd5e1;
          border-radius: 7px;
          background: white;
          color: #202938;
          font-size: 14px;
        }

        .table-wrap {
          width: 100%;
          overflow-x: auto;
        }

        .inventory-table {
          width: 100%;
          border-collapse: collapse;
          margin-top: 10px;
          font-size: 14px;
        }

        .inventory-table th,
        .inventory-table td {
          padding: 11px 10px;
          text-align: left;
          border-bottom: 1px solid #e5eaf1;
        }

        .inventory-table th {
          background: #f1f5fb;
          font-weight: 700;
        }

        .inventory-table .quantity {
          font-weight: 700;
          font-variant-numeric: tabular-nums;
        }

        .invalid-row {
          background: #fff4f4;
          color: #a42a31;
        }

        .warning {
          display: inline-block;
          background: #c83b43;
          color: white;
          font-size: 10px;
          padding: 2px 5px;
          border-radius: 4px;
        }

        .empty {
          color: #7c8799;
          text-align: center;
          padding: 18px;
        }

        #status {
          margin-top: 14px;
          padding: 12px;
          border-radius: 7px;
          background: #f1f5fb;
          color: #36465f;
          white-space: pre-wrap;
          overflow-wrap: anywhere;
          font-size: 13px;
        }

        #preview {
          display: none;
          max-width: 100%;
          max-height: 280px;
          margin-top: 12px;
          border: 1px solid #d8dee9;
          border-radius: 8px;
          object-fit: contain;
        }

        .history-list {
          max-height: 280px;
          overflow-y: auto;
        }

        .history-item {
          padding: 8px 10px;
          border-bottom: 1px solid #edf0f5;
          overflow-wrap: anywhere;
        }

        .invalid-history {
          color: #b42f37;
        }

        @media (max-width: 600px) {
          .inventory-app {
            margin: 8px;
            padding: 14px;
          }

          .inventory-app h1 {
            font-size: 23px;
          }

          .stats {
            grid-template-columns: 1fr;
          }

          .panel {
            padding: 12px;
          }
        }
      </style>

      <main class="inventory-app">
        <h1>Inventory Scanner</h1>
        <p class="subtitle">
          Track publication inventory, calculate quantities, scan photos,
          and create monthly reports.
        </p>

        <section class="panel">
          <h2>Paste your checklist</h2>

          <textarea
            id="bulk-notepad"
            placeholder="Enter one item per line, for example:
nwt-TG-1500 + 375 + 2125
bhs-E-100 + 50
S-4-TG-25"
          ></textarea>

          <p class="help">
            Format: CODE-LANGUAGE-QUANTITY.
            Use TG or E for the language.
            Math expressions using + are calculated automatically.
          </p>

          <div class="button-row">
            <button id="add-bulk" type="button">Process List</button>
            <button id="clear" class="danger-btn" type="button">
              Clear Entries
            </button>
          </div>
        </section>

        <section class="panel">
          <h2>Read code from photo</h2>

          <div class="button-row">
            <input id="photo" type="file" accept="image/*">
            <button id="read" class="secondary-btn" type="button">
              Scan Photo
            </button>
          </div>

          <img id="preview" alt="Selected photo preview">

          <div id="status" role="status" aria-live="polite">
            Select a photo to scan, or enter your checklist manually.
          </div>
        </section>

        <div class="stats">
          <div class="stat-card">
            <span class="stat-label">Inventory entries</span>
            <span class="stat-value">${keys.length}</span>
          </div>

          <div class="stat-card">
            <span class="stat-label">Running total</span>
            <span class="stat-value">${totalQuantity.toLocaleString()}</span>
          </div>
        </div>

        <section class="panel">
          <h2>Monthly reporting</h2>

          <div class="button-row">
            <label for="report-month">Report month:</label>

            <select id="report-month" class="month-select">
              ${monthOptions}
            </select>

            <button id="export" type="button">Download Excel</button>
          </div>

          <p class="help">
            Excel export uses your existing monthly workbook template.
            A CSV file is downloaded if the template is unavailable.
          </p>
        </section>

        <section class="panel">
          <h2>Running totals</h2>

          <div class="table-wrap">
            <table class="inventory-table">
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Language</th>
                  <th>Total</th>
                  <th>Action</th>
                </tr>
              </thead>

              <tbody id="inventory-body">
                ${rows}
              </tbody>
            </table>
          </div>
        </section>

        <section class="panel">
          <h2>Inventory history</h2>
          <div class="history-list" id="history-list">
            ${historyHTML}
          </div>
        </section>
      </main>
    `;

    document.getElementById("add-bulk").addEventListener(
      "click",
      processBulkInput
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
      document.querySelectorAll("[data-delete]"),
      function (button) {
        button.addEventListener("click", function () {
          remove(button.getAttribute("data-delete"));
        });
      }
    );
  }

  // Start only after the page is ready
  function start() {
    app = document.getElementById("app");

    if (!app) {
      app = document.createElement("div");
      app.id = "app";
      document.body.appendChild(app);
    }

    render();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();

(function () {
  "use strict";

  var inventory = {};
  var history = [];
  var ocrPromise = null;

  try {
    inventory = JSON.parse(localStorage.getItem("inventory") || "{}");
    history = JSON.parse(localStorage.getItem("history") || "[]");
  } catch (error) {
    inventory = {};
    history = [];
  }

  function normalizeCode(code) {
    code = code.toLowerCase();
    if (/^t-?\d+$/.test(code)) {
      return "t" + code.replace(/[^0-9]/g, "");
    }
    return code;
  }

  function save() {
    localStorage.setItem("inventory", JSON.stringify(inventory));
    localStorage.setItem("history", JSON.stringify(history));
    render();
  }

  function addQuantity() {
    var input = document.getElementById("label");
    var match = input.value.trim().match(/^(.+?)-(TG|E)-(\d+)$/i);

    if (!match) {
      alert("Use CODE-TG-QUANTITY or CODE-E-QUANTITY");
      return;
    }

    var code = normalizeCode(match[1]);
    var language = match[2].toUpperCase();
    var quantity = Number(match[3]);
    var key = language + ":" + code;

    inventory[key] = (inventory[key] || 0) + quantity;
    history.push({ code: code, language: language, quantity: quantity });
    input.value = "";
    save();
  }

  function removeEntry(key) {
    delete inventory[key];
    history = history.filter(function (item) {
      return item.language + ":" + item.code !== key;
    });
    save();
  }

  function clearAll() {
    if (confirm("Clear all entries?")) {
      inventory = {};
      history = [];
      save();
    }
  }

  function loadOCR() {
    if (ocrPromise) return ocrPromise;

    ocrPromise = new Promise(function (resolve, reject) {
      var script = document.createElement("script");
      script.src = "https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js";
      script.onload = function () { resolve(window.Tesseract); };
      script.onerror = function () { reject(new Error("OCR library failed to load")); };
      document.head.appendChild(script);
    });

    return ocrPromise;
  }

  function readPhoto() {
    var file = document.getElementById("photo").files[0];
    var status = document.getElementById("status");
    var preview = document.getElementById("preview");

    if (!file) {
      alert("Choose a photo first");
      return;
    }

    preview.src = URL.createObjectURL(file);
    preview.style.display = "block";
    status.textContent = "Loading OCR...";

    loadOCR()
      .then(function (Tesseract) {
        return Tesseract.recognize(file, "eng", {
          logger: function (info) {
            if (info.status) {
              status.textContent =
                info.status + " " + Math.round((info.progress || 0) * 100) + "%";
            }
          },
          tessedit_pageseg_mode: 6,
          tessedit_char_whitelist:
            "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-"
        });
      })
      .then(function (result) {
        var text = result.data.text.replace(/\s+/g, " ").trim();
        status.textContent =
          "OCR result:\n" +
          text +
          "\n\nCheck the field, then tap Add quantity.";

        var match = text.match(
          /([A-Za-z]+-?\d+(?:\.\d+)?)[\s-]*(TG|E)[\s-]*(\d{1,6})/i
        );

        if (match) {
          document.getElementById("label").value =
            match[1] + "-" + match[2].toUpperCase() + "-" + match[3];
        }
      })
      .catch(function (error) {
        status.textContent =
          "OCR unavailable: " + error.message + ". Type manually instead.";
      });
  }

  function exportExcel() {
    if (typeof JSZip === "undefined") {
      alert("Excel library is not loaded. Check index.html and try again.");
      return;
    }

    fetch("September-Inventory.xlsx?cache=" + Date.now())
      .then(function (response) {
        if (!response.ok) throw new Error("September-Inventory.xlsx not found");
        return response.arrayBuffer();
      })
      .then(function (buffer) {
        return JSZip.loadAsync(buffer);
      })
      .then(function (zip) {
        var sheets = [
          ["xl/worksheets/sheet1.xml", "TG"],
          ["xl/worksheets/sheet2.xml", "E"]
        ];

        return Promise.all(
          sheets.map(function (sheet) {
            var file = zip.file(sheet[0]);
            if (!file) return Promise.resolve();

            return file.async("string").then(function (xml) {
              var documentXml = new DOMParser().parseFromString(
                xml,
                "application/xml"
              );
              var namespace =
                "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
              var cells = Array.prototype.slice.call(
                documentXml.getElementsByTagNameNS(namespace, "c")
              );

              cells.forEach(function (cell) {
                var reference = cell.getAttribute("r") || "";
                if (!/^B\d+$/.test(reference)) return;

                var row = reference.slice(1);
                var codeCell = cells.filter(function (candidate) {
                  return candidate.getAttribute("r") === "A" + row;
                })[0];

                var codeMatch = (codeCell && codeCell.textContent || "")
                  .match(/^\(([^)]+)\)/);

                if (!codeMatch) return;

                while (cell.firstChild) cell.removeChild(cell.firstChild);
                cell.setAttribute("t", "n");

                var value = documentXml.createElementNS(namespace, "v");
                value.textContent = String(
                  inventory[sheet[1] + ":" + normalizeCode(codeMatch[1])] || 0
                );
                cell.appendChild(value);
              });

              zip.file(
                sheet[0],
                new XMLSerializer().serializeToString(documentXml)
              );
            });
          })
        );
      })
      .then(function () {
        return JSZip.loadAsync(
          fetch("September-Inventory.xlsx?cache=" + Date.now()).then(function (r) {
            return r.arrayBuffer();
          })
        );
      })
      .catch(function () {
        return null;
      });

    fetch("September-Inventory.xlsx?cache=" + Date.now())
      .then(function (response) { return response.arrayBuffer(); })
      .then(function (buffer) { return JSZip.loadAsync(buffer); })
      .then(function (zip) {
        var sheets = [
          ["xl/worksheets/sheet1.xml", "TG"],
          ["xl/worksheets/sheet2.xml", "E"]
        ];

        return Promise.all(sheets.map(function (sheet) {
          var file = zip.file(sheet[0]);
          if (!file) return Promise.resolve();
          return file.async("string").then(function (xml) {
            var doc = new DOMParser().parseFromString(xml, "application/xml");
            var ns = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
            var cells = Array.prototype.slice.call(doc.getElementsByTagNameNS(ns, "c"));
            cells.forEach(function (cell) {
              var ref = cell.getAttribute("r") || "";
              if (!/^B\d+$/.test(ref)) return;
              var row = ref.slice(1);
              var a = cells.filter(function (x) { return x.getAttribute("r") === "A" + row; })[0];
              var m = (a && a.textContent || "").match(/^\(([^)]+)\)/);
              if (!m) return;
              while (cell.firstChild) cell.removeChild(cell.firstChild);
              cell.setAttribute("t", "n");
              var v = doc.createElementNS(ns, "v");
              v.textContent = String(inventory[sheet[1] + ":" + normalizeCode(m[1])] || 0);
              cell.appendChild(v);
            });
            zip.file(sheet[0], new XMLSerializer().serializeToString(doc));
          });
        }).then(function () { return zip; });
      })
      .then(function (zip) {
        return zip.generateAsync({ type: "blob" });
      })
      .then(function (blob) {
        var url = URL.createObjectURL(blob);
        var link = document.createElement("a");
        link.href = url;
        link.download = "Inventory-Updated.xlsx";
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
      })
      .catch(function (error) {
        alert("Export failed: " + error.message);
      });
  }

  function render() {
    var rows = Object.keys(inventory).map(function (key) {
      var parts = key.split(":");
      return (
        "<tr><td>" + parts[1] + "</td><td>" + parts[0] +
        "</td><td>" + inventory[key] +
        "</td><td><button data-delete=\"" + key + "\">Delete</button></td></tr>"
      );
    }).join("");

    var historyRows = history.map(function (item, index) {
      return "<div>" + (index + 1) + ". " + item.code + "-" +
        item.language + " — " + item.quantity + "</div>";
    }).join("");

    document.getElementById("app").innerHTML =
      "<h1>Inventory Scanner</h1>" +
      "<p>Type a code and quantity. Repeated entries are added together.</p>" +
      '<section class="card">' +
      '<input id="photo" type="file" accept="image/*" capture="environment">' +
      '<button class="ocr" id="read">Read code from photo</button>' +
      '<img id="preview" class="preview">' +
      '<div id="status" class="status"></div>' +
      '<div class="entry"><input id="label" placeholder="Example: T37-TG-100">' +
      '<button id="add">Add quantity</button></div>' +
      '<button id="export">Download Excel</button>' +
      '<button id="clear">Clear entries</button></section>' +
      '<section class="card"><h2>Running totals</h2><div class="scroll"><table>' +
      '<tr><th>Code</th><th>Language</th><th>Total</th><th>Action</th></tr>' +
      rows + '</table></div></section>' +
      '<section class="card"><h2>History</h2><div class="scroll history">' +
      historyRows + '</div></section>';

    document.getElementById("add").onclick = addQuantity;
    document.getElementById("read").onclick = readPhoto;
    document.getElementById("export").onclick = exportExcel;
    document.getElementById("clear").onclick = clearAll;

    Array.prototype.forEach.call(
      document.querySelectorAll("[data-delete]"),
      function (button) {

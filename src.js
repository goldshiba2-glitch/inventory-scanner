(function () {
  "use strict";

  var inventory = {};
  var history = [];
  var customPublications = {};
  var deletedPublications = {};
  var ocrPromise = null;
  var zipPromise = null;
  var selectedMonth = "September";
  var app = null;

  var publicationCategories = [
    { value: "Bibles", label: "Bibles" },
    { value: "Books", label: "Books" },
    { value: "Brochures and Booklets", label: "Brochures and Booklets" },
    { value: "Forms and Supplies", label: "Forms and Supplies" },
    { value: "Tracts", label: "Tracts" },
    { value: "Public Magazines", label: "Magazines" }
  ];

  var validCodesMaster = [
    "nwt", "nwtpkt", "bhs", "bt", "lfb", "lff", "rr", "scl",
    "sjj", "sjjls", "sjjyls", "wcg", "yp1", "yp2", "fg", "hf",
    "la", "lc", "lffi", "ll", "lmd", "mb", "rj", "wfg", "ypq",
    "jwcd1", "jwcd9", "jwcd10", "S-4", "inv",
    "t30", "t31", "t32", "t33", "t34", "t35", "t36", "t37",
    "g18.1", "g18.2", "g18.3", "g19.1", "g19.2", "g19.3",
    "g20.1", "g20.2", "g20.3", "g21.1", "g21.2", "g21.3",
    "g22.1", "g23.1", "g24.1", "g25.1",
    "wp18.1", "wp18.2", "wp18.3",
    "wp19.1", "wp19.2", "wp19.3",
    "wp20.1", "wp20.2", "wp20.3",
    "wp21.1", "wp21.2", "wp21.3",
    "wp22.1", "wp23.1", "wp24.1", "wp25.1", "wp26.1"
  ];

  var validCodes = Object.create(null);

  function normCode(code) {
    code = String(code || "")
      .toLowerCase()
      .trim()
      .replace(/\s+/g, "");

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

  function normalizeCustomRegistry(saved) {
    var result = {};

    if (
      !saved ||
      typeof saved !== "object" ||
      Array.isArray(saved)
    ) {
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
          category: validCategory(value.category)
            ? value.category
            : "Books",
          active: value.active !== false
        };
      }
    });

    return result;
  }

  function normalizeDeletedRegistry(saved) {
    var result = {};

    if (
      !saved ||
      typeof saved !== "object" ||
      Array.isArray(saved)
    ) {
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

  // Restore saved inventory, history, custom codes, and deletions.
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

  function isCustomCode(code) {
    code = normCode(code);

    return Object.prototype.hasOwnProperty.call(
      customPublications,
      code
    ) || isDeletedCode(code);
  }

  function isCodeActive(code) {
    code = normCode(code);

    if (isDeletedCode(code)) return false;
    if (validCodes[code]) return true;

    return Object.prototype.hasOwnProperty.call(
      customPublications,
      code
    ) && customPublications[code].active !== false;
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

    if (
      Object.prototype.hasOwnProperty.call(
        customPublications,
        code
      )
    ) {
      return categoryLabel(customPublications[code].category);
    }

    if (isDeletedCode(code)) {
      return categoryLabel(deletedPublications[code].category);
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

  function addStyles() {
    if (document.getElementById("inventory-scanner-styles")) {
      return;
    }

    var style = document.createElement("style");
    style.id = "inventory-scanner-styles";

    style.textContent = [
      "#app{max-width:1100px;margin:28px auto;padding:0 18px;font-family:Arial,sans-serif;color:#202124;line-height:1.45}",
      ".inv-card{background:#fff;border:1px solid #dfe3e8;border-radius:12px;padding:20px;margin:16px 0;box-shadow:0 2px 8px rgba(0,0,0,.04)}",
      ".inv-title{font-size:28px;margin:0 0 6px}",
      ".inv-muted{color:#5f6368;font-size:14px}",
      ".inv-controls{display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-top:12px}",
      ".inv-btn{border:0;border-radius:7px;padding:10px 14px;cursor:pointer;background:#155eef;color:#fff;font-weight:600}",
      ".inv-btn.secondary{background:#eef2f7;color:#202124}",
      ".inv-btn.danger{background:#b42318;color:#fff}",
      ".inv-btn.success{background:#087443;color:#fff}",
      ".inv-btn:disabled{opacity:.6;cursor:wait}",
      "#bulk-notepad{box-sizing:border-box;width:100%;min-height:190px;padding:12px;border:1px solid #c9ced6;border-radius:8px;font:14px/1.5 Consolas,monospace;resize:vertical}",
      ".inv-table-wrap{overflow:auto}",
      "table{border-collapse:collapse;width:100%;font-size:14px}",
      "th,td{text-align:left;border-bottom:1px solid #e5e7eb;padding:10px 8px}",
      "th{background:#f7f8fa}",
      "tr.invalid-code{color:#b42318;background:#fff6f5}",
      ".inv-badge{font-size:11px;background:#b42318;color:#fff;padding:2px 6px;border-radius:4px;margin-left:5px}",
      ".review-badge{font-size:11px;background:#b54708;color:#fff;padding:2px 6px;border-radius:4px;margin-left:5px}",
      ".publication-fields{display:grid;grid-template-columns:minmax(150px,1fr) minmax(180px,1fr) auto;gap:10px;align-items:end}",
      ".publication-fields label{display:block;font-size:13px;font-weight:600;color:#475467}",
      ".publication-fields input,.publication-fields select{display:block;box-sizing:border-box;width:100%;margin-top:6px;padding:10px;border:1px solid #c9ced6;border-radius:7px;background:#fff}",
      "#preview{display:none;max-width:100%;max-height:340px;margin-top:12px;border-radius:8px}",
      "#status{white-space:pre-wrap;font-size:13px;color:#475467;margin-top:10px}",
      ".inv-history{max-height:220px;overflow:auto;font-family:Consolas,monospace;font-size:13px}",
      "#scan-results{margin-top:12px}",
      "#scan-results input,#scan-results select{box-sizing:border-box;border:1px solid #c9ced6;border-radius:6px;padding:8px}",
      "@media(max-width:600px){.inv-title{font-size:23px}.inv-card{padding:14px}.publication-fields{grid-template-columns:1fr}}"
    ].join("\n");

    document.head.appendChild(style);
  }

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
      alert("Use only letters, numbers, periods, and hyphens in the code.");
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

  function deletePublicationCode(code) {
    code = normCode(code);

    if (
      !Object.prototype.hasOwnProperty.call(
        customPublications,
        code
      )
    ) {
      return;
    }

    var record = customPublications[code];

    if (!window.confirm(
      "Delete publication '" + code +
      "'? Its current inventory totals will be removed, but history will remain. " +
      "Download Updated Template to remove its row from the workbook."
    )) {
      return;
    }

    deletedPublications[code] = {
      category: record.category || "Books"
    };

    delete customPublications[code];

    Object.keys(inventory).forEach(function (key) {
      var separator = key.indexOf(":");
      var itemCode = separator >= 0
        ? key.slice(separator + 1)
        : key;

      if (normCode(itemCode) === code) {
        delete inventory[key];
      }
    });

    save();

    setStatus(
      "Deleted " + code +
      ". Current totals were removed; history was kept. " +
      "Download Updated Template to update the official workbook."
    );
  }

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

      if (!match) return null;

      language = match[1].toUpperCase();
      code = match[2].trim();
      expression = match[3].trim();
    }

    if (!code || !expression) return null;

    var numbers = expression.match(/\d[\d,]*/g) || [];

    if (!numbers.length) return null;

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

    area.value = skippedLines.join("\n");

    save();

    if (skippedLines.length) {
      alert(
        "Loaded " + processed + " line(s). " +
        skippedLines.length +
        " line(s) were skipped because of invalid formatting, an unknown code, or a deleted code. Skipped lines remain in the checklist."
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
      "Clear all inventory entries and history? Custom publication codes and deletion records will be kept."
    )) {
      return;
    }

    inventory = {};
    history = [];

    save();
  }

  // Load external browser libraries as needed.
  function loadLibrary(url, globalName, libraryName) {
    if (window[globalName]) {
      return Promise.resolve(window[globalName]);
    }

    var existingPromise = libraryName === "Tesseract"
      ? ocrPromise
      : zipPromise;

    if (existingPromise) return existingPromise;

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

  function editDistance(a, b) {
    if (Math.abs(a.length - b.length) > 2) return 99;

    var prev = [];
    var curr = [];
    var i;
    var j;

    for (j = 0; j <= b.length; j++) prev[j] = j;

    for (i = 1; i <= a.length; i++) {
      curr[0] = i;

      for (j = 1; j <= b.length; j++) {
        curr[j] = Math.min(
          curr[j - 1] + 1,
          prev[j] + 1,
          prev[j - 1] +
            (a.charAt(i - 1) === b.charAt(j - 1) ? 0 : 1)
        );
      }

      prev = curr.slice();
    }

    return prev[b.length];
  }

  function activeCodeList() {
    var list = Object.keys(validCodes).filter(function (code) {
      return isCodeActive(code);
    });

    Object.keys(customPublications).forEach(function (code) {
      if (isCodeActive(code) && list.indexOf(code) < 0) {
        list.push(code);
      }
    });

    return list;
  }

  // Only suggest a fuzzy code match when one registered code is uniquely closest.
  function resolveOCRCode(candidate) {
    candidate = normCode(candidate).replace(/[^a-z0-9.-]/g, "");

    if (!candidate) return null;

    if (isCodeActive(candidate)) {
      return {
        code: candidate,
        needsReview: false
      };
    }

    var codes = activeCodeList();
    var best = 99;
    var matches = [];

    codes.forEach(function (code) {
      var distance = editDistance(candidate, code);

      if (distance < best) {
        best = distance;
        matches = [code];
      } else if (distance === best) {
        matches.push(code);
      }
    });

    if (best === 1 && matches.length === 1 && candidate.length >= 4) {
      return {
        code: matches[0],
        needsReview: true,
        rawCode: candidate
      };
    }

    return null;
  }

  // Parse a handwritten box label, including labels where the quantity is
  // on the same line as the code or where OCR has joined nearby lines.
  function parseInventoryLabel(text, meta) {
    text = String(text || "")
      .replace(/[–—−]/g, "-")
      .replace(/[：]/g, ":")
      .trim();

    if (!text) return null;

    var langMatch =
      /(?:^|[^A-Z0-9])((?:T\s*\.?\s*G)|E)(?:\s*[-:=]\s*|\s+)([0-9][0-9,OQIl|]{0,5})\b/i.exec(text);

    if (!langMatch) return null;

    var langAt = langMatch.index +
      langMatch[0].toLowerCase().lastIndexOf(langMatch[1].toLowerCase());

    var prefix = text.slice(0, langAt)
      .replace(/[\s\-:=|]+$/g, "")
      .trim();

    var tokens = prefix.match(/[A-Za-z0-9][A-Za-z0-9.-]*/g) || [];

    if (!tokens.length) return null;

    var resolved = null;
    var maxTokens = Math.min(5, tokens.length);

    // Prefer an exact code match.
    for (var count = 1; count <= maxTokens; count++) {
      var exactCandidate = tokens.slice(-count).join("")
        .replace(/[^a-z0-9.-]/gi, "");

      exactCandidate = normCode(exactCandidate);

      if (isCodeActive(exactCandidate)) {
        resolved = {
          code: exactCandidate,
          needsReview: false
        };
        break;
      }
    }

    // If an exact match failed, try a one-character suggestion.
    if (!resolved) {
      for (var count2 = 1; count2 <= maxTokens; count2++) {
        var fuzzyCandidate = normCode(
          tokens.slice(-count2).join("")
            .replace(/[^a-z0-9.-]/gi, "")
        );

        var fuzzy = resolveOCRCode(fuzzyCandidate);

        if (fuzzy) {
          resolved = fuzzy;
          break;
        }
      }
    }

    if (!resolved) return null;

    var quantityText = langMatch[2]
      .replace(/,/g, "")
      .replace(/[OQ]/gi, "0")
      .replace(/[Il|]/g, "1");

    var quantity = parseInt(quantityText, 10);

    if (!Number.isFinite(quantity) || quantity < 0) return null;

    var langToken = langMatch[1]
      .replace(/[.\s]/g, "")
      .toUpperCase();

    var language = langToken === "TG"
      ? "TG"
      : (langToken === "E" ? "E" : null);

    if (!language) return null;

    return {
      code: resolved.code,
      language: language,
      quantity: quantity,
      needsReview: !!resolved.needsReview,
      rawCode: resolved.rawCode || "",
      confidence: meta && Number.isFinite(meta.confidence)
        ? meta.confidence
        : 0,
      x: meta && Number.isFinite(meta.x) ? meta.x : 0,
      y: meta && Number.isFinite(meta.y) ? meta.y : 0,
      quantityConflict: false
    };
  }

  function imageFromFile(file) {
    return new Promise(function (resolve, reject) {
      var image = new Image();
      var url = URL.createObjectURL(file);

      image.onload = function () {
        URL.revokeObjectURL(url);
        resolve(image);
      };

      image.onerror = function () {
        URL.revokeObjectURL(url);
        reject(new Error("The selected image could not be opened."));
      };

      image.src = url;
    });
  }

  // Resize huge camera images before processing.
  function makeBaseCanvas(image) {
    var maxDimension = 2400;
    var scale = Math.min(
      1,
      maxDimension / Math.max(image.naturalWidth, image.naturalHeight)
    );

    var canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));

    var ctx = canvas.getContext("2d", {
      willReadFrequently: true
    });

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

    return canvas;
  }

  // Make enlarged contrast and black-and-white variants of image regions.
  function makeVariant(baseCanvas, crop, mode, upscale) {
    var canvas = document.createElement("canvas");

    canvas.width = Math.max(1, Math.round(crop.w * upscale));
    canvas.height = Math.max(1, Math.round(crop.h * upscale));

    var ctx = canvas.getContext("2d", {
      willReadFrequently: true
    });

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";

    ctx.drawImage(
      baseCanvas,
      crop.x,
      crop.y,
      crop.w,
      crop.h,
      0,
      0,
      canvas.width,
      canvas.height
    );

    var imageData = ctx.getImageData(
      0, 0, canvas.width, canvas.height
    );

    var pixels = imageData.data;
    var sum = 0;
    var sampleCount = 0;
    var stride = Math.max(
      4,
      Math.floor(pixels.length / 40000 / 4) * 4
    );

    var i;

    for (i = 0; i < pixels.length; i += stride) {
      var sample = 0.299 * pixels[i] +
        0.587 * pixels[i + 1] +
        0.114 * pixels[i + 2];

      sum += sample;
      sampleCount++;
    }

    var mean = sampleCount ? sum / sampleCount : 150;
    var threshold = Math.max(92, Math.min(188, mean * 0.84));

    for (i = 0; i < pixels.length; i += 4) {
      var gray = 0.299 * pixels[i] +
        0.587 * pixels[i + 1] +
        0.114 * pixels[i + 2];

      if (mode === "threshold") {
        var bw = gray < threshold ? 0 : 255;

        pixels[i] = bw;
        pixels[i + 1] = bw;
        pixels[i + 2] = bw;
      } else {
        var enhanced = Math.max(
          0,
          Math.min(255, (gray - 126) * 1.7 + 126)
        );

        pixels[i] = enhanced;
        pixels[i + 1] = enhanced;
        pixels[i + 2] = enhanced;
      }

      pixels[i + 3] = 255;
    }

    ctx.putImageData(imageData, 0, 0);

    return canvas;
  }

  // One full-image pass plus six overlapping crop regions, each scanned twice.
  function buildOCRJobs(baseCanvas) {
    var width = baseCanvas.width;
    var height = baseCanvas.height;
    var jobs = [];

    jobs.push({
      crop: { x: 0, y: 0, w: width, h: height },
      mode: "contrast",
      upscale: Math.min(1.65, 2200 / Math.max(width, height)),
      description: "whole photo"
    });

    var columns = width >= height ? 3 : 2;
    var rows = width >= height ? 2 : 3;
    var cellW = width / columns;
    var cellH = height / rows;
    var overlapX = cellW * 0.14;
    var overlapY = cellH * 0.14;

    for (var row = 0; row < rows; row++) {
      for (var col = 0; col < columns; col++) {
        var x = Math.max(0, col * cellW - overlapX);
        var y = Math.max(0, row * cellH - overlapY);
        var right = Math.min(width, (col + 1) * cellW + overlapX);
        var bottom = Math.min(height, (row + 1) * cellH + overlapY);

        var crop = {
          x: x,
          y: y,
          w: right - x,
          h: bottom - y
        };

        var upscale = Math.min(
          2.25,
          2000 / Math.max(crop.w, crop.h)
        );

        jobs.push({
          crop: crop,
          mode: "contrast",
          upscale: upscale,
          description: "region " + (row * columns + col + 1) + " contrast"
        });

        jobs.push({
          crop: crop,
          mode: "threshold",
          upscale: upscale,
          description: "region " + (row * columns + col + 1) + " black-and-white"
        });
      }
    }

    return jobs;
  }

  function mapLineToBase(line, region, upscale, confidence) {
    var box = line && line.bbox ? line.bbox : null;

    if (!box) {
      return {
        x: region.x + region.w / 2,
        y: region.y + region.h / 2,
        left: region.x,
        right: region.x + region.w,
        top: region.y,
        bottom: region.y + region.h,
        confidence: confidence || 0
      };
    }

    return {
      x: region.x + ((box.x0 + box.x1) / 2) / upscale,
      y: region.y + ((box.y0 + box.y1) / 2) / upscale,
      left: region.x + box.x0 / upscale,
      right: region.x + box.x1 / upscale,
      top: region.y + box.y0 / upscale,
      bottom: region.y + box.y1 / upscale,
      confidence: Number.isFinite(line.confidence)
        ? line.confidence
        : (confidence || 0)
    };
  }

  function xLinesNear(a, b, regionWidth) {
    var overlap = Math.max(
      0,
      Math.min(a.right, b.right) - Math.max(a.left, b.left)
    );

    var minWidth = Math.max(
      1,
      Math.min(a.right - a.left, b.right - b.left)
    );

    var centerDiff = Math.abs(a.x - b.x);

    return overlap / minWidth > 0.12 ||
      centerDiff < Math.min(regionWidth * 0.15, 100);
  }

  // Parse separate OCR lines where the quantity appears below the code.
  function detectionsFromOCR(data, job) {
    var lines = data && Array.isArray(data.lines)
      ? data.lines
      : [];

    var fallbackConfidence = data &&
      Number.isFinite(data.confidence)
      ? data.confidence
      : 0;

    if (!lines.length) {
      lines = String(data && data.text || "")
        .split(/\r?\n/)
        .filter(Boolean)
        .map(function (text, index) {
          return {
            text: text,
            confidence: fallbackConfidence,
            bbox: {
              x0: 0,
              x1: 0,
              y0: index * 24,
              y1: index * 24 + 20
            }
          };
        });
    }

    var prepared = lines.map(function (line) {
      var position = mapLineToBase(
        line,
        job.crop,
        job.upscale,
        fallbackConfidence
      );

      position.text = String(line.text || "").trim();

      return position;
    }).filter(function (line) {
      return !!line.text;
    });

    prepared.sort(function (a, b) {
      return a.y - b.y || a.x - b.x;
    });

    var found = [];

    prepared.forEach(function (line, index) {
      var direct = parseInventoryLabel(line.text, line);

      if (direct) {
        found.push(direct);
        return;
      }

      // A handwritten label may appear as "WP26.1-TG" then "-600".
      for (
        var next = index + 1;
        next < Math.min(prepared.length, index + 3);
        next++
      ) {
        var other = prepared[next];
        var verticalGap = other.top - line.bottom;
        var maxGap = Math.max(
          22,
          Math.min(60, job.crop.h * 0.08)
        );

        if (verticalGap > maxGap) break;
        if (Math.abs(other.y - line.y) > job.crop.h * 0.12) continue;
        if (!xLinesNear(line, other, job.crop.w)) continue;

        var combined = line.text + " " + other.text;

        var joinedMeta = {
          x: (line.x + other.x) / 2,
          y: (line.y + other.y) / 2,
          confidence: Math.min(
            line.confidence || 0,
            other.confidence || 0
          )
        };

        var joined = parseInventoryLabel(combined, joinedMeta);

        if (joined) {
          found.push(joined);
          break;
        }

        if (next + 1 < prepared.length) {
          var third = prepared[next + 1];
          var gap3 = third.top - other.bottom;

          if (
            gap3 <= maxGap &&
            xLinesNear(line, third, job.crop.w)
          ) {
            var triple = parseInventoryLabel(
              line.text + " " + other.text + " " + third.text,
              joinedMeta
            );

            if (triple) {
              found.push(triple);
              break;
            }
          }
        }
      }
    });

    return found;
  }

  // Remove duplicate readings of the same physical label across overlapping
  // crops and enhancement passes, while preserving different box locations.
  function deduplicateDetections(candidates, baseWidth, baseHeight) {
    var sorted = candidates.slice().sort(function (a, b) {
      return (b.confidence || 0) - (a.confidence || 0);
    });

    var output = [];
    var tolerance = Math.max(
      28,
      Math.min(66, Math.max(baseWidth, baseHeight) * 0.027)
    );

    sorted.forEach(function (candidate) {
      var existing = null;

      for (var i = 0; i < output.length; i++) {
        var item = output[i];

        if (
          item.code !== candidate.code ||
          item.language !== candidate.language
        ) {
          continue;
        }

        var dx = item.x - candidate.x;
        var dy = item.y - candidate.y;

        if (Math.sqrt(dx * dx + dy * dy) <= tolerance) {
          existing = item;
          break;
        }
      }

      if (!existing) {
        output.push(Object.assign({}, candidate));
      } else {
        if (existing.quantity !== candidate.quantity) {
          existing.quantityConflict = true;
        }

        existing.needsReview =
          existing.needsReview && candidate.needsReview;

        existing.quantityConflict =
          existing.quantityConflict || !!candidate.quantityConflict;
      }
    });

    return output.sort(function (a, b) {
      return a.y - b.y || a.x - b.x;
    });
  }

  // Sum the quantities for every unique label with the same code and language.
  function groupDetections(detections) {
    var groups = Object.create(null);

    detections.forEach(function (item) {
      var key = item.code + "|" + item.language;

      if (!groups[key]) {
        groups[key] = {
          code: item.code,
          language: item.language,
          count: 0,
          quantity: 0,
          needsReview: false,
          quantityConflict: false
        };
      }

      groups[key].count++;
      groups[key].quantity += item.quantity;

      groups[key].needsReview =
        groups[key].needsReview || item.needsReview;

      groups[key].quantityConflict =
        groups[key].quantityConflict || !!item.quantityConflict;
    });

    return Object.keys(groups).map(function (key) {
      return groups[key];
    });
  }

  function renderScanResults(groups) {
    var results = document.getElementById("scan-results");

    if (!results) return;

    if (!groups.length) {
      results.innerHTML =
        '<p class="inv-muted">No complete registered code/language/quantity labels were detected. Try a closer, clearer photo, or add the publication code first.</p>';

      return;
    }

    results.innerHTML = [
      '<p class="inv-muted">Repeated labels with the same code and language are combined. The total is the sum of the quantity written on each unique box label. Review orange warnings and correct quantities before adding.</p>',
      '<div class="inv-table-wrap"><table><thead><tr><th>Publication code</th><th>Language</th><th>Labels detected</th><th>Combined quantity</th><th>Review</th></tr></thead><tbody>',

      groups.map(function (group, index) {
        var warning = group.needsReview || group.quantityConflict;

        var reviewText = group.quantityConflict
          ? "Conflicting OCR totals — check"
          : (group.needsReview ? "Check suggested code" : "Looks good");

        return '<tr data-scan-row="' + index + '">' +
          '<td><input class="scan-code-input" type="text" value="' +
          escapeHtml(group.code) +
          '" aria-label="Detected publication code ' + (index + 1) +
          '" style="width:105px"></td>' +

          '<td><select class="scan-language-input" aria-label="Detected language ' +
          (index + 1) + '">' +
          '<option value="TG"' +
          (group.language === "TG" ? " selected" : "") + '>TG</option>' +
          '<option value="E"' +
          (group.language === "E" ? " selected" : "") + '>E</option>' +
          '</select></td>' +

          '<td>' + group.count + '</td>' +

          '<td><input class="scan-quantity" type="number" min="0" step="1" value="' +
          group.quantity +
          '" aria-label="Combined quantity ' + (index + 1) +
          '" style="width:125px"></td>' +

          '<td>' +
          (warning
            ? '<span class="review-badge">' + escapeHtml(reviewText) + '</span>'
            : escapeHtml(reviewText)) +
          '</td>' +
          '</tr>';
      }).join(""),

      '</tbody></table></div>',
      '<div class="inv-controls"><button type="button" class="inv-btn success" id="add-scanned-results">Add reviewed totals to inventory</button></div>'
    ].join("");

    document.getElementById("add-scanned-results").addEventListener(
      "click",
      addScannedResults
    );
  }

  function addScannedResults() {
    var rows = document.querySelectorAll("[data-scan-row]");
    var added = 0;
    var skipped = 0;

    Array.prototype.forEach.call(rows, function (row) {
      var codeInput = row.querySelector(".scan-code-input");
      var languageInput = row.querySelector(".scan-language-input");
      var quantityInput = row.querySelector(".scan-quantity");

      var code = normCode(codeInput && codeInput.value);
      var language = languageInput ? languageInput.value : "TG";
      var quantity = quantityInput
        ? Number(quantityInput.value)
        : 0;

      if (
        !isCodeActive(code) ||
        (language !== "TG" && language !== "E") ||
        !Number.isFinite(quantity) ||
        quantity <= 0
      ) {
        skipped++;
        return;
      }

      var key = language + ":" + code;

      inventory[key] =
        (Number(inventory[key]) || 0) + quantity;

      history.push({
        code: code,
        language: language,
        quantity: quantity
      });

      added++;
    });

    if (!added) {
      alert(
        "No valid quantities were added. Check the publication codes and enter quantities greater than zero."
      );
      return;
    }

    save();

    setStatus(
      "Added " + added +
      " combined code/language total(s) to inventory." +
      (skipped ? " Skipped " + skipped + " invalid row(s)." : "") +
      " Repeated box labels were summed before adding."
    );
  }

  function readPhoto() {
    var input = document.getElementById("photo");
    var file = input && input.files ? input.files[0] : null;
    var preview = document.getElementById("preview");
    var button = document.getElementById("read");

    if (!file) {
      alert("Capture or choose a photo of the handwritten box labels first.");
      return;
    }

    if (preview.dataset.objectUrl) {
      URL.revokeObjectURL(preview.dataset.objectUrl);
    }

    preview.dataset.objectUrl = URL.createObjectURL(file);
    preview.src = preview.dataset.objectUrl;
    preview.style.display = "block";

    button.disabled = true;

    var results = document.getElementById("scan-results");
    if (results) results.innerHTML = "";

    setStatus("Opening photo and preparing enhanced image regions...");

    imageFromFile(file).then(function (image) {
      var base = makeBaseCanvas(image);
      var jobs = buildOCRJobs(base);

      return loadOCR().then(function (Tesseract) {
        if (typeof Tesseract.createWorker !== "function") {
          throw new Error(
            "OCR worker initialization is unavailable. Refresh and try again."
          );
        }

        var candidates = [];
        var rawText = [];

        return Tesseract.createWorker("eng", 1, {
          logger: function (message) {
            if (message && message.status) {
              setStatus(
                "OCR engine: " + message.status +
                (typeof message.progress === "number"
                  ? " " + Math.round(message.progress * 100) + "%"
                  : "")
              );
            }
          }
        }).then(function (worker) {
          var jobIndex = 0;

          function runNextJob() {
            if (jobIndex >= jobs.length) {
              return Promise.resolve();
            }

            var job = jobs[jobIndex++];

            setStatus(
              "Enhancing and scanning " + job.description +
              " (" + jobIndex + " of " + jobs.length + ")..."
            );

            var variant = makeVariant(
              base,
              job.crop,
              job.mode,
              job.upscale
            );

            var psm = job.mode === "threshold" ? "6" : "11";

            return worker.setParameters({
              tessedit_pageseg_mode: psm,
              preserve_interword_spaces: "1",
              user_defined_dpi: "300"
            }).then(function () {
              return worker.recognize(variant);
            }).then(function (result) {
              var data = result && result.data ? result.data : {};

              if (data.text) rawText.push(data.text);

              var found = detectionsFromOCR(data, {
                crop: job.crop,
                upscale: job.upscale,
                description: job.description
              });

              candidates = candidates.concat(found);

              // Release the pixel buffer from the current variant.
              variant.width = 1;
              variant.height = 1;

              return runNextJob();
            });
          }

          return runNextJob().then(function () {
            return worker.terminate().then(function () {
              var uniqueDetections = deduplicateDetections(
                candidates,
                base.width,
                base.height
              );

              var groups = groupDetections(uniqueDetections);

              renderScanResults(groups);

              var labelCount = uniqueDetections.length;

              var qtySum = uniqueDetections.reduce(function (sum, item) {
                return sum + item.quantity;
              }, 0);

              var excerpt = rawText.join("\n--- OCR pass ---\n").slice(0, 2600);

              setStatus(
                "Scan finished: " + labelCount +
                " unique handwritten label(s), grouped into " +
                groups.length + " code/language total(s). Detected quantities sum to " +
                qtySum + ". Review the table before adding.\n\nOCR text excerpt:\n" +
                excerpt
              );
            });
          }).catch(function (error) {
            return worker.terminate().catch(function () {}).then(function () {
              throw error;
            });
          });
        });
      });
    }).catch(function (error) {
      setStatus(
        "Photo scan failed: " + error.message +
        "\nTry a closer, brighter photo with the marker codes visible."
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
      var doc = new DOMParser().parseFromString(xml, "application/xml");
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

  function importCustomCodesFromTemplate(zip, sharedStrings) {
    var file = zip.file("xl/worksheets/sheet1.xml");

    if (!file) return Promise.resolve(false);

    return file.async("string").then(function (xml) {
      var doc = new DOMParser().parseFromString(xml, "application/xml");
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

        if (!code || validCodes[code] || isCustomCode(code)) {
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
      var match = (cell.getAttribute("r") || "").match(/^([A-Z]+)\d+$/);

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

  function updateWorksheet(xml, language, sharedStrings, mode) {
    var doc = new DOMParser().parseFromString(xml, "application/xml");

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
      return importCustomCodesFromTemplate(zip, sharedStrings).then(function () {
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
              updateWorksheet(xml, sheet.language, sharedStrings, mode)
            );
          });
        })).then(function () {
          return zip;
        });
      });
    });
  }

  function exportExcel() {
    var monthSelect = document.getElementById("report-month");
    var button = document.getElementById("export");

    selectedMonth = monthSelect ? monthSelect.value : selectedMonth;

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
      downloadBlob(blob, selectedMonth + "-Inventory.xlsx");

      setStatus(
        "Downloaded " + selectedMonth +
        "-Inventory.xlsx with current active inventory quantities."
      );
    }).catch(function (error) {
      console.warn("Excel export failed; downloading CSV instead.", error);

      downloadCSV(selectedMonth);

      setStatus(
        "The formatted workbook could not be created. A CSV backup was downloaded. " +
        "Check that September-Inventory.xlsx is in the published repository."
      );
    }).then(function () {
      if (button) {
        button.disabled = false;
        button.textContent = "Download Excel";
      }
    });
  }

  function downloadUpdatedTemplate() {
    if (!window.confirm(
      "Create an updated template copy? Active custom codes will be included, " +
      "deleted custom codes removed, and all quantities reset to zero. " +
      "This downloads a file; it does not directly modify GitHub."
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
        "Updated template downloaded. To make changes permanent for all users, " +
        "replace September-Inventory.xlsx in your GitHub repository with this file, " +
        "renamed to September-Inventory.xlsx."
      );
    }).catch(function (error) {
      console.error("Template update failed.", error);

      setStatus("Could not create the updated template: " + error.message);

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
        "</td><td>" + escapeHtml(categoryLabel(record.category)) +
        '</td><td><button type="button" class="inv-btn danger" data-delete-code="' +
        escapeHtml(code) + '">Delete</button></td></tr>';
    }).join("") ||
      '<tr><td colspan="3" class="inv-muted">No custom publication codes registered yet.</td></tr>';

    var keys = Object.keys(inventory).filter(function (key) {
      var separator = key.indexOf(":");
      var code = separator >= 0 ? key.slice(separator + 1) : key;

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

      return '<div' +
        (deleted ? ' style="color:#667085"' : "") +
        ">" + (index + 1) + ". " +
        escapeHtml(item.code) + " - " +
        escapeHtml(item.language) + " — " +
        escapeHtml(item.quantity) +
        (deleted ? " (publication deleted; history kept)" : "") +
        "</div>";
    }).join("");

    var total = keys.reduce(function (sum, key) {
      return sum + (Number(inventory[key]) || 0);
    }, 0);

    app.innerHTML = [
      '<section class="inv-card"><h1 class="inv-title">Inventory Scanner</h1><div class="inv-muted">Scan handwritten publication codes on groups of boxes, process checklists, and prepare reports.</div></section>',

      '<section class="inv-card"><h2>1. Scan Publication</h2><p class="inv-muted">Take a photo with handwritten box labels in view. The scanner enlarges overlapping regions, tries enhanced and black-and-white versions, groups repeat labels, and sums quantities. Review the result before adding.</p>',
      '<div class="inv-controls"><label for="photo">Capture or upload photo:</label><input id="photo" type="file" accept="image/*" capture="environment"><button type="button" class="inv-btn" id="read">Scan Photo</button></div>',
      '<img id="preview" alt="Selected photo preview"><div id="status" aria-live="polite">Ready. Use a clear photo where handwritten code, language, and quantity are visible.</div><div id="scan-results"></div></section>',

      '<section class="inv-card"><h2>2. Paste a Checklist</h2><div class="inv-muted">Use one line per item, like CODE - TG - 1500 + 375 or CODE - E - 25.</div>',
      '<textarea id="bulk-notepad" placeholder="Example:\nnwt - TG - 1500 + 375 + 2125\nbhs - E - 25 + 10\nS-4 - TG - 5"></textarea>',
      '<div class="inv-controls"><button type="button" class="inv-btn" id="add-bulk">Process List</button><button type="button" class="inv-btn secondary" id="clear-text">Clear Text</button></div></section>',

      '<section class="inv-card"><h2>3. Manage Publication Codes</h2><p class="inv-muted">Add new publications and choose their category. Delete custom publications when no longer required.</p>',
      '<form id="publication-form"><div class="publication-fields"><label for="new-code">Publication Code<input id="new-code" type="text" maxlength="40" placeholder="e.g. newbook1" autocomplete="off" required></label>',
      '<label for="new-category">Category<select id="new-category">' + categoryOptions + '</select></label><button type="submit" class="inv-btn">Add / Update Code</button></div></form>',
      '<div class="inv-table-wrap"><table><thead><tr><th>Custom Code</th><th>Category</th><th>Action</th></tr></thead><tbody>' + customRows + '</tbody></table></div>',
      '<p class="inv-muted">To make changes permanent for everyone, download the updated template and replace September-Inventory.xlsx in GitHub with it.</p><div class="inv-controls"><button type="button" class="inv-btn success" id="download-template">Download Updated Template</button></div></section>',

      '<section class="inv-card"><h2>4. History</h2><div class="inv-history">' +
        (historyRows || '<div class="inv-muted">No history yet.</div>') +
      '</div></section>',

      '<section class="inv-card"><h2>5. Monthly Reporting</h2><div class="inv-controls"><label for="report-month">Reporting Month:</label><select id="report-month">' + monthOptions + '</select>',
      '<button type="button" class="inv-btn" id="export">Download Excel</button><button type="button" class="inv-btn danger" id="clear">Clear Entries</button></div>',
      '<p><strong>Running Total:</strong> ' + total.toLocaleString() + '</p><div class="inv-table-wrap"><table><thead><tr><th>Code</th><th>Category</th><th>Language</th><th>Total</th><th>Action</th></tr></thead><tbody>' +
        (inventoryRows || '<tr><td colspan="5">No active inventory entries yet.</td></tr>') +
      '</tbody></table></div></section>'
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

    // Import custom codes from the official template if available.
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

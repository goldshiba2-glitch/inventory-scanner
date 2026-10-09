(function () {
  "use strict";

  var inventory = {};
  var history = [];
  var customPublications = {};
  var deletedPublications = {};
  var ocrPromise = null;
  var workerPromise = null;
  var zipPromise = null;
  var cameraStream = null;
  var scanning = false;
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
    "nwt", "nwtpkt", "bhs", "bt", "lfb", "lff", "rr", "scl", "sjj", "sjjls",
    "sjjyls", "wcg", "yp1", "yp2", "fg", "hf", "la", "lc", "lffi", "ll",
    "lmd", "mb", "rj", "wfg", "ypq", "jwcd1", "jwcd9", "jwcd10", "S-4", "inv",
    "t30", "t31", "t32", "t33", "t34", "t35", "t36", "t37",
    "g18.1", "g18.2", "g18.3", "g19.1", "g19.2", "g19.3",
    "g20.1", "g20.2", "g20.3", "g21.1", "g21.2", "g21.3",
    "g22.1", "g23.1", "g24.1", "g25.1",
    "wp18.1", "wp18.2", "wp18.3", "wp19.1", "wp19.2", "wp19.3",
    "wp20.1", "wp20.2", "wp20.3", "wp21.1", "wp21.2", "wp21.3",
    "wp22.1", "wp23.1", "wp24.1", "wp25.1", "wp26.1"
  ];

  var validCodes = Object.create(null);
  validCodesMaster.forEach(function (code) {
    validCodes[normCode(code)] = true;
  });

  function normCode(code) {
    code = String(code || "").toLowerCase().trim().replace(/\s+/g, "");
    code = code.replace(/^llf$/, "lff");

    if (/^t-?\d+$/.test(code)) {
      code = "t" + code.replace(/\D/g, "");
    }

    return code;
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function validCategory(category) {
    return publicationCategories.some(function (item) {
      return item.value === category;
    });
  }

  function normalizeCustom(saved) {
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

  function normalizeDeleted(saved) {
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

  try {
    var si = JSON.parse(localStorage.getItem("inventory") || "{}");
    var sh = JSON.parse(localStorage.getItem("history") || "[]");
    var sc = JSON.parse(localStorage.getItem("customPublications") || "{}");
    var sd = JSON.parse(localStorage.getItem("deletedPublications") || "{}");

    if (si && typeof si === "object" && !Array.isArray(si)) {
      inventory = si;
    }

    if (Array.isArray(sh)) {
      history = sh;
    }

    customPublications = normalizeCustom(sc);
    deletedPublications = normalizeDeleted(sd);
  } catch (e) {
    inventory = {};
    history = [];
    customPublications = {};
    deletedPublications = {};
  }

  function isDeleted(code) {
    return Object.prototype.hasOwnProperty.call(
      deletedPublications,
      normCode(code)
    );
  }

  function isCustom(code) {
    code = normCode(code);

    return Object.prototype.hasOwnProperty.call(customPublications, code) ||
      isDeleted(code);
  }

  function isActive(code) {
    code = normCode(code);

    if (isDeleted(code)) return false;
    if (validCodes[code]) return true;

    return Object.prototype.hasOwnProperty.call(customPublications, code) &&
      customPublications[code].active !== false;
  }

  function isCodeValid(code) {
    return isActive(code);
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

    if (customPublications[code]) {
      return categoryLabel(customPublications[code].category);
    }

    if (deletedPublications[code]) {
      return categoryLabel(deletedPublications[code].category);
    }

    return validCodes[code] ? "Standard publication" : "Uncategorized";
  }

  function setStatus(message) {
    var el = document.getElementById("status");
    if (el) el.textContent = message;
  }

  function addStyles() {
    if (document.getElementById("inventory-scanner-styles")) return;

    var style = document.createElement("style");
    style.id = "inventory-scanner-styles";

    style.textContent = [
      "#app{max-width:1100px;margin:24px auto;padding:0 16px;font-family:Arial,sans-serif;color:#202124;line-height:1.45}",
      ".inv-card{background:#fff;border:1px solid #dfe3e8;border-radius:12px;padding:18px;margin:16px 0;box-shadow:0 2px 8px rgba(0,0,0,.04)}",
      ".inv-title{font-size:28px;margin:0 0 6px}.inv-muted{color:#5f6368;font-size:14px}",
      ".inv-controls{display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-top:12px}",
      ".inv-btn{border:0;border-radius:7px;padding:10px 14px;cursor:pointer;background:#155eef;color:#fff;font-weight:600}",
      ".inv-btn.secondary{background:#eef2f7;color:#202124}.inv-btn.danger{background:#b42318;color:#fff}.inv-btn.success{background:#087443;color:#fff}.inv-btn:disabled{opacity:.55;cursor:wait}",
      ".inv-table-wrap{overflow:auto}table{border-collapse:collapse;width:100%;font-size:14px}th,td{text-align:left;border-bottom:1px solid #e5e7eb;padding:9px 8px}th{background:#f7f8fa}",
      ".publication-fields{display:grid;grid-template-columns:minmax(150px,1fr) minmax(180px,1fr) auto;gap:10px;align-items:end}.publication-fields label{display:block;font-size:13px;font-weight:600;color:#475467}",
      ".publication-fields input,.publication-fields select{box-sizing:border-box;display:block;width:100%;margin-top:6px;padding:10px;border:1px solid #c9ced6;border-radius:7px;background:#fff}",
      "#camera-video{display:block;width:100%;max-height:65vh;min-height:220px;object-fit:contain;background:#111;border-radius:10px;margin-top:12px}#camera-video[hidden]{display:none}",
      "#preview{display:none;max-width:100%;max-height:320px;margin-top:12px;border-radius:8px}",
      "#status{white-space:pre-wrap;font-size:13px;color:#475467;margin-top:10px}.inv-history{max-height:220px;overflow:auto;font-family:Consolas,monospace;font-size:13px}",
      "#scan-results{margin-top:12px}#scan-results input,#scan-results select{box-sizing:border-box;border:1px solid #c9ced6;border-radius:6px;padding:8px}",
      ".review-badge{font-size:11px;background:#b54708;color:#fff;padding:2px 6px;border-radius:4px}",
      "@media(max-width:600px){.inv-title{font-size:23px}.inv-card{padding:13px}.publication-fields{grid-template-columns:1fr}.inv-btn{min-height:42px}}"
    ].join("\n");

    document.head.appendChild(style);
  }

  function save() {
    try {
      localStorage.setItem("inventory", JSON.stringify(inventory));
      localStorage.setItem("history", JSON.stringify(history));
      localStorage.setItem("customPublications", JSON.stringify(customPublications));
      localStorage.setItem("deletedPublications", JSON.stringify(deletedPublications));
    } catch (error) {
      console.warn("Could not save inventory in this browser.", error);
    }

    render();
  }

  function addPublicationCode(event) {
    event.preventDefault();

    var code = normCode(document.getElementById("new-code").value);
    var category = document.getElementById("new-category").value;

    if (!code) return alert("Enter a publication code first.");

    if (!/^[a-z0-9][a-z0-9.-]*$/.test(code)) {
      return alert("Use only letters, numbers, periods, and hyphens in the code.");
    }

    if (validCodes[code] && !isCustom(code)) {
      return alert("That code already exists in the standard list.");
    }

    if (!validCategory(category)) {
      return alert("Choose a valid category.");
    }

    delete deletedPublications[code];

    customPublications[code] = {
      category: category,
      active: true
    };

    save();
    setStatus("Saved custom publication " + code + " under " + categoryLabel(category) + ".");
  }

  function deletePublicationCode(code) {
    code = normCode(code);

    if (!customPublications[code]) return;

    if (!confirm(
      "Delete " + code +
      "? Its current totals will be removed, but history will remain. " +
      "Download the updated template to remove its row from the workbook."
    )) {
      return;
    }

    deletedPublications[code] = {
      category: customPublications[code].category || "Books"
    };

    delete customPublications[code];

    Object.keys(inventory).forEach(function (key) {
      var p = key.indexOf(":");

      if (normCode(p >= 0 ? key.slice(p + 1) : key) === code) {
        delete inventory[key];
      }
    });

    save();
    setStatus("Deleted " + code + ". History was kept. Download Updated Template to publish this change in the workbook.");
  }

  function parseBulkLine(line) {
    var m = String(line || "").match(
      /^\s*(.*?)\s*-\s*(TG|E)\s*-\s*(.*?)\s*$/i
    );

    if (!m) return null;

    var numbers = m[3].match(/\d[\d,]*/g) || [];
    if (!numbers.length) return null;

    return {
      code: normCode(m[1]),
      language: m[2].toUpperCase(),
      quantity: numbers.reduce(function (sum, v) {
        return sum + (parseInt(v.replace(/,/g, ""), 10) || 0);
      }, 0)
    };
  }

  function processBulkInput() {
    var area = document.getElementById("bulk-notepad");
    if (!area) return;

    var processed = 0;
    var skipped = [];

    area.value.split(/\r?\n/).forEach(function (line) {
      if (!line.trim()) return;

      var item = parseBulkLine(line);

      if (!item || !isActive(item.code)) {
        skipped.push(line);
        return;
      }

      var key = item.language + ":" + item.code;

      inventory[key] = (Number(inventory[key]) || 0) + item.quantity;

      history.push({
        code: item.code,
        language: item.language,
        quantity: item.quantity
      });

      processed++;
    });

    area.value = skipped.join("\n");
    save();

    alert(
      "Processed " + processed + " line(s)." +
      (skipped.length ? " " + skipped.length + " unprocessed line(s) remain in the checklist." : "")
    );
  }

  function removeInventory(key) {
    delete inventory[key];

    history = history.filter(function (item) {
      return item.language + ":" + item.code !== key;
    });

    save();
  }

  function clearAll() {
    if (!confirm("Clear all inventory entries and history? Custom publication definitions will remain.")) {
      return;
    }

    inventory = {};
    history = [];
    save();
  }

  function loadLibrary(url, globalName, which) {
    if (window[globalName]) {
      return Promise.resolve(window[globalName]);
    }

    var existing = which === "ocr" ? ocrPromise : zipPromise;
    if (existing) return existing;

    var promise = new Promise(function (resolve, reject) {
      var script = document.createElement("script");
      script.src = url;
      script.async = true;

      script.onload = function () {
        if (window[globalName]) resolve(window[globalName]);
        else reject(new Error(globalName + " failed to initialize."));
      };

      script.onerror = function () {
        reject(new Error("Could not load " + globalName + "."));
      };

      document.head.appendChild(script);
    }).catch(function (error) {
      if (which === "ocr") ocrPromise = null;
      else zipPromise = null;

      workerPromise = null;
      throw error;
    });

    if (which === "ocr") ocrPromise = promise;
    else zipPromise = promise;

    return promise;
  }

  function loadOCR() {
    return loadLibrary(
      "https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js",
      "Tesseract",
      "ocr"
    );
  }

  function loadJSZip() {
    return loadLibrary(
      "https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js",
      "JSZip",
      "zip"
    );
  }

  function getOCRWorker() {
    if (workerPromise) return workerPromise;

    workerPromise = loadOCR().then(function (Tesseract) {
      return Tesseract.createWorker("eng", 1, {
        logger: function (message) {
          if (message && message.status && scanning) {
            setStatus(
              "OCR engine: " + message.status +
              (typeof message.progress === "number"
                ? " " + Math.round(message.progress * 100) + "%"
                : "")
            );
          }
        }
      });
    }).catch(function (error) {
      workerPromise = null;
      throw error;
    });

    return workerPromise;
  }

  function editDistance(a, b) {
    if (Math.abs(a.length - b.length) > 1) return 99;

    var prev = [], curr = [], i, j;

    for (j = 0; j <= b.length; j++) prev[j] = j;

    for (i = 1; i <= a.length; i++) {
      curr[0] = i;

      for (j = 1; j <= b.length; j++) {
        curr[j] = Math.min(
          curr[j - 1] + 1,
          prev[j] + 1,
          prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
        );
      }

      prev = curr.slice();
    }

    return prev[b.length];
  }

  function activeCodes() {
    var result = Object.keys(validCodes).filter(isActive);

    Object.keys(customPublications).forEach(function (code) {
      if (isActive(code) && result.indexOf(code) < 0) {
        result.push(code);
      }
    });

    return result.sort(function (a, b) {
      return b.length - a.length;
    });
  }

  function resolveCode(candidate) {
    candidate = normCode(candidate).replace(/[^a-z0-9.-]/g, "");

    if (isActive(candidate)) {
      return { code: candidate, needsReview: false };
    }

    var codes = activeCodes();
    var best = 99;
    var matches = [];

    codes.forEach(function (code) {
      var d = editDistance(candidate, code);

      if (d < best) {
        best = d;
        matches = [code];
      } else if (d === best) {
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

  // Parse handwritten labels such as WP26.1-TG-600, G18.2-E-500, NWT-TG-16.
  function parseLabel(text, meta) {
    text = String(text || "")
      .replace(/[–—−]/g, "-")
      .replace(/[：]/g, ":")
      .trim();

    if (!text) return null;

    var langRe = /(^|[^A-Za-z0-9])(TG|T6|E)(?=$|[^A-Za-z0-9])/i;
    var lm = langRe.exec(text);

    if (!lm) return null;

    var langAt = lm.index + lm[1].length;
    var langToken = lm[2].toUpperCase();
    var language = (langToken === "TG" || langToken === "T6") ? "TG" : "E";

    var prefix = text.slice(0, langAt)
      .replace(/[\s\-:=|]+$/g, "")
      .trim();

    var tokens = prefix.match(/[A-Za-z0-9]+(?:[.-][A-Za-z0-9]+)*/g) || [];
    if (!tokens.length) return null;

    var resolved = null;

    for (var c = 1; c <= Math.min(4, tokens.length); c++) {
      var candidate = normCode(tokens.slice(-c).join(""));

      if (isActive(candidate)) {
        resolved = { code: candidate, needsReview: false };
        break;
      }
    }

    if (!resolved) {
      for (var f = 1; f <= Math.min(4, tokens.length); f++) {
        var fuzzy = resolveCode(tokens.slice(-f).join(""));

        if (fuzzy) {
          resolved = fuzzy;
          break;
        }
      }
    }

    if (!resolved) return null;

    var afterLang = text.slice(langAt + lm[2].length);
    var qm = /(?:^|[\s:=\-|])([0-9][0-9,OoQqIl|]{0,7})\b/.exec(afterLang);

    if (!qm) return null;

    var quantityText = qm[1]
      .replace(/,/g, "")
      .replace(/[OoQq]/g, "0")
      .replace(/[Il|]/g, "1");

    var quantity = parseInt(quantityText, 10);
    if (!Number.isFinite(quantity) || quantity < 0) return null;

    return {
      code: resolved.code,
      language: language,
      quantity: quantity,
      needsReview: !!resolved.needsReview,
      confidence: meta && Number.isFinite(meta.confidence) ? meta.confidence : 0,
      x: meta && Number.isFinite(meta.x) ? meta.x : 0,
      y: meta && Number.isFinite(meta.y) ? meta.y : 0,
      left: meta && Number.isFinite(meta.left) ? meta.left : 0,
      right: meta && Number.isFinite(meta.right) ? meta.right : 0,
      top: meta && Number.isFinite(meta.top) ? meta.top : 0,
      bottom: meta && Number.isFinite(meta.bottom) ? meta.bottom : 0,
      quantityConflict: false
    };
  }

  function makeBaseCanvas(source) {
    var sourceW = source.videoWidth || source.naturalWidth || source.width;
    var sourceH = source.videoHeight || source.naturalHeight || source.height;

    if (!sourceW || !sourceH) {
      throw new Error("Camera frame is not ready. Wait a moment and try again.");
    }

    var scale = Math.min(1, 2400 / Math.max(sourceW, sourceH));
    var canvas = document.createElement("canvas");

    canvas.width = Math.max(1, Math.round(sourceW * scale));
    canvas.height = Math.max(1, Math.round(sourceH * scale));

    var ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(source, 0, 0, canvas.width, canvas.height);

    return canvas;
  }

  function enhanceCrop(base, crop, mode, scale) {
    var canvas = document.createElement("canvas");

    canvas.width = Math.max(1, Math.round(crop.w * scale));
    canvas.height = Math.max(1, Math.round(crop.h * scale));

    var ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";

    ctx.drawImage(
      base, crop.x, crop.y, crop.w, crop.h,
      0, 0, canvas.width, canvas.height
    );

    var imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    var p = imageData.data, samples = 0, sum = 0;

    for (var i = 0; i < p.length; i += 160) {
      sum += 0.299 * p[i] + 0.587 * p[i + 1] + 0.114 * p[i + 2];
      samples++;
    }

    var mean = samples ? sum / samples : 150;
    var threshold = Math.max(90, Math.min(190, mean * 0.85));

    for (var j = 0; j < p.length; j += 4) {
      var gray = 0.299 * p[j] + 0.587 * p[j + 1] + 0.114 * p[j + 2];

      if (mode === "bw") {
        var bw = gray < threshold ? 0 : 255;
        p[j] = p[j + 1] = p[j + 2] = bw;
      } else {
        var enhanced = Math.max(0, Math.min(255, (gray - 122) * 1.65 + 128));
        p[j] = p[j + 1] = p[j + 2] = enhanced;
      }

      p[j + 3] = 255;
    }

    ctx.putImageData(imageData, 0, 0);
    return canvas;
  }

  function makeOCRJobs(base) {
    var w = base.width, h = base.height;

    var jobs = [{
      crop: { x: 0, y: 0, w: w, h: h },
      mode: "contrast",
      scale: Math.min(1.4, 2200 / Math.max(w, h)),
      name: "whole frame"
    }];

    var cols = w >= h ? 3 : 2;
    var rows = w >= h ? 2 : 3;
    var cw = w / cols, ch = h / rows;
    var ox = cw * 0.12, oy = ch * 0.12;

    for (var r = 0; r < rows; r++) {
      for (var c = 0; c < cols; c++) {
        var x = Math.max(0, c * cw - ox);
        var y = Math.max(0, r * ch - oy);
        var right = Math.min(w, (c + 1) * cw + ox);
        var bottom = Math.min(h, (r + 1) * ch + oy);
        var crop = { x: x, y: y, w: right - x, h: bottom - y };
        var scale = Math.min(2, 1800 / Math.max(crop.w, crop.h));

        jobs.push({
          crop: crop,
          mode: "contrast",
          scale: scale,
          name: "region " + (r * cols + c + 1)
        });

        jobs.push({
          crop: crop,
          mode: "bw",
          scale: scale,
          name: "region " + (r * cols + c + 1) + " black-and-white"
        });
      }
    }

    return jobs;
  }

  function positionLine(line, job, confidence) {
    var b = line && line.bbox ? line.bbox : null;

    if (!b) {
      return {
        x: job.crop.x + job.crop.w / 2,
        y: job.crop.y + job.crop.h / 2,
        confidence: confidence || 0
      };
    }

    return {
      x: job.crop.x + (b.x0 + b.x1) / 2 / job.scale,
      y: job.crop.y + (b.y0 + b.y1) / 2 / job.scale,
      left: job.crop.x + b.x0 / job.scale,
      right: job.crop.x + b.x1 / job.scale,
      top: job.crop.y + b.y0 / job.scale,
      bottom: job.crop.y + b.y1 / job.scale,
      confidence: Number.isFinite(line.confidence) ? line.confidence : (confidence || 0)
    };
  }

  function parseLines(lines, job, pageConfidence) {
    var normalized = lines.map(function (line) {
      var pos = positionLine(line, job, pageConfidence);
      pos.text = String(line.text || "").trim();
      return pos;
    }).filter(function (line) {
      return !!line.text;
    });

    normalized.sort(function (a, b) {
      return a.y - b.y || a.x - b.x;
    });

    var result = [];

    normalized.forEach(function (line, index) {
      var direct = parseLabel(line.text, line);

      if (direct) {
        result.push(direct);
        return;
      }

      for (var n = index + 1; n < Math.min(normalized.length, index + 3); n++) {
        var next = normalized[n];

        var gap = next.top != null && line.bottom != null
          ? next.top - line.bottom
          : Math.abs(next.y - line.y);

        if (gap > 60 || Math.abs(next.x - line.x) > job.crop.w * 0.25) {
          continue;
        }

        var joined = parseLabel(line.text + " " + next.text, {
          x: (line.x + next.x) / 2,
          y: (line.y + next.y) / 2,
          confidence: Math.min(line.confidence || 0, next.confidence || 0)
        });

        if (joined) {
          result.push(joined);
          break;
        }
      }
    });

    return result;
  }

  function deduplicateDetections(candidates, base) {
    var ordered = candidates.slice().sort(function (a, b) {
      return (b.confidence || 0) - (a.confidence || 0);
    });

    var result = [];
    var tolerance = Math.max(26, Math.min(62, Math.max(base.width, base.height) * 0.025));

    ordered.forEach(function (d) {
      var duplicate = null;

      for (var i = 0; i < result.length; i++) {
        var r = result[i];

        if (r.code !== d.code || r.language !== d.language) continue;

        var dx = r.x - d.x, dy = r.y - d.y;

        if (Math.sqrt(dx * dx + dy * dy) < tolerance) {
          duplicate = r;
          break;
        }
      }

      if (!duplicate) {
        result.push(Object.assign({}, d));
      } else if (duplicate.quantity !== d.quantity) {
        duplicate.quantityConflict = true;
      }
    });

    return result;
  }

  function groupDetections(detections) {
    var groups = Object.create(null);

    detections.forEach(function (d) {
      var key = d.code + "|" + d.language;

      if (!groups[key]) {
        groups[key] = {
          code: d.code,
          language: d.language,
          count: 0,
          quantity: 0,
          needsReview: false,
          quantityConflict: false
        };
      }

      groups[key].count++;
      groups[key].quantity += d.quantity;
      groups[key].needsReview =
        groups[key].needsReview ||
        !!d.needsReview ||
        (d.confidence > 0 && d.confidence < 48);

      groups[key].quantityConflict =
        groups[key].quantityConflict || !!d.quantityConflict;
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
        '<p class="inv-muted">No complete registered code/language/quantity labels were detected. Move closer, hold the camera steady, and try again.</p>';
      return;
    }

    results.innerHTML = [
      '<p class="inv-muted">Repeated labels for the same code and language are combined. The total sums the quantity written on each detected box label. Review every row before adding.</p>',
      '<div class="inv-table-wrap"><table><thead><tr><th>Code</th><th>Language</th><th>Labels</th><th>Combined quantity</th><th>Review</th></tr></thead><tbody>',
      groups.map(function (g, i) {
        var warning = g.needsReview || g.quantityConflict;
        var note = g.quantityConflict
          ? "Check conflicting readings"
          : (g.needsReview ? "Check OCR reading" : "OK");

        return '<tr data-scan-row="' + i + '">' +
          '<td><input class="scan-code-input" value="' + escapeHtml(g.code) +
          '" aria-label="Publication code" style="width:105px"></td>' +
          '<td><select class="scan-language-input">' +
          '<option value="TG"' + (g.language === "TG" ? " selected" : "") + '>TG</option>' +
          '<option value="E"' + (g.language === "E" ? " selected" : "") + '>E</option>' +
          '</select></td>' +
          '<td>' + g.count + '</td>' +
          '<td><input class="scan-quantity" type="number" min="0" step="1" value="' +
          g.quantity + '" style="width:120px"></td>' +
          '<td>' + (warning
            ? '<span class="review-badge">' + escapeHtml(note) + '</span>'
            : escapeHtml(note)) + '</td></tr>';
      }).join(""),
      '</tbody></table></div><div class="inv-controls"><button type="button" class="inv-btn success" id="add-scanned-results">Add reviewed totals to inventory</button></div>'
    ].join("");

    document.getElementById("add-scanned-results").addEventListener(
      "click",
      addScannedResults
    );
  }

  function addScannedResults() {
    var rows = document.querySelectorAll("[data-scan-row]");
    var added = 0, skipped = 0;

    Array.prototype.forEach.call(rows, function (row) {
      var code = normCode(row.querySelector(".scan-code-input").value);
      var language = row.querySelector(".scan-language-input").value;
      var quantity = Number(row.querySelector(".scan-quantity").value);

      if (
        !isActive(code) ||
        (language !== "TG" && language !== "E") ||
        !Number.isFinite(quantity) ||
        quantity <= 0
      ) {
        skipped++;
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
      alert("No valid quantities were added. Check code, language, and quantity fields.");
      return;
    }

    save();

    setStatus(
      "Added " + added + " grouped code/language total(s)." +
      (skipped ? " Skipped " + skipped + " invalid row(s)." : "")
    );
  }

  function canvasFromFile(file) {
    return new Promise(function (resolve, reject) {
      var image = new Image();
      var url = URL.createObjectURL(file);

      image.onload = function () {
        URL.revokeObjectURL(url);

        try {
          resolve(makeBaseCanvas(image));
        } catch (e) {
          reject(e);
        }
      };

      image.onerror = function () {
        URL.revokeObjectURL(url);
        reject(new Error("Could not open the selected image."));
      };

      image.src = url;
    });
  }

  function stopCamera() {
    if (cameraStream) {
      cameraStream.getTracks().forEach(function (track) {
        track.stop();
      });

      cameraStream = null;
    }

    var video = document.getElementById("camera-video");

    if (video) {
      video.pause();
      video.srcObject = null;
      video.hidden = true;
    }

    var start = document.getElementById("start-camera");
    var stop = document.getElementById("stop-camera");
    var scan = document.getElementById("scan-current-view");

    if (start) {
      start.disabled = false;
      start.textContent = "Start Camera";
    }

    if (stop) stop.disabled = true;
    if (scan) scan.disabled = true;
  }

  function startCamera() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      alert("Camera access is unavailable in this browser. Open the HTTPS site in Chrome on Android, allow camera permission, or use the photo upload option.");
      return;
    }

    var start = document.getElementById("start-camera");

    if (start) {
      start.disabled = true;
      start.textContent = "Opening camera...";
    }

    navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        facingMode: { ideal: "environment" },
        width: { ideal: 1920 },
        height: { ideal: 1080 }
      }
    }).then(function (stream) {
      cameraStream = stream;

      var video = document.getElementById("camera-video");

      if (!video) {
        throw new Error("Camera preview is not available on the page.");
      }

      video.hidden = false;
      video.srcObject = stream;
      video.setAttribute("playsinline", "true");
      video.muted = true;

      return video.play();
    }).then(function () {
      var stop = document.getElementById("stop-camera");
      var scan = document.getElementById("scan-current-view");

      if (start) {
        start.disabled = true;
        start.textContent = "Camera On";
      }

      if (stop) stop.disabled = false;
      if (scan) scan.disabled = false;

      setStatus("Camera is on. Move close enough to read the marker, hold steady, then tap Scan Current View. Scanning does not add inventory until you confirm the results.");
    }).catch(function (error) {
      stopCamera();

      if (start) {
        start.disabled = false;
        start.textContent = "Start Camera";
      }

      alert("Could not start the camera: " + error.message + ". Allow camera permission in your Android browser settings and try again.");
    });
  }

  function scanCanvas(base) {
    if (scanning) {
      return Promise.reject(new Error("A scan is already in progress."));
    }

    scanning = true;

    var jobs = makeOCRJobs(base);
    var candidates = [];
    var rawText = [];

    var button = document.getElementById("scan-current-view");
    var photoButton = document.getElementById("scan-uploaded-photo");

    if (button) button.disabled = true;
    if (photoButton) photoButton.disabled = true;

    return getOCRWorker().then(function (worker) {
      var index = 0;

      function next() {
        if (index >= jobs.length) {
          return Promise.resolve();
        }

        var job = jobs[index++];

        setStatus(
          "Scanning " + job.name + " (" +
          index + " of " + jobs.length + "). Keep the phone still..."
        );

        var variant = enhanceCrop(
          base,
          job.crop,
          job.mode,
          job.scale
        );

        return worker.setParameters({
          tessedit_pageseg_mode: job.mode === "bw" ? "6" : "11",
          preserve_interword_spaces: "1",
          user_defined_dpi: "300"
        }).then(function () {
          return worker.recognize(variant);
        }).then(function (result) {
          var data = result && result.data ? result.data : {};

          if (data.text) rawText.push(data.text);

          var lines = Array.isArray(data.lines)
            ? data.lines
            : String(data.text || "").split(/\r?\n/).filter(Boolean).map(function (text, i) {
                return {
                  text: text,
                  confidence: data.confidence || 0,
                  bbox: {
                    x0: 0, x1: 0,
                    y0: i * 24, y1: i * 24 + 20
                  }
                };
              });

          candidates = candidates.concat(
            parseLines(lines, job, data.confidence || 0)
          );

          variant.width = 1;
          variant.height = 1;

          return next();
        });
      }

      return next().then(function () {
        var unique = deduplicateDetections(candidates, base);
        var groups = groupDetections(unique);

        renderScanResults(groups);

        var labelsCount = unique.length;
        var sum = unique.reduce(function (n, item) {
          return n + item.quantity;
        }, 0);

        setStatus(
          "Scan finished: " + labelsCount +
          " unique box label(s), combined into " + groups.length +
          " code/language total(s). Detected quantity sum: " + sum +
          ". Review and correct all quantities before adding.\n\nOCR text sample:\n" +
          rawText.join("\n---\n").slice(0, 1800)
        );
      });
    }).finally(function () {
      scanning = false;

      if (button) button.disabled = !cameraStream;
      if (photoButton) photoButton.disabled = false;
    });
  }

  function scanCurrentView() {
    var video = document.getElementById("camera-video");

    if (!cameraStream || !video || !video.videoWidth) {
      alert("Start the camera and wait for the live preview before scanning.");
      return;
    }

    try {
      var base = makeBaseCanvas(video);

      scanCanvas(base).catch(function (error) {
        setStatus("Scan failed: " + error.message);
      });
    } catch (error) {
      setStatus("Could not capture the camera frame: " + error.message);
    }
  }

  function scanUploadedPhoto() {
    var input = document.getElementById("photo-upload");
    var file = input && input.files ? input.files[0] : null;

    if (!file) {
      alert("Choose an image first.");
      return;
    }

    var preview = document.getElementById("preview");

    if (preview.dataset.url) {
      URL.revokeObjectURL(preview.dataset.url);
    }

    preview.dataset.url = URL.createObjectURL(file);
    preview.src = preview.dataset.url;
    preview.style.display = "block";

    setStatus("Preparing uploaded photo...");

    canvasFromFile(file).then(scanCanvas).catch(function (error) {
      setStatus("Photo scan failed: " + error.message);
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

    setTimeout(function () {
      URL.revokeObjectURL(url);
    }, 2000);
  }

  function downloadCSV(month) {
    var rows = [["Code", "Category", "Language", "Quantity"]];

    Object.keys(inventory).sort().forEach(function (key) {
      var p = key.indexOf(":");
      var lang = p >= 0 ? key.slice(0, p) : "";
      var code = p >= 0 ? key.slice(p + 1) : key;

      if (isActive(code)) {
        rows.push([
          code,
          getCategory(code),
          lang,
          Number(inventory[key]) || 0
        ]);
      }
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

  function getSharedStrings(zip) {
    var file = zip.file("xl/sharedStrings.xml");

    if (!file) return Promise.resolve([]);

    return file.async("string").then(function (xml) {
      var doc = new DOMParser().parseFromString(xml, "application/xml");
      var items = doc.getElementsByTagName("si");
      var out = [];

      for (var i = 0; i < items.length; i++) {
        var nodes = items[i].getElementsByTagName("t");
        var text = "";

        for (var j = 0; j < nodes.length; j++) {
          text += nodes[j].textContent || "";
        }

        out.push(text);
      }

      return out;
    });
  }

  function decodeXml(value) {
    return String(value || "")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&amp;/g, "&");
  }

  function cellText(cell, sharedStrings) {
    if (!cell) return "";

    var type = cell.getAttribute("t") || "";

    if (type === "s") {
      var v = cell.getElementsByTagName("v")[0];
      return v ? (sharedStrings[Number(v.textContent)] || "") : "";
    }

    if (type === "inlineStr") {
      var ts = cell.getElementsByTagName("t");
      var inline = "";

      for (var i = 0; i < ts.length; i++) {
        inline += ts[i].textContent || "";
      }

      return inline;
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
      if ((cells[i].getAttribute("r") || "").match(
        new RegExp("^" + column + "\\d+$")
      )) {
        return cells[i];
      }
    }

    return null;
  }

  function rowLabel(row, strings) {
    return cellText(findColumnCell(row, "A"), strings).trim();
  }

  function codeFromLabel(label) {
    var m = String(label || "").match(/^\s*\(([^)]+)\)/);
    return m ? normCode(m[1]) : "";
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

  function importTemplateCodes(zip, strings) {
    var file = zip.file("xl/worksheets/sheet1.xml");

    if (!file) return Promise.resolve(false);

    return file.async("string").then(function (xml) {
      var doc = new DOMParser().parseFromString(xml, "application/xml");
      var data = doc.getElementsByTagName("sheetData")[0];

      if (!data) return false;

      var rows = Array.prototype.filter.call(
        data.childNodes,
        function (n) {
          return n.nodeType === 1 &&
            (n.localName || n.nodeName) === "row";
        }
      );

      var currentCategory = "Books";
      var changed = false;

      rows.forEach(function (row, index) {
        var label = rowLabel(row, strings);
        var header = categoryFromHeader(label);

        if (header) {
          if (!(index === 0 && header === "Bibles")) {
            currentCategory = header;
          }
          return;
        }

        var code = codeFromLabel(label);

        if (!code || validCodes[code] || isCustom(code)) {
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
          throw new Error("September-Inventory.xlsx was not found beside index.html.");
        }

        return response.arrayBuffer();
      }).then(function (buffer) {
        return JSZip.loadAsync(buffer);
      });
    });
  }

  function insertionIndex(labels, category) {
    var wanted = String(category || "Books").toLowerCase();
    var header = -1;

    for (var i = 1; i < labels.length; i++) {
      if (String(labels[i] || "").trim().toLowerCase() === wanted) {
        header = i;
        break;
      }
    }

    if (header < 0 || wanted === "public magazines") {
      return labels.length;
    }

    var known = publicationCategories.map(function (item) {
      return item.value.toLowerCase();
    });

    var next = labels.length;

    for (var j = header + 1; j < labels.length; j++) {
      if (known.indexOf(String(labels[j] || "").trim().toLowerCase()) >= 0) {
        next = j;
        break;
      }
    }

    for (var k = header + 1; k < next; k++) {
      if (String(labels[k] || "").trim().toLowerCase() === "others") {
        return k;
      }
    }

    return next;
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

    var is = doc.createElementNS(ns, "is");
    var t = doc.createElementNS(ns, "t");
    t.textContent = "(" + code + ")";

    is.appendChild(t);
    a.appendChild(is);

    var b = doc.createElementNS(ns, "c");
    b.setAttribute("r", "B" + rowNumber);
    b.setAttribute("s", "6");
    b.setAttribute("t", "n");

    var v = doc.createElementNS(ns, "v");
    v.textContent = "0";
    b.appendChild(v);

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

    var v = doc.createElementNS(ns, "v");
    v.textContent = String(Number(quantity) || 0);
    cell.appendChild(v);
  }

  function updateWorksheet(xml, language, strings, mode) {
    var doc = new DOMParser().parseFromString(xml, "application/xml");

    if (doc.getElementsByTagName("parsererror").length) {
      throw new Error("Invalid worksheet XML.");
    }

    var data = doc.getElementsByTagName("sheetData")[0];
    if (!data) return xml;

    var rows = Array.prototype.filter.call(
      data.childNodes,
      function (n) {
        return n.nodeType === 1 &&
          (n.localName || n.nodeName) === "row";
      }
    );

    var retained = [];

    rows.forEach(function (row) {
      var code = codeFromLabel(rowLabel(row, strings));

      if (code && isCustom(code)) return;

      retained.push(row);
    });

    var labels = retained.map(function (row) {
      return rowLabel(row, strings);
    });

    var insertions = Object.create(null);

    Object.keys(customPublications).forEach(function (code) {
      if (customPublications[code].active === false) return;

      var category = validCategory(customPublications[code].category)
        ? customPublications[code].category
        : "Books";

      var idx = insertionIndex(labels, category);

      if (!insertions[idx]) insertions[idx] = [];
      insertions[idx].push(code);
    });

    Object.keys(insertions).forEach(function (key) {
      insertions[key].sort();
    });

    var planned = [];

    for (var i = 0; i <= retained.length; i++) {
      (insertions[i] || []).forEach(function (code) {
        planned.push({ code: code });
      });

      if (i < retained.length) {
        planned.push({ row: retained[i] });
      }
    }

    rows.forEach(function (row) {
      data.removeChild(row);
    });

    planned.forEach(function (item, index) {
      var rn = index + 1;
      var row = item.code
        ? makeCustomRow(doc, rn, item.code)
        : item.row;

      if (!item.code) renumberRow(row, rn);

      data.appendChild(row);
    });

    var dimension = doc.getElementsByTagName("dimension")[0];

    if (dimension) {
      dimension.setAttribute("ref", "A1:B" + planned.length);
    }

    var finalRows = Array.prototype.filter.call(
      data.childNodes,
      function (n) {
        return n.nodeType === 1 &&
          (n.localName || n.nodeName) === "row";
      }
    );

    finalRows.forEach(function (row, index) {
      var rn = Number(row.getAttribute("r") || index + 1);
      var code = codeFromLabel(rowLabel(row, strings));

      if (!code || !isCodeValid(code)) return;

      setNumericCell(
        row,
        rn,
        mode === "template"
          ? 0
          : (Number(inventory[language + ":" + code]) || 0),
        doc
      );
    });

    return new XMLSerializer().serializeToString(doc);
  }

  function transformWorkbook(zip, mode) {
    return getSharedStrings(zip).then(function (strings) {
      return importTemplateCodes(zip, strings).then(function () {
        var sheets = [
          { path: "xl/worksheets/sheet1.xml", lang: "TG" },
          { path: "xl/worksheets/sheet2.xml", lang: "E" }
        ];

        return Promise.all(sheets.map(function (sheet) {
          var file = zip.file(sheet.path);
          if (!file) return Promise.resolve();

          return file.async("string").then(function (xml) {
            zip.file(
              sheet.path,
              updateWorksheet(xml, sheet.lang, strings, mode)
            );
          });
        })).then(function () {
          return zip;
        });
      });
    });
  }

  function exportExcel() {
    var month = document.getElementById("report-month");
    var button = document.getElementById("export");

    selectedMonth = month ? month.value : selectedMonth;

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
      setStatus("Downloaded " + selectedMonth + "-Inventory.xlsx.");
    }).catch(function (error) {
      console.warn("Excel export failed; using CSV fallback.", error);
      downloadCSV(selectedMonth);

      setStatus(
        "Excel export failed, so a CSV backup was downloaded. Check September-Inventory.xlsx in the repository."
      );
    }).then(function () {
      if (button) {
        button.disabled = false;
        button.textContent = "Download Excel";
      }
    });
  }

  function downloadUpdatedTemplate() {
    if (!confirm(
      "Create an updated blank template? Active custom codes will be included, deleted custom codes removed, and quantities reset to zero. This downloads a file; it does not change GitHub directly."
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
      downloadBlob(blob, "September-Inventory-UPDATED-TEMPLATE.xlsx");

      setStatus(
        "Template downloaded. To publish changes for everyone, replace September-Inventory.xlsx in GitHub with this file renamed to September-Inventory.xlsx."
      );
    }).catch(function (error) {
      setStatus("Template update failed: " + error.message);
      alert("Could not create the template. Check that September-Inventory.xlsx is available.");
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
      "January", "February", "March", "April", "May", "June",
      "July", "August", "September", "October", "November", "December"
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
      var p = key.indexOf(":");
      return isActive(p >= 0 ? key.slice(p + 1) : key);
    }).sort();

    var inventoryRows = keys.map(function (key) {
      var p = key.indexOf(":");
      var lang = p >= 0 ? key.slice(0, p) : "";
      var code = p >= 0 ? key.slice(p + 1) : key;

      return "<tr><td>" + escapeHtml(code) +
        "</td><td>" + escapeHtml(getCategory(code)) +
        "</td><td>" + escapeHtml(lang) +
        "</td><td>" + escapeHtml(inventory[key]) +
        '</td><td><button type="button" class="inv-btn danger" data-delete="' +
        escapeHtml(key) + '">Delete</button></td></tr>';
    }).join("");

    var historyRows = history.map(function (item, index) {
      return "<div" +
        (isDeleted(item.code) ? ' style="color:#667085"' : "") +
        ">" + (index + 1) + ". " +
        escapeHtml(item.code) + " - " +
        escapeHtml(item.language) + " — " +
        escapeHtml(item.quantity) +
        (isDeleted(item.code) ? " (deleted; history kept)" : "") +
        "</div>";
    }).join("");

    var total = keys.reduce(function (sum, key) {
      return sum + (Number(inventory[key]) || 0);
    }, 0);

    app.innerHTML = [
      '<section class="inv-card"><h1 class="inv-title">Inventory Scanner</h1><p class="inv-muted">Scan handwritten codes on publication boxes, process checklists, and prepare monthly reports.</p></section>',

      '<section class="inv-card"><h2>1. Live Camera Scanner</h2><p class="inv-muted">On Android, allow camera access and use the rear camera. Point at a group of handwritten labels, hold steady, then tap Scan Current View. OCR processes one frame at a time to avoid automatically counting the same box repeatedly.</p>',

      '<div class="inv-controls"><button type="button" class="inv-btn" id="start-camera">Start Camera</button><button type="button" class="inv-btn secondary" id="stop-camera" disabled>Stop Camera</button><button type="button" class="inv-btn success" id="scan-current-view" disabled>Scan Current View</button></div>',

      '<video id="camera-video" autoplay muted playsinline hidden></video>',

      '<p class="inv-muted">Photo fallback: capture or upload a picture, then scan it.</p><div class="inv-controls"><input type="file" id="photo-upload" accept="image/*" capture="environment"><button type="button" class="inv-btn secondary" id="scan-uploaded-photo">Scan Uploaded Photo</button></div>',

      '<img id="preview" alt="Uploaded photo preview"><div id="status" aria-live="polite">Ready. Start the camera or upload a photo.</div><div id="scan-results"></div></section>',

      '<section class="inv-card"><h2>2. Paste a Checklist</h2><p class="inv-muted">Use one line per item, like CODE - TG - 1500 + 375 or CODE - E - 25.</p><textarea id="bulk-notepad" placeholder="Example:\nwp26.1 - TG - 600 + 600\ng18.2 - E - 500\nnwt - TG - 16"></textarea><div class="inv-controls"><button type="button" class="inv-btn" id="add-bulk">Process List</button><button type="button" class="inv-btn secondary" id="clear-text">Clear Text</button></div></section>',

      '<section class="inv-card"><h2>3. Manage Publication Codes</h2><p class="inv-muted">Add new publications and choose their category. Delete custom codes when no longer needed.</p><form id="publication-form"><div class="publication-fields"><label for="new-code">Publication Code<input id="new-code" maxlength="40" placeholder="e.g. newbook1" required></label><label for="new-category">Category<select id="new-category">' + categoryOptions + '</select></label><button type="submit" class="inv-btn">Add / Update Code</button></div></form><div class="inv-table-wrap"><table><thead><tr><th>Custom Code</th><th>Category</th><th>Action</th></tr></thead><tbody>' + customRows + '</tbody></table></div><p class="inv-muted">Download the updated template and replace September-Inventory.xlsx in GitHub to make code additions/deletions permanent for all visitors.</p><div class="inv-controls"><button type="button" class="inv-btn success" id="download-template">Download Updated Template</button></div></section>',

      '<section class="inv-card"><h2>4. History</h2><div class="inv-history">' +
        (historyRows || '<div class="inv-muted">No history yet.</div>') +
      '</div></section>',

      '<section class="inv-card"><h2>5. Monthly Reporting</h2><div class="inv-controls"><label for="report-month">Reporting Month:</label><select id="report-month">' + monthOptions + '</select><button type="button" class="inv-btn" id="export">Download Excel</button><button type="button" class="inv-btn danger" id="clear">Clear Entries</button></div><p><strong>Running Total:</strong> ' + total.toLocaleString() + '</p><div class="inv-table-wrap"><table><thead><tr><th>Code</th><th>Category</th><th>Language</th><th>Total</th><th>Action</th></tr></thead><tbody>' +
        (inventoryRows || '<tr><td colspan="5">No active inventory entries yet.</td></tr>') +
      '</tbody></table></div></section>'
    ].join("");

    document.getElementById("start-camera").addEventListener("click", startCamera);
    document.getElementById("stop-camera").addEventListener("click", stopCamera);
    document.getElementById("scan-current-view").addEventListener("click", scanCurrentView);
    document.getElementById("scan-uploaded-photo").addEventListener("click", scanUploadedPhoto);
    document.getElementById("add-bulk").addEventListener("click", processBulkInput);

    document.getElementById("clear-text").addEventListener("click", function () {
      document.getElementById("bulk-notepad").value = "";
      setStatus("Checklist text cleared.");
    });

    document.getElementById("publication-form").addEventListener("submit", addPublicationCode);
    document.getElementById("download-template").addEventListener("click", downloadUpdatedTemplate);
    document.getElementById("export").addEventListener("click", exportExcel);
    document.getElementById("clear").addEventListener("click", clearAll);

    document.getElementById("report-month").addEventListener("change", function (event) {
      selectedMonth = event.target.value;
    });

    Array.prototype.forEach.call(app.querySelectorAll("[data-delete-code]"), function (button) {
      button.addEventListener("click", function () {
        deletePublicationCode(button.getAttribute("data-delete-code"));
      });
    });

    Array.prototype.forEach.call(app.querySelectorAll("[data-delete]"), function (button) {
      button.addEventListener("click", function () {
        removeInventory(button.getAttribute("data-delete"));
      });
    });

    // Reattach the live camera when a render refreshes the interface after saving.
    if (cameraStream) {
      var liveVideo = document.getElementById("camera-video");
      var startButton = document.getElementById("start-camera");
      var stopButton = document.getElementById("stop-camera");
      var scanButton = document.getElementById("scan-current-view");

      if (liveVideo) {
        liveVideo.hidden = false;
        liveVideo.srcObject = cameraStream;
        liveVideo.play().catch(function () {});
      }

      if (startButton) {
        startButton.disabled = true;
        startButton.textContent = "Camera On";
      }

      if (stopButton) stopButton.disabled = false;
      if (scanButton) scanButton.disabled = scanning;
    }
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

    loadTemplateZip().then(function (zip) {
      return getSharedStrings(zip).then(function (strings) {
        return importTemplateCodes(zip, strings);
      });
    }).catch(function (error) {
      console.info("Template code sync skipped:", error.message);
    });

    window.addEventListener("pagehide", stopCamera);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();

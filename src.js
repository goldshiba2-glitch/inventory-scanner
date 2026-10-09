(function(){
  "use strict";
  
  var inventory = {}, history = [], ocrPromise = null;
  
  try {
    inventory = JSON.parse(localStorage.getItem("inventory") || "{}");
    history = JSON.parse(localStorage.getItem("history") || "[]");
  } catch(e) {}

  function save() {
    localStorage.setItem("inventory", JSON.stringify(inventory));
    localStorage.setItem("history", JSON.stringify(history));
    render();
  }

  function normWeb(c) {
    c = c.toLowerCase().trim().replace(/^llf$/, "lff");
    if (/^t-?\d+$/.test(c)) c = "t" + c.replace(/[^0-9]/g, "");
    return c;
  }

  function normExcel(c) {
    c = c.toLowerCase().trim().replace(/^llf$/, "lff");
    if (/^t-?\d+$/.test(c)) c = "t-" + c.replace(/[^0-9]/g, "");
    return c;
  }

  function parseInput(s) {
    s = s.trim();
    var m = s.match(/^([A-Za-z0-9.-]+)\s*-\s*(TG|E)\s*-\s*(\d{1,6})$/i);
    if (!m) return null;
    return { code: m[1], lang: m[2].toUpperCase(), qty: parseInt(m[3], 10) };
  }

  function add() {
    var i = document.getElementById("label"), p = parseInput(i.value);
    if (!p) return alert("Use CODE-TG-QUANTITY or CODE-E-QUANTITY");
    var c = normWeb(p.code), l = p.lang, q = p.qty, k = l + ":" + c;
    inventory[k] = (inventory[k] || 0) + q;
    history.push({ code: c, language: l, quantity: q });
    i.value = "";
    save();
  }

  function remove(k) {
    delete inventory[k];
    history = history.filter(function(x) { return x.language + ":" + x.code !== k; });
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
    ocrPromise = new Promise(function(ok, no){
      var s = document.createElement("script");
      s.src = "https://jsdelivr.net";
      s.onload = function() { ok(window.Tesseract); };
      s.onerror = function() { no(Error("OCR library failed to load")); };
      document.head.appendChild(s);
    });
    return ocrPromise;
  }

  function readPhoto() {
    var f = document.getElementById("photo").files[0], st = document.getElementById("status"), im = document.getElementById("preview");
    if (!f) return alert("Choose a photo first");
    im.src = URL.createObjectURL(f);
    im.style.display = "block";
    st.textContent = "Preparing photo for OCR...";
    loadOCR().then(function(T){
      return T.recognize(f, "eng", { logger: function(x){ if (x.status) st.textContent = x.status + " " + Math.round((x.progress||0)*100) + "%"; } });
    }).then(function(r){
      var t = r.data.text.replace(/\s+/g, " ").trim();
      st.textContent = "OCR result:\n" + t + "\n\nCheck the field, then tap Add quantity.";
      var m = t.match(/([A-Za-z0-9.-]+)[\s-]*(TG|E)[\s-]*(\d{1,6})/i);
      if (m) document.getElementById("label").value = m[1] + "-" + m[2].toUpperCase() + "-" + m[3];
    }).catch(function(e){
      st.textContent = "OCR unavailable: " + e.message + ". Type manually instead.";
    });
  }

  function exportExcel() {
    if (typeof JSZip === "undefined") return alert("Excel library is not loaded. Check index.html.");
    fetch("September-Inventory.xlsx?x=" + Date.now()).then(function(r){
      if (!r.ok) throw Error("Workbook not found");
      return r.arrayBuffer();
    }).then(JSZip.loadAsync).then(function(zip){
      var sheets = [["xl/worksheets/sheet1.xml", "TG"], ["xl/worksheets/sheet2.xml", "E"]];
      var ns = "http://openxmlformats.org";

      return Promise.all(sheets.map(function(sheetInfo){
        var path = sheetInfo[0];
        var lang = sheetInfo[1];
        var f = zip.file(path);
        if (!f) return Promise.resolve();
        
        return f.async("string").then(function(xml){
          var doc = new DOMParser().parseFromString(xml, "application/xml");
          var cells = Array.prototype.slice.call(doc.getElementsByTagNameNS(ns, "c"));
          var rowsMap = {};

          cells.forEach(function(c) {
            var ref = c.getAttribute("r") || "";
            var col = ref.replace(/[0-9]/g, "");
            var row = ref.replace(/[^0-9]/g, "");
            if (!rowsMap[row]) rowsMap[row] = {};
            rowsMap[row][col] = c;
          });

          Object.keys(rowsMap).forEach(function(row) {
            var cellA = rowsMap[row]["A"];
            var cellB = rowsMap[row]["B"];
            if (!cellA || !cellB) return;

            var code = null;
            var tEl = cellA.getElementsByTagNameNS(ns, "t")[0];
            var vEl = cellA.getElementsByTagNameNS(ns, "v")[0];
            var rawText = tEl ? tEl.textContent : (vEl ? vEl.textContent : (cellA.textContent || ""));
            
            var m = rawText.trim().match(/^\(([^)]+)\)/);
            if (m) code = m[1];

            if (!code) return;
            
            var cleanExcelCode = normExcel(code);
            var lookupKey = lang + ":" + normWeb(cleanExcelCode);
            var finalQty = inventory[lookupKey] || 0;

            while (cellB.firstChild) cellB.removeChild(cellB.firstChild);
            cellB.setAttribute("t", "n");
            var v = doc.createElementNS(ns, "v");
            v.textContent = String(finalQty);
            cellB.appendChild(v);
          });

          zip.file(path, new XMLSerializer().serializeToString(doc));
        });
      })).then(function(){ return zip; });
    }).then(function(z){
      return z.generateAsync({ type: "blob" });
    }).then(function(b){
      var u = URL.createObjectURL(b), a = document.createElement("a");
      a.href = u;
      a.download = "Inventory-Updated.xlsx";
      a.click();
      setTimeout(function(){ URL.revokeObjectURL(u); }, 2000);
    }).catch(function(e){
      alert("Export failed: " + e.message);
    });
  }

  function render(){
    var rows = Object.keys(inventory).map(function(k){
      var p = k.split(":");
      return "<tr><td>" + p[1] + "</td><td>" + p[0] + "</td><td>" + inventory[k] + "</td><td><button data-delete=\"" + k + "\">Delete</button></td></tr>";
    }).join(""),
    hist = history.map(function(x, i){
      return "<div>" + (i + 1) + ". " + x.code + "-" + x.language + " — " + x.quantity + "</div>";
    }).join("");

    document.getElementById("app").innerHTML = '<h1>Inventory Scanner</h1><p>Type a code and quantity. Repeated entries are added together.</p><section class="card"><input id="photo" type="file" accept="image/*" capture="environment"><button class="ocr" id="read">Read code from photo</button><img id="preview" class="preview"><div id="status" class="status"></div><div class="entry"><input id="label" placeholder="Example: T37-TG-100"><button id="add">Add quantity</button></div><button id="export">Download Excel</button><button id="clear">Clear entries</button></section><section class="card"><h2>Running totals</h2><div class="scroll"><table><tr><th>Code</th><th>Language</th><th>Total</th><th>Action</th></tr>' + rows + '</table></div></section><section class="card"><h2>History</h2><div class="scroll history">' + hist + '</div></section>';
    
    document.getElementById("add").onclick = add;
    document.getElementById("read").onclick = readPhoto;
    document.getElementById("export").onclick = exportExcel;
    document.getElementById("clear").onclick = clearAll;
    
    Array.prototype.forEach.call(document.querySelectorAll("[data-delete]"), function(b){
      b.onclick = function(){ remove(b.getAttribute("data-delete")); };
    });
  }
  
  render();
})();

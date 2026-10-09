(function(){
  "use strict";
  
  var inventory = {}, history = [], ocrPromise = null;
  
  // Master validation list of all official publication codes inside your template workbook
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

  // Processes raw multi-line notepad text sheets and safely adds up sequential math chunks
  function processBulkInput() {
    var area = document.getElementById("bulk-notepad");
    if (!area) return;
    
    var lines = area.value.split("\n");
    var processedCount = 0;
    var skippedCount = 0;

    lines.forEach(function(rawLine) {
      var line = rawLine.trim();
      if (!line) return; // Skip completely blank lines safely

      // Super flexible match breaking lines into: [CODE] - [LANGUAGE] - [MATH STRINGS]
      var parts = line.split("-");
      if (parts.length < 3) {
        skippedCount++;
        return;
      }

      var rawCode = parts[0].trim();
      var rawLang = parts[1].trim().toUpperCase();
      
      // Merge any trailing segments in case there are extra dashes in math expressions
      var mathExpression = parts.slice(2).join("-").trim();

      // Clean up language string parameters in case format is written like (e.g. TG or E)
      var cleanLangMatch = rawLang.match(/^[A-Z0-9.]+/);
      if (!cleanLangMatch) {
        skippedCount++;
        return;
      }
      var finalLang = cleanLangMatch[0];
      if (finalLang !== "TG" && finalLang !== "E") {
        // Fallback catch in case language structure gets swapped inside text formatting
        var alternateLang = rawCode.toUpperCase();
        if (alternateLang === "TG" || alternateLang === "E") {
          var temp = finalLang.toLowerCase();
          finalLang = alternateLang;
          rawCode = temp;
        } else {
          skippedCount++;
          return;
        }
      }

      // Safe evaluation engine calculating strings like "1500 + 375 + 2125" cleanly
      var numbers = mathExpression.split("+");
      var finalQty = 0;
      numbers.forEach(function(numStr) {
        var cleanNum = parseInt(numStr.replace(/[^0-9]/g, ""), 10);
        if (!isNaN(cleanNum)) {
          finalQty += cleanNum;
        }
      });

      var cleanWebCode = normWeb(rawCode);
      var lookupKey = finalLang + ":" + cleanWebCode;

      // Commit cleanly calculated quantities into database arrays
      inventory[lookupKey] = (inventory[lookupKey] || 0) + finalQty;
      history.push({ code: cleanWebCode, language: finalLang, quantity: finalQty });
      processedCount++;
    });

    area.value = "";
    save();
    
    if (skippedCount > 0) {
      alert("Successfully loaded " + processedCount + " items! Skipped " + skippedCount + " lines due to formatting limits.");
    } else {
      alert("Success! Handled all " + processedCount + " notepad lines smoothly.");
    }
  }

  function isCodeValid(code) {
    return validCodesMaster.indexOf(code.toLowerCase().trim()) !== -1;
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
    var f = document.getElementById("photo").files, st = document.getElementById("status"), im = document.getElementById("preview");
    if (!f) return alert("Choose a photo first");
    im.src = URL.createObjectURL(f);
    im.style.display = "block";
    st.textContent = "Preparing photo for OCR...";
    loadOCR().then(function(T){
      return T.recognize(f, "eng", { logger: function(x){ if (x.status) st.textContent = x.status + " " + Math.round((x.progress||0)*100) + "%"; } });
    }).then(function(r){
      var t = r.data.text.replace(/\s+/g, " ").trim();
      st.textContent = "OCR result:\n" + t + "\n\nCheck the field, paste into notepad or tap Add below.";
      var m = t.match(/([A-Za-z0-9.-]+)[\s-]*(TG|E)[\s-]*(\d{1,6})/i);
      if (m) {
        var TargetInput = document.getElementById("bulk-notepad");
        if(TargetInput) TargetInput.value += (TargetInput.value ? "\n" : "") + m+"-"+m.toUpperCase()+"-"+m;
      }
    }).catch(function(e){
      st.textContent = "OCR unavailable: " + e.message + ". Type manually instead.";
    });
  }

  function exportExcel() {
    if (typeof JSZip === "undefined") return alert("Excel library is not loaded. Check index.html.");
    
    var btn = document.getElementById("export");
    btn.textContent = "Generating Workbook...";
    
    fetch("September-Inventory.xlsx?x=" + Date.now()).then(function(r){
      if (!r.ok) throw Error("Template workbook not found.");
      return r.arrayBuffer();
    }).then(JSZip.loadAsync).then(function(zip){
      var sheets = [["xl/worksheets/sheet1.xml", "TG"], ["xl/worksheets/sheet2.xml", "E"]];

      return Promise.all(sheets.map(function(sheetInfo){
        var path = sheetInfo;
        var lang = sheetInfo;
        var f = zip.file(path);
        if (!f) return Promise.resolve();
        
        return f.async("string").then(function(xml){
          var cellMatchRegex = /<c\s+r="A(\d+)"[^>]*>([\s\S]*?)<\/c>[\s\S]*?<c\s+r="B\1"[^>]*>([\s\S]*?)<\/c>/g;
          var updatedXml = xml;
          var match;
          
          while ((match = cellMatchRegex.exec(xml)) !== null) {
            var rowNum = match;
            var cellAContent = match;
            var fullCellB = match.match(/<c\s+r="B\d+"[^>]*>[\s\S]*?<\/c>/);
            
            if (!fullCellB) continue;
            
            var codeMatch = cellAContent.match(/\(([^)]+)\)/);
            if (!codeMatch) continue;
            
            var rawCode = codeMatch.trim();
            var cleanWebCode = normWeb(rawCode);
            var lookupKey = lang + ":" + cleanWebCode;
            var finalQty = inventory[lookupKey] || 0;
            
            var newCellB = '<c r="B' + rowNum + '" t="n"><v>' + finalQty + '</v></c>';
            var targetSegment = match.replace(/<c\s+r="B\d+"[^>]*>[\s\S]*?<\/c>/, newCellB);
            
            updatedXml = updatedXml.replace(match, targetSegment);
          }
          
          zip.file(path, updatedXml);
        });
      })).then(function(){ return zip; });
    }).then(function(z){
      return z.generateAsync({ type: "blob" });
    }).then(function(b){
      var u = URL.createObjectURL(b), a = document.createElement("a");
      
      var monthSelect = document.getElementById("report-month");
      var selectedMonth = monthSelect ? monthSelect.value : "September";
      
      a.href = u;
      a.download = selectedMonth + "-Inventory.xlsx";
      a.click();
      btn.textContent = "Download Excel";
      setTimeout(function(){ URL.revokeObjectURL(u); }, 2000);
    }).catch(function(e){
      btn.textContent = "Download Excel";
      alert("Export failed: " + e.message);
    });
  }

  function render(){
    var rows = Object.keys(inventory).map(function(k){
      var p = k.split(":");
      var isValid = isCodeValid(p);
      
      var rowStyle = isValid ? "" : ' style="color: #d9534f; font-weight: bold; background-color: #fdf7f7;"';
      var warningBadge = isValid ? "" : ' <span style="font-size: 11px; background: #d9534f; color: white; padding: 2px 6px; border-radius: 4px; margin-left: 5px;">⚠️ Invalid Code</span>';

      return "<tr" + rowStyle + "><td>" + p + warningBadge + "</td><td>" + p + "</td><td>" + inventory[k] + "</td><td><button data-delete=\"" + k + "\">Delete</button></td></tr>";
    }).join(""),
    hist = history.map(function(x, i){
      var isValid = isCodeValid(x.code);
      var itemStyle = isValid ? "" : ' style="color: #d9534f; font-weight: bold;"';
      return "<div" + itemStyle + ">" + (i + 1) + ". " + x.code + "-" + x.language + " — " + x.quantity + "</div>";
    }).join("");

    // Upgraded standard controller layout into a large multi-line smart text notepad screen
document.getElementById("app").innerHTML = 'Inventory ScannerPaste your entire notepad checklist here. Math symbols (+) are calculated automatically!Read code from photoProcess List CountsReporting Month:JanuaryFebruaryMarchAprilMayJuneJulyAugustSeptemberOctoberNovemberDecemberDownload ExcelClear entriesRunning totalsCodeLanguageTotalAction' + rows + 'History' + hist + '';
document.getElementById("add-bulk").onclick = processBulkInput;
document.getElementById("read").onclick = readPhoto;
document.getElementById("export").onclick = exportExcel;
document.getElementById("clear").onclick = clearAll;
Array.prototype.forEach.call(document.querySelectorAll("[data-delete]"), function(b){
b.onclick = function(){ remove(b.getAttribute("data-delete")); };
});
}
render();
})();

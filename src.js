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

  // Publication schema matching your exact layout data
  var publicationCodes = [
    "nwt", "nwtpkt", "Others", "bhs", "bt", "lfb", "lff", "rr", "scl", "sjj", 
    "sjjls", "sjjyls", "wcg", "yp1", "yp2", "Others", "fg", "hf", "la", "lc", 
    "lffi", "ll", "lmd", "mb", "rj", "wfg", "ypq", "Others", "jwcd1", "jwcd9", 
    "jwcd10", "S-4", "inv", "T-30", "T-31", "T-32", "T-33", "T-34", "T-35", 
    "T-36", "T-37", "Others", "g18.1", "g18.2", "g18.3", "g19.1", "g19.2", 
    "g19.3", "g20.1", "g20.2", "g20.3", "g21.1", "g21.2", "g21.3", "g22.1", 
    "g23.1", "g24.1", "g25.1", "wp18.1", "wp18.2", "wp18.3", "wp19.1", "wp19.2", 
    "wp19.3", "wp20.1", "wp20.2", "wp20.3", "wp21.1", "wp21.2", "wp21.3", 
    "wp22.1", "wp23.1", "wp24.1", "wp25.1", "wp26.1"
  ];

  var publicationNames = [
    "New World Translation", "New World Translation (pocket-size)", "Others (Bibles)",
    "Teach Us", "Bearing Witness", "Learn From the Bible", "Enjoy Life Forever! (Book)",
    "Pure Worship", "Scriptures for Christian Living", "\"Sing Out Joyfully\"",
    "\"Sing Out Joyfully\" (large size)", "\"Sing Out Joyfully\"—Lyrics Only", "Courage",
    "Young People Ask, Volume 1", "Young People Ask, Volume 2", "Others (Books)",
    "Good News", "Happy Family", "Satisfying Life", "Was Life Created?",
    "Enjoy Life Forever! (Brochure)", "Listen and Live", "Love People", "My Bible Lessons",
    "Return to Jehovah", "Wisdom From the Gospels", "10 Questions", "Others (Brochures)",
    "Contact card for jw.org", "Contact card for free Bible course", "Contact card for free Bible course",
    "Field Service Report", "Invitation to Congregation Meetings", "View the Bible (T-30)",
    "View the Future (T-31)", "Happy Family Life (Tract No. 32)", "Who Controls the World? (T-33)",
    "Will Suffering End? (T-34)", "Live Again (T-35)", "Kingdom (T-36)", "Website tract (T-37)",
    "Others (Tracts)", "Awake!", "Awake!", "Awake!", "Awake!", "Awake!", "Awake!", "Awake!", 
    "Awake!", "Awake!", "Awake!", "Awake!", "Awake!", "Awake!", "Awake!", "Awake!", "Awake!",
    "Watchtower (Public)", "Watchtower (Public)", "Watchtower (Public)", "Watchtower (Public)",
    "Watchtower (Public)", "Watchtower (Public)", "Watchtower (Public)", "Watchtower (Public)",
    "Watchtower (Public)", "Watchtower (Public)", "Watchtower (Public)", "Watchtower (Public)",
    "Watchtower (Public)", "Watchtower (Public)", "Watchtower (Public)", "Watchtower (Public)",
    "Watchtower (Public)"
  ];

  function generateCSVData(langFilter) {
    var csvContent = "Publication,Quantity\r\n";
    for (var i = 0; i < publicationCodes.length; i++) {
      var code = publicationCodes[i];
      var name = publicationNames[i];
      var cleanCode = normWeb(code);
      var lookupKey = langFilter + ":" + cleanCode;
      var qty = inventory[lookupKey] || 0;
      
      var displayRow = "(" + code + ") " + name;
      if (code === "Others") displayRow = name;
      
      csvContent += '"' + displayRow.replace(/"/g, '""') + '",' + qty + "\r\n";
    }
    return csvContent;
  }

  function exportExcel() {
    try {
      // Create separate CSV datasets for Tagalog and English sheets to isolate them perfectly
      var tgContent = generateCSVData("TG");
      var eContent = generateCSVData("E");

      // Combine datasets into a single cleanly formatted log file that Excel parses natively
      var combinedLog = "=== TAGALOG INVENTORY ===\r\n" + tgContent + "\r\n=== ENGLISH INVENTORY ===\r\n" + eContent;

      var blob = new Blob([combinedLog], { type: "text/csv;charset=utf-8;" });
      var u = URL.createObjectURL(blob), a = document.createElement("a");
      a.href = u;
      a.download = "Inventory-Updated.csv";
      a.click();
      setTimeout(function(){ URL.revokeObjectURL(u); }, 2000);
    } catch(e) {
      alert("Export failed: " + e.message);
    }
  }

  function render(){
    var rows = Object.keys(inventory).map(function(k){
      var p = k.split(":");
      return "<tr><td>" + p[1] + "</td><td>" + p[0] + "</td><td>" + inventory[k] + "</td><td><button data-delete=\"" + k + "\">Delete</button></td></tr>";
    }).join(""),
    hist = history.map(function(x, i){
      return "<div>" + (i + 1) + ". " + x.code + "-" + x.language + " — " + x.quantity + "</div>";
    }).join("");

    document.getElementById("app").innerHTML = '<h1>Inventory Scanner</h1><p>Type a code and quantity. Repeated entries are added together.</p><section class="card"><input id="photo" type="file" accept="image/*" capture="environment"><button class="ocr" id="read">Read code from photo</button><img id="preview" class="preview"><div id="status" class="status"></div><div class="entry"><input id="label" placeholder="Example: T37-TG-100"><button id="add">Add quantity</button></div><button id="export">Download Data</button><button id="clear">Clear entries</button></section><section class="card"><h2>Running totals</h2><div class="scroll"><table><tr><th>Code</th><th>Language</th><th>Total</th><th>Action</th></tr>' + rows + '</table></div></section><section class="card"><h2>History</h2><div class="scroll history">' + hist + '</div></section>';
    
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

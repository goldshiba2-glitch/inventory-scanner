(function () {
  "use strict";

  var inventory = {};
  var history = [];

  try {
    inventory = JSON.parse(localStorage.getItem("inventory") || "{}");
    history = JSON.parse(localStorage.getItem("history") || "[]");
  } catch (error) {
    inventory = {};
    history = [];
  }

  function normalizeCode(code) {
    code = code.toLowerCase().replace(/^llf$/, "lff");

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
    var field = document.getElementById("label");
    var match = field.value.trim().match(/^(.+?)-(TG|E)-(\d+)$/i);

    if (!match) {
      alert("Use CODE-TG-QUANTITY or CODE-E-QUANTITY");
      return;
    }

    var code = normalizeCode(match[1]);
    var language = match[2].toUpperCase();
    var quantity = Number(match[3]);
    var key = language + ":" + code;

    inventory[key] = (inventory[key] || 0) + quantity;
    history.push({
      code: code,
      language: language,
      quantity: quantity
    });

    field.value = "";
    save();
  }

  function clearAll() {
    if (confirm("Clear all entries?")) {
      inventory = {};
      history = [];
      save();
    }
  }

  function render() {
    var rows = "";
    var key;

    for (key in inventory) {
      if (!inventory.hasOwnProperty(key)) continue;

      var parts = key.split(":");
      rows +=
        "<tr>" +
        "<td>" + parts[1] + "</td>" +
        "<td>" + parts[0] + "</td>" +
        "<td>" + inventory[key] + "</td>" +
        "</tr>";
    }

    var historyRows = history.map(function (item, index) {
      return (
        "<div>" +
        (index + 1) +
        ". " +
        item.code +
        "-" +
        item.language +
        " — " +
        item.quantity +
        "</div>"
      );
    }).join("");

    document.getElementById("app").innerHTML =
      "<h1>Inventory Scanner</h1>" +
      "<p>Type a code and quantity. Repeated entries are added together.</p>" +
      '<section class="card">' +
      '<div class="entry">' +
      '<input id="label" placeholder="Example: T37-TG-100">' +
      '<button id="add">Add quantity</button>' +
      "</div>" +
      '<button id="clear">Clear entries</button>' +
      "</section>" +
      '<section class="card">' +
      "<h2>Running totals</h2>" +
      '<div class="scroll">' +
      "<table>" +
      "<tr><th>Code</th><th>Language</th><th>Total</th></tr>" +
      rows +
      "</table>" +
      "</div>" +
      "</section>" +
      '<section class="card">' +
      "<h2>History</h2>" +
      '<div class="scroll history">' +
      historyRows +
      "</div>" +
      "</section>";

    document.getElementById("add").onclick = addQuantity;
    document.getElementById("clear").onclick = clearAll;
  }

  window.onerror = function (message, source, line, column) {
    document.getElementById("app").innerHTML =
      "<h1>Inventory Scanner error</h1>" +
      "<p>" +
      message +
      "</p>" +
      "<p>Line: " +
      line +
      "</p>";
  };

  render();
})();

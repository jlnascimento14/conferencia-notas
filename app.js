const STORAGE_KEY = "conferenciaNotas:v1";

const state = loadState();
let activeScanTarget = null;
let scanTimer = null;
let scanStream = null;
let installPrompt = null;

const els = {
  setupView: document.querySelector("#setupView"),
  conferenceView: document.querySelector("#conferenceView"),
  invoiceForm: document.querySelector("#invoiceForm"),
  invoiceCode: document.querySelector("#invoiceCode"),
  scanInvoiceButton: document.querySelector("#scanInvoiceButton"),
  xmlForm: document.querySelector("#xmlForm"),
  xmlFiles: document.querySelector("#xmlFiles"),
  newGroupButton: document.querySelector("#newGroupButton"),
  invoiceCount: document.querySelector("#invoiceCount"),
  invoiceList: document.querySelector("#invoiceList"),
  emptyInvoices: document.querySelector("#emptyInvoices"),
  invoiceSelect: document.querySelector("#invoiceSelect"),
  itemForm: document.querySelector("#itemForm"),
  itemCode: document.querySelector("#itemCode"),
  itemName: document.querySelector("#itemName"),
  itemQuantity: document.querySelector("#itemQuantity"),
  bulkItems: document.querySelector("#bulkItems"),
  bulkImportButton: document.querySelector("#bulkImportButton"),
  startConferenceButton: document.querySelector("#startConferenceButton"),
  groupLabel: document.querySelector("#groupLabel"),
  backButton: document.querySelector("#backButton"),
  doneCount: document.querySelector("#doneCount"),
  pendingCount: document.querySelector("#pendingCount"),
  errorCount: document.querySelector("#errorCount"),
  productForm: document.querySelector("#productForm"),
  productCode: document.querySelector("#productCode"),
  scanProductButton: document.querySelector("#scanProductButton"),
  lastResult: document.querySelector("#lastResult"),
  pendingLabel: document.querySelector("#pendingLabel"),
  pendingList: document.querySelector("#pendingList"),
  historyList: document.querySelector("#historyList"),
  emptyHistory: document.querySelector("#emptyHistory"),
  clearHistoryButton: document.querySelector("#clearHistoryButton"),
  scannerDialog: document.querySelector("#scannerDialog"),
  scannerTitle: document.querySelector("#scannerTitle"),
  scannerHelp: document.querySelector("#scannerHelp"),
  scannerVideo: document.querySelector("#scannerVideo"),
  scannerMessage: document.querySelector("#scannerMessage"),
  installButton: document.querySelector("#installButton"),
};

function defaultState() {
  return {
    groupId: createGroupId(),
    invoices: [],
    history: [],
    errors: 0,
  };
}

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved && Array.isArray(saved.invoices) && Array.isArray(saved.history)) {
      return saved;
    }
  } catch {
    return defaultState();
  }
  return defaultState();
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function createGroupId() {
  const now = new Date();
  return `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}-${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}`;
}

function normalizeCode(value) {
  return String(value || "").trim();
}

function findInvoice(code) {
  return state.invoices.find((invoice) => invoice.code === code || invoice.key === code);
}

function getTotals() {
  let expected = 0;
  let done = 0;
  state.invoices.forEach((invoice) => {
    invoice.items.forEach((item) => {
      expected += item.quantity;
      done += item.checked;
    });
  });
  return {
    expected,
    done,
    pending: Math.max(expected - done, 0),
  };
}

function addInvoice(code) {
  const normalized = normalizeCode(code);
  if (!normalized) return showSetupMessage("Digite ou leia uma nota fiscal.");
  if (findInvoice(normalized)) return showSetupMessage("Essa nota ja esta no grupo.");

  state.invoices.push({
    id: crypto.randomUUID(),
    code: normalized,
    key: normalized,
    issuer: "",
    items: [],
  });
  saveState();
  render();
  els.invoiceCode.value = "";
  els.invoiceCode.focus();
}

function addInvoiceFromXml(invoiceData) {
  if (!invoiceData.code && !invoiceData.key) {
    return { ok: false, message: "XML sem numero ou chave da nota." };
  }
  if (!invoiceData.items.length) {
    return { ok: false, message: `Nota ${invoiceData.code || invoiceData.key} sem produtos no XML.` };
  }

  const lookup = invoiceData.key || invoiceData.code;
  if (findInvoice(lookup)) {
    return { ok: false, message: `Nota ${invoiceData.code || invoiceData.key} ja esta no grupo.` };
  }

  state.invoices.push({
    id: crypto.randomUUID(),
    code: invoiceData.code || invoiceData.key,
    key: invoiceData.key || invoiceData.code,
    issuer: invoiceData.issuer || "",
    items: invoiceData.items.map((item) => ({
      id: crypto.randomUUID(),
      code: item.code,
      aliases: item.aliases,
      name: item.name,
      quantity: item.quantity,
      checked: 0,
    })),
  });
  return { ok: true, message: `Nota ${invoiceData.code || invoiceData.key} importada.` };
}

function addItem(invoiceId, code, name, quantity) {
  const invoice = state.invoices.find((entry) => entry.id === invoiceId);
  const normalizedCode = normalizeCode(code);
  const qty = parseQuantity(quantity);
  if (!invoice) return showSetupMessage("Escolha uma nota fiscal.");
  if (!normalizedCode) return showSetupMessage("Digite o codigo do produto.");
  if (!Number.isFinite(qty) || qty <= 0) return showSetupMessage("Informe uma quantidade valida.");

  const existing = invoice.items.find((item) => itemMatchesCode(item, normalizedCode));
  if (existing) {
    existing.quantity += qty;
    if (name.trim()) existing.name = name.trim();
  } else {
    invoice.items.push({
      id: crypto.randomUUID(),
      code: normalizedCode,
      aliases: [normalizedCode],
      name: name.trim() || "Produto sem descricao",
      quantity: qty,
      checked: 0,
    });
  }

  saveState();
  render();
  els.itemCode.value = "";
  els.itemName.value = "";
  els.itemQuantity.value = "1";
  els.itemCode.focus();
}

async function importXmlFiles() {
  const files = Array.from(els.xmlFiles.files || []);
  if (!files.length) return showSetupMessage("Selecione pelo menos um XML de NF-e.");

  const results = [];
  for (const file of files) {
    try {
      const xml = await file.text();
      const invoiceData = parseNfeXml(xml);
      results.push(addInvoiceFromXml(invoiceData));
    } catch (error) {
      results.push({ ok: false, message: `${file.name}: ${error.message}` });
    }
  }

  saveState();
  render();
  els.xmlFiles.value = "";

  const imported = results.filter((result) => result.ok).length;
  const failed = results.filter((result) => !result.ok).map((result) => result.message);
  const message = failed.length
    ? `${imported} XML importado(s).\n\nPendencias:\n${failed.join("\n")}`
    : `${imported} XML importado(s) com sucesso.`;
  showSetupMessage(message);
}

function parseNfeXml(xmlText) {
  const doc = new DOMParser().parseFromString(xmlText, "application/xml");
  const parserError = doc.getElementsByTagName("parsererror")[0];
  if (parserError) throw new Error("XML invalido.");

  const infNfe = firstByLocalName(doc, "infNFe");
  const ide = firstByLocalName(doc, "ide");
  const emit = firstByLocalName(doc, "emit");
  const keyFromId = infNfe ? normalizeCode(infNfe.getAttribute("Id")).replace(/^NFe/i, "") : "";
  const number = textFrom(ide, "nNF");
  const series = textFrom(ide, "serie");
  const issuer = textFrom(emit, "xNome");
  const displayCode = number && series ? `${number}/${series}` : number || keyFromId;
  const details = allByLocalName(doc, "det");

  const items = details.map((det) => {
    const prod = firstByLocalName(det, "prod");
    const internalCode = textFrom(prod, "cProd");
    const barcode = cleanBarcode(textFrom(prod, "cEAN") || textFrom(prod, "cEANTrib"));
    const name = textFrom(prod, "xProd") || "Produto sem descricao";
    const quantity = parseQuantity(textFrom(prod, "qCom") || textFrom(prod, "qTrib") || "1");
    const code = barcode || internalCode;
    const aliases = uniqueCodes([code, barcode, internalCode]);
    if (!code || !Number.isFinite(quantity) || quantity <= 0) return null;
    return { code, aliases, name, quantity };
  }).filter(Boolean);

  return {
    code: displayCode,
    key: keyFromId || displayCode,
    issuer,
    items,
  };
}

function firstByLocalName(root, name) {
  return allByLocalName(root, name)[0] || null;
}

function allByLocalName(root, name) {
  return Array.from(root.getElementsByTagName("*")).filter((node) => node.localName === name);
}

function textFrom(root, name) {
  if (!root) return "";
  const node = firstByLocalName(root, name);
  return node ? normalizeCode(node.textContent) : "";
}

function cleanBarcode(value) {
  const code = normalizeCode(value);
  if (!code || code.toUpperCase() === "SEM GTIN") return "";
  return code;
}

function uniqueCodes(codes) {
  return [...new Set(codes.map(normalizeCode).filter(Boolean))];
}

function parseQuantity(value) {
  const normalized = String(value || "").replace(",", ".").trim();
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function itemMatchesCode(item, code) {
  const normalized = normalizeCode(code);
  return item.code === normalized || (Array.isArray(item.aliases) && item.aliases.includes(normalized));
}

function importBulkItems() {
  const invoiceId = els.invoiceSelect.value;
  const lines = els.bulkItems.value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (!lines.length) return showSetupMessage("Cole pelo menos uma linha de item.");

  let imported = 0;
  lines.forEach((line) => {
    const [code, name = "", qty = "1"] = line.split(";").map((part) => part.trim());
    if (code) {
      addItem(invoiceId, code, name, qty);
      imported += 1;
    }
  });
  els.bulkItems.value = "";
  showSetupMessage(`${imported} itens importados.`);
}

function conferProduct(code) {
  const normalized = normalizeCode(code);
  if (!normalized) return updateResult("Digite ou leia um produto.", "warn");

  const matches = [];
  state.invoices.forEach((invoice) => {
    invoice.items.forEach((item) => {
      if (itemMatchesCode(item, normalized) && item.checked < item.quantity) {
        matches.push({ invoice, item });
      }
    });
  });

  if (!matches.length) {
    const existsButComplete = state.invoices.some((invoice) =>
      invoice.items.some((item) => itemMatchesCode(item, normalized))
    );
    state.errors += 1;
    addHistory({
      type: "bad",
      code: normalized,
      text: existsButComplete
        ? "Produto ja foi conferido na quantidade esperada."
        : "Produto nao consta em nenhuma nota do grupo.",
    });
    updateResult(
      existsButComplete
        ? `Produto ${normalized} ja esta completo no grupo.`
        : `Produto ${normalized} nao consta nas notas lidas.`,
      "bad"
    );
    saveState();
    render();
    return;
  }

  const selected = matches[0];
  selected.item.checked += 1;
  addHistory({
    type: "ok",
    code: normalized,
    text: `${selected.item.name} conferido na nota ${selected.invoice.code}.`,
  });
  updateResult(`${selected.item.name} encontrado na nota ${selected.invoice.code}.`, "ok");
  saveState();
  render();
}

function addHistory(entry) {
  state.history.unshift({
    id: crypto.randomUUID(),
    time: new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
    ...entry,
  });
  state.history = state.history.slice(0, 80);
}

function showSetupMessage(text) {
  alert(text);
}

function updateResult(text, type) {
  els.lastResult.textContent = text;
  els.lastResult.className = `result-box ${type || ""}`.trim();
}

function render() {
  renderInvoices();
  renderStats();
  renderPending();
  renderHistory();
}

function renderInvoices() {
  els.invoiceCount.textContent = `${state.invoices.length} nota${state.invoices.length === 1 ? "" : "s"}`;
  els.emptyInvoices.hidden = state.invoices.length > 0;
  els.invoiceList.innerHTML = "";
  els.invoiceSelect.innerHTML = "";

  state.invoices.forEach((invoice) => {
    const totalItems = invoice.items.reduce((sum, item) => sum + item.quantity, 0);
    const checkedItems = invoice.items.reduce((sum, item) => sum + item.checked, 0);

    const card = document.createElement("div");
    card.className = "invoice-card";
    card.innerHTML = `
      <strong>Nota ${escapeHtml(invoice.code)}</strong>
      <span class="meta">${escapeHtml(invoice.issuer || "Fornecedor nao informado")}  -  ${invoice.items.length} produto(s), ${formatQuantity(checkedItems)}/${formatQuantity(totalItems)} unidade(s) conferida(s)</span>
      <div class="row-actions">
        <button type="button" class="secondary" data-select-invoice="${invoice.id}">Itens</button>
        <button type="button" class="secondary danger" data-remove-invoice="${invoice.id}">Remover</button>
      </div>
    `;
    els.invoiceList.appendChild(card);

    const option = document.createElement("option");
    option.value = invoice.id;
    option.textContent = `Nota ${invoice.code}`;
    els.invoiceSelect.appendChild(option);
  });

  els.itemForm.hidden = state.invoices.length === 0;
  document.querySelector(".bulk-import").hidden = state.invoices.length === 0;
}

function renderStats() {
  const totals = getTotals();
  els.groupLabel.textContent = `Grupo ${state.groupId}`;
  els.doneCount.textContent = totals.done;
  els.pendingCount.textContent = totals.pending;
  els.errorCount.textContent = state.errors;
}

function renderPending() {
  const rows = [];
  state.invoices.forEach((invoice) => {
    invoice.items.forEach((item) => {
      const pending = item.quantity - item.checked;
      if (pending > 0) rows.push({ invoice, item, pending });
    });
  });

  els.pendingLabel.textContent = `${rows.length} ${rows.length === 1 ? "item" : "itens"}`;
  els.pendingList.innerHTML = "";

  if (!rows.length) {
    els.pendingList.innerHTML = `<div class="empty-state">Nenhuma pendencia no grupo.</div>`;
    return;
  }

  rows.forEach(({ invoice, item, pending }) => {
    const row = document.createElement("div");
    row.className = "item-row";
    row.innerHTML = `
      <strong>${escapeHtml(item.name)}</strong>
      <span class="meta">Codigo ${escapeHtml(item.code)}  -  Nota ${escapeHtml(invoice.code)}  -  faltam ${formatQuantity(pending)} de ${formatQuantity(item.quantity)}</span>
    `;
    els.pendingList.appendChild(row);
  });
}

function formatQuantity(value) {
  return Number(value).toLocaleString("pt-BR", { maximumFractionDigits: 4 });
}

function renderHistory() {
  els.emptyHistory.hidden = state.history.length > 0;
  els.historyList.innerHTML = "";
  state.history.forEach((entry) => {
    const row = document.createElement("div");
    row.className = "history-row";
    row.innerHTML = `
      <strong>${entry.type === "ok" ? "Conferido" : "Divergencia"}  -  ${escapeHtml(entry.code)}</strong>
      <span class="meta">${escapeHtml(entry.time)}  -  ${escapeHtml(entry.text)}</span>
    `;
    els.historyList.appendChild(row);
  });
}

function startConference() {
  const totals = getTotals();
  if (!state.invoices.length) return showSetupMessage("Adicione pelo menos uma nota fiscal.");
  if (!totals.expected) return showSetupMessage("Adicione os itens esperados antes de iniciar.");
  els.setupView.classList.remove("active");
  els.conferenceView.classList.add("active");
  els.productCode.focus();
  render();
}

function backToSetup() {
  els.conferenceView.classList.remove("active");
  els.setupView.classList.add("active");
  render();
}

function resetGroup() {
  if (!confirm("Criar um grupo novo e limpar os dados atuais?")) return;
  const fresh = defaultState();
  state.groupId = fresh.groupId;
  state.invoices = fresh.invoices;
  state.history = fresh.history;
  state.errors = fresh.errors;
  saveState();
  backToSetup();
}

async function openScanner(target) {
  activeScanTarget = target;
  els.scannerTitle.textContent = target === "invoice" ? "Ler nota fiscal" : "Ler produto";
  els.scannerMessage.textContent = "Abrindo camera...";
  els.scannerDialog.showModal();

  if (!window.isSecureContext) {
    els.scannerMessage.textContent = "A camera do celular exige HTTPS. Neste acesso pela rede local, use a digitacao ou importe o XML da nota.";
    return;
  }

  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    els.scannerMessage.textContent = "Este navegador nao liberou acesso a camera. Use a digitacao ou importe o XML da nota.";
    return;
  }

  if (!("BarcodeDetector" in window)) {
    els.scannerMessage.textContent = "Este navegador nao tem leitura automatica. Digite o codigo no campo.";
    return;
  }

  try {
    scanStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "environment" },
      audio: false,
    });
    els.scannerVideo.srcObject = scanStream;
    await els.scannerVideo.play();
    const detector = new BarcodeDetector({
      formats: ["qr_code", "ean_13", "ean_8", "code_128", "code_39", "itf"],
    });
    scanTimer = window.setInterval(async () => {
      const codes = await detector.detect(els.scannerVideo);
      if (codes.length) {
        receiveScan(codes[0].rawValue);
      }
    }, 450);
    els.scannerMessage.textContent = "Camera pronta.";
  } catch (error) {
    const denied = error && (error.name === "NotAllowedError" || error.name === "SecurityError");
    els.scannerMessage.textContent = denied
      ? "Permissao da camera negada ou bloqueada pelo navegador. Verifique as permissoes do site."
      : "Nao foi possivel abrir a camera. Digite o codigo manualmente.";
  }
}

function closeScanner() {
  if (scanTimer) window.clearInterval(scanTimer);
  scanTimer = null;
  if (scanStream) scanStream.getTracks().forEach((track) => track.stop());
  scanStream = null;
  activeScanTarget = null;
}

function receiveScan(value) {
  const normalized = normalizeCode(value);
  if (!normalized) return;
  if (activeScanTarget === "invoice") {
    els.invoiceCode.value = normalized;
    addInvoice(normalized);
  } else {
    els.productCode.value = normalized;
    conferProduct(normalized);
    els.productCode.value = "";
  }
  els.scannerDialog.close();
  closeScanner();
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

els.invoiceForm.addEventListener("submit", (event) => {
  event.preventDefault();
  addInvoice(els.invoiceCode.value);
});

els.xmlForm.addEventListener("submit", (event) => {
  event.preventDefault();
  importXmlFiles();
});

els.itemForm.addEventListener("submit", (event) => {
  event.preventDefault();
  addItem(els.invoiceSelect.value, els.itemCode.value, els.itemName.value, els.itemQuantity.value);
});

els.productForm.addEventListener("submit", (event) => {
  event.preventDefault();
  conferProduct(els.productCode.value);
  els.productCode.value = "";
  els.productCode.focus();
});

els.invoiceList.addEventListener("click", (event) => {
  const selectId = event.target.dataset.selectInvoice;
  const removeId = event.target.dataset.removeInvoice;
  if (selectId) {
    els.invoiceSelect.value = selectId;
    els.itemCode.focus();
  }
  if (removeId && confirm("Remover esta nota do grupo?")) {
    state.invoices = state.invoices.filter((invoice) => invoice.id !== removeId);
    saveState();
    render();
  }
});

els.bulkImportButton.addEventListener("click", importBulkItems);
els.startConferenceButton.addEventListener("click", startConference);
els.backButton.addEventListener("click", backToSetup);
els.newGroupButton.addEventListener("click", resetGroup);
els.scanInvoiceButton.addEventListener("click", () => openScanner("invoice"));
els.scanProductButton.addEventListener("click", () => openScanner("product"));
els.clearHistoryButton.addEventListener("click", () => {
  state.history = [];
  state.errors = 0;
  saveState();
  render();
});
els.scannerDialog.addEventListener("close", closeScanner);

window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  installPrompt = event;
  els.installButton.hidden = false;
});

els.installButton.addEventListener("click", async () => {
  if (!installPrompt) return;
  installPrompt.prompt();
  await installPrompt.userChoice;
  installPrompt = null;
  els.installButton.hidden = true;
});

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}

render();

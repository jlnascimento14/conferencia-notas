(function () {
  let reader = null;

  function stopReader() {
    if (reader) reader.reset();
    reader = null;
  }

  function setMessage(text) {
    document.querySelector("#scannerMessage").textContent = text;
  }

  function receiveScannerValue(target, value) {
    const code = String(value || "").trim();
    if (!code) return;

    stopReader();
    document.querySelector("#scannerDialog").close();

    if (target === "invoice") {
      document.querySelector("#invoiceCode").value = code;
      document.querySelector("#invoiceForm").requestSubmit();
      return;
    }

    document.querySelector("#productCode").value = code;
    document.querySelector("#productForm").requestSubmit();
  }

  openScanner = async function (target) {
    const dialog = document.querySelector("#scannerDialog");
    document.querySelector("#scannerTitle").textContent = target === "invoice" ? "Ler nota fiscal" : "Ler produto";
    setMessage(target === "invoice"
      ? "Aponte para o codigo de barras grande da DANFE."
      : "Aponte para o codigo de barras do produto.");
    dialog.showModal();

    if (!window.isSecureContext) {
      setMessage("A camera do celular exige HTTPS. Use o link publicado do GitHub Pages.");
      return;
    }

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setMessage("Este navegador nao liberou acesso a camera.");
      return;
    }

    if (!window.ZXing || !window.ZXing.BrowserMultiFormatReader) {
      setMessage("Leitor de codigo nao carregou. Atualize a pagina e tente novamente.");
      return;
    }

    stopReader();
    reader = new ZXing.BrowserMultiFormatReader();
    reader.decodeFromVideoDevice(null, "scannerVideo", function (result, error) {
      if (result) {
        receiveScannerValue(target, result.getText());
        return;
      }
      if (error && error.name && error.name !== "NotFoundException") {
        setMessage("Tentando focar. Afaste um pouco o celular e mantenha boa luz.");
      }
    }).then(function () {
      setMessage("Camera pronta. Enquadre todo o codigo de barras.");
    }).catch(function (error) {
      const denied = error && (error.name === "NotAllowedError" || error.name === "SecurityError");
      setMessage(denied
        ? "Permissao da camera negada. Libere a camera para este site."
        : "Nao foi possivel abrir a camera. Digite o codigo manualmente.");
    });
  };

  document.querySelector("#scannerDialog").addEventListener("close", stopReader);
}());

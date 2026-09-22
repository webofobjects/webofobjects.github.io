(() => {
  "use strict";

  const config = JSON.parse(document.getElementById("offer-config").textContent);
  const form = document.getElementById("offer-form");
  const preview = document.getElementById("offer-preview");
  const status = document.getElementById("form-status");
  const generateButton = document.getElementById("generate-pdf");
  const nextStep = document.getElementById("next-step");
  const signatureCanvas = document.getElementById("signature-pad");
  const signatureWrap = document.getElementById("signature-wrap");
  const signatureContext = signatureCanvas.getContext("2d");
  const fields = Array.from(form.querySelectorAll('input[type="text"], input[type="date"]'));
  const moneyFormat = new Intl.NumberFormat(config.locale, {
    minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: false
  });
  let drawing = false;
  let hasSignature = false;

  const today = new Date();
  document.getElementById("offer-date").value = new Date(today.getTime() - today.getTimezoneOffset() * 60000)
    .toISOString().slice(0, 10);

  function parseAmount(value) {
    const clean = value.trim();
    if (!/^\d{1,9}(?:[.,]\d{1,2})?$/.test(clean)) return null;
    return Number(clean.replace(",", "."));
  }

  function formatDate(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return "";
    const [year, month, day] = value.split("-").map(Number);
    const date = new Date(0);
    date.setFullYear(year, month - 1, day);
    return new Intl.DateTimeFormat(config.locale, { day: "2-digit", month: "long", year: "numeric" }).format(date);
  }

  function setStatus(message, type = "") {
    status.textContent = message;
    status.className = `status${type ? ` ${type}` : ""}`;
  }

  function updatePreview() {
    for (const target of preview.querySelectorAll("[data-field]")) {
      const field = document.getElementById(target.dataset.field);
      let value = field.value.trim();
      if (field.dataset.money) {
        const amount = parseAmount(value);
        value = amount === null ? "" : moneyFormat.format(amount);
      } else if (field.type === "date") {
        value = formatDate(value);
      }
      target.textContent = value || target.dataset.placeholder;
    }
  }

  function validateField(field) {
    const value = field.value.trim();
    let message = "";
    if (value && field.dataset.money) {
      const amount = parseAmount(value);
      const isPositive = field.dataset.money === "positive";
      if (amount === null || (isPositive && amount <= 0)) {
        message = isPositive ? config.positiveAmount : config.nonnegativeAmount;
      }
    } else if (field.required && !value && field.value) {
      message = config.blank;
    }
    field.setCustomValidity(message);
  }

  for (const field of fields) {
    field.addEventListener("input", () => {
      validateField(field);
      updatePreview();
      nextStep.hidden = true;
      setStatus("");
    });
    field.addEventListener("change", updatePreview);
  }
  updatePreview();

  signatureContext.strokeStyle = "#000000";
  signatureContext.fillStyle = "#000000";
  signatureContext.lineWidth = 5;
  signatureContext.lineCap = "round";
  signatureContext.lineJoin = "round";

  function signaturePoint(event) {
    const rect = signatureCanvas.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) * signatureCanvas.width / rect.width,
      y: (event.clientY - rect.top) * signatureCanvas.height / rect.height
    };
  }

  signatureCanvas.addEventListener("pointerdown", event => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    event.preventDefault();
    drawing = true;
    hasSignature = true;
    nextStep.hidden = true;
    signatureWrap.classList.add("has-signature");
    signatureCanvas.setPointerCapture(event.pointerId);
    const point = signaturePoint(event);
    signatureContext.beginPath();
    signatureContext.arc(point.x, point.y, 2.5, 0, Math.PI * 2);
    signatureContext.fill();
    signatureContext.beginPath();
    signatureContext.moveTo(point.x, point.y);
  });
  signatureCanvas.addEventListener("pointermove", event => {
    if (!drawing) return;
    event.preventDefault();
    const point = signaturePoint(event);
    signatureContext.lineTo(point.x, point.y);
    signatureContext.stroke();
  });
  function endSignature(event) {
    if (!drawing) return;
    drawing = false;
    signatureContext.closePath();
    if (signatureCanvas.hasPointerCapture(event.pointerId)) signatureCanvas.releasePointerCapture(event.pointerId);
  }
  signatureCanvas.addEventListener("pointerup", endSignature);
  signatureCanvas.addEventListener("pointercancel", endSignature);
  signatureCanvas.addEventListener("pointerleave", event => { if (event.buttons === 0) endSignature(event); });
  document.getElementById("clear-signature").addEventListener("click", () => {
    signatureContext.clearRect(0, 0, signatureCanvas.width, signatureCanvas.height);
    drawing = false;
    hasSignature = false;
    nextStep.hidden = true;
    signatureWrap.classList.remove("has-signature");
    setStatus(config.cleared);
  });

  // The document preview is the single source of text for the PDF.
  function documentBlocks() {
    return Array.from(preview.querySelectorAll("[data-pdf]"), element => ({
      kind: element.dataset.pdf,
      text: element.textContent.replace(/\s+/g, " ").trim()
    }));
  }

  class OfferDocument {
    constructor() {
      this.width = 1240;
      this.height = 1754;
      this.marginX = 100;
      this.topMargin = 85;
      this.bottomMargin = 90;
      this.pages = [];
      this.newPage();
    }

    newPage() {
      const canvas = document.createElement("canvas");
      canvas.width = this.width;
      canvas.height = this.height;
      const context = canvas.getContext("2d");
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, this.width, this.height);
      context.textBaseline = "top";
      this.pages.push({ canvas, context });
      this.context = context;
      this.y = this.topMargin;
    }

    style(kind) {
      const base = { size: 21, lineHeight: 28, weight: 400, before: 0, after: 9 };
      if (kind === "title") return { ...base, size: 31, lineHeight: 39, weight: 700, after: 9 };
      if (kind === "subtitle") return { ...base, size: 22, lineHeight: 29, weight: 700, after: 17 };
      if (kind === "meta") return { ...base, after: 6 };
      if (kind === "heading") return { ...base, size: 23, lineHeight: 31, weight: 700, before: 7, after: 8 };
      if (kind === "emphasis") return { ...base, weight: 700 };
      if (kind === "closing") return { ...base, before: 6, after: 6 };
      if (kind === "signatory") return { ...base, after: 6 };
      return base;
    }

    setFont(style) { this.context.font = `${style.weight} ${style.size}px Arial, sans-serif`; }

    wrap(text) {
      const maxWidth = this.width - 2 * this.marginX;
      const lines = [];
      let line = "";
      for (const word of text.split(/\s+/)) {
        const candidate = line ? `${line} ${word}` : word;
        if (this.context.measureText(candidate).width <= maxWidth) {
          line = candidate;
          continue;
        }
        if (line) lines.push(line);
        line = "";
        // Provider names and offer numbers can contain long unbroken strings.
        for (const character of word) {
          if (line && this.context.measureText(line + character).width > maxWidth) {
            lines.push(line);
            line = "";
          }
          line += character;
        }
      }
      if (line) lines.push(line);
      return lines;
    }

    measure(block) {
      if (block.kind === "signature") return 116;
      const style = this.style(block.kind);
      this.setFont(style);
      return style.before + this.wrap(block.text).length * style.lineHeight + style.after;
    }

    ensureSpace(height) {
      if (this.y > this.topMargin && this.y + height > this.height - this.bottomMargin) this.newPage();
    }

    draw(block) {
      if (block.kind === "signature") {
        this.ensureSpace(116);
        this.setFont({ size: 20, weight: 700 });
        this.context.fillStyle = "#000000";
        this.context.fillText(block.text, this.marginX, this.y);
        this.context.drawImage(signatureCanvas, this.marginX + 135, this.y + 1, 330, 99);
        this.y += 116;
        return;
      }
      const style = this.style(block.kind);
      this.setFont(style);
      const lines = this.wrap(block.text);
      this.ensureSpace(style.before + lines.length * style.lineHeight + style.after);
      this.y += style.before;
      for (const line of lines) {
        this.ensureSpace(style.lineHeight);
        this.setFont(style);
        this.context.fillStyle = "#000000";
        this.context.fillText(line, this.marginX, this.y);
        this.y += style.lineHeight;
      }
      this.y += style.after;
    }

    render(blocks) {
      blocks.forEach((block, i) => {
        if (block.kind === "heading" && blocks[i + 1]) {
          this.ensureSpace(this.measure(block) + this.measure(blocks[i + 1]));
        }
        if (block.kind === "closing") {
          this.ensureSpace(blocks.slice(i).reduce((height, item) => height + this.measure(item), 0));
        }
        this.draw(block);
      });
      if (this.pages.length > 1) {
        this.pages.forEach((page, i) => {
          const context = page.context;
          context.font = "400 17px Arial, sans-serif";
          context.fillStyle = "#555555";
          const text = `${config.pageLabel} ${i + 1} / ${this.pages.length}`;
          context.fillText(text, this.width - this.marginX - context.measureText(text).width, this.height - 48);
        });
      }
      return this.pages.map(page => page.canvas);
    }
  }

    function dataUrlBytes(dataUrl) {
      const encoded = dataUrl.split(",")[1];
      const binary = atob(encoded);
      const bytes = new Uint8Array(binary.length);
      for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
      return bytes;
    }

    function concatenate(chunks) {
      const size = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
      const result = new Uint8Array(size);
      let offset = 0;
      chunks.forEach(chunk => {
        result.set(chunk, offset);
        offset += chunk.length;
      });
      return result;
    }

    function buildPdf(pageCanvases) {
      const encoder = new TextEncoder();
      const textBytes = text => encoder.encode(text);
      const pageWidth = "595.28";
      const pageHeight = "841.89";
      const infoObject = 3 + pageCanvases.length * 3;
      const maxObject = infoObject;
      const objects = new Array(maxObject + 1);
      const pageRefs = [];

      pageCanvases.forEach((canvas, index) => {
        const pageObject = 3 + index * 3;
        const imageObject = pageObject + 1;
        const contentObject = pageObject + 2;
        const imageName = `Im${index + 1}`;
        const jpeg = dataUrlBytes(canvas.toDataURL("image/jpeg", 0.92));
        const content = `q\n${pageWidth} 0 0 ${pageHeight} 0 0 cm\n/${imageName} Do\nQ\n`;

        pageRefs.push(`${pageObject} 0 R`);
        objects[pageObject] = textBytes(
          `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /XObject << /${imageName} ${imageObject} 0 R >> >> /Contents ${contentObject} 0 R >>`
        );
        objects[imageObject] = concatenate([
          textBytes(`<< /Type /XObject /Subtype /Image /Width ${canvas.width} /Height ${canvas.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`),
          jpeg,
          textBytes("\nendstream")
        ]);
        objects[contentObject] = textBytes(`<< /Length ${textBytes(content).length} >>\nstream\n${content}endstream`);
      });

      objects[1] = textBytes("<< /Type /Catalog /Pages 2 0 R >>");
      objects[2] = textBytes(`<< /Type /Pages /Kids [${pageRefs.join(" ")}] /Count ${pageCanvases.length} >>`);
      const pdfDate = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
      objects[infoObject] = textBytes(`<< /Title (${config.pdfTitle}) /Producer (Local PDF generator) /CreationDate (D:${pdfDate}) >>`);

      const chunks = [textBytes("%PDF-1.4\n%LOCAL-PDF\n")];
      const offsets = new Array(maxObject + 1).fill(0);
      let length = chunks[0].length;
      for (let objectNumber = 1; objectNumber <= maxObject; objectNumber += 1) {
        offsets[objectNumber] = length;
        const prefix = textBytes(`${objectNumber} 0 obj\n`);
        const suffix = textBytes("\nendobj\n");
        chunks.push(prefix, objects[objectNumber], suffix);
        length += prefix.length + objects[objectNumber].length + suffix.length;
      }

      const xrefOffset = length;
      let xref = `xref\n0 ${maxObject + 1}\n0000000000 65535 f \n`;
      for (let objectNumber = 1; objectNumber <= maxObject; objectNumber += 1) {
        xref += `${String(offsets[objectNumber]).padStart(10, "0")} 00000 n \n`;
      }
      xref += `trailer\n<< /Size ${maxObject + 1} /Root 1 0 R /Info ${infoObject} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
      chunks.push(textBytes(xref));
      return new Blob(chunks, { type: "application/pdf" });
    }



  function cleanFilename(value) {
    return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 70) || "Provider";
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  form.addEventListener("submit", async event => {
    event.preventDefault();
    nextStep.hidden = true;
    setStatus("");
    fields.forEach(validateField);
    if (!form.checkValidity()) {
      form.reportValidity();
      setStatus(config.required, "error");
      return;
    }
    if (!hasSignature) {
      setStatus(config.missingSignature, "error");
      signatureCanvas.focus();
      signatureWrap.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    try {
      generateButton.disabled = true;
      generateButton.textContent = config.generating;
      setStatus(config.creating);
      updatePreview();
      const blocks = documentBlocks();
      const filename = `${config.filenamePrefix}-${cleanFilename(document.getElementById("provider-name").value)}-${cleanFilename(document.getElementById("offer-number").value)}.pdf`;
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const renderer = new OfferDocument();
      const pdf = buildPdf(renderer.render(blocks));
      downloadBlob(pdf, filename);
      setStatus(config.success, "success");
      nextStep.hidden = false;
      nextStep.scrollIntoView({ behavior: "smooth", block: "nearest" });
    } catch (error) {
      console.error(error);
      setStatus(config.error, "error");
    } finally {
      generateButton.disabled = false;
      generateButton.textContent = config.generate;
    }
  });
  generateButton.disabled = false;
})();

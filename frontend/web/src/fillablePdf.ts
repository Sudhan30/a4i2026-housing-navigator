// Builds a fillable (AcroForm) PDF from the worksheet DOM, so the attorney can
// keep editing after download. Reads whatever is on screen, paralegal edits included.
import {PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage, type PDFForm} from 'pdf-lib';

const W = 612;
const H = 792;
const M = 54; // margin
const INK = rgb(0.07, 0.07, 0.07);
const MUTED = rgb(0.35, 0.35, 0.35);
const FIELD_BG = rgb(0.95, 0.97, 1);

// Standard PDF fonts only cover WinAnsi; normalize the few characters we use that it lacks.
function clean(s: string): string {
  return (s ?? '')
    .replace(/[✕✓]/g, 'x')
    .replace(/≤/g, '<=')
    .replace(/≥/g, '>=')
    .replace(/[    ]/g, ' ')
    .replace(/[^\x09\x0a\x0d\x20-\x7e -ÿ–—‘’“”•…§·]/g, '')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

class Writer {
  doc!: PDFDocument;
  form!: PDFForm;
  page!: PDFPage;
  y = H - M;
  n = 0;
  f!: {reg: PDFFont; bold: PDFFont; ital: PDFFont; mono: PDFFont};

  async init() {
    this.doc = await PDFDocument.create();
    this.form = this.doc.getForm();
    this.f = {
      reg: await this.doc.embedFont(StandardFonts.TimesRoman),
      bold: await this.doc.embedFont(StandardFonts.TimesRomanBold),
      ital: await this.doc.embedFont(StandardFonts.TimesRomanItalic),
      mono: await this.doc.embedFont(StandardFonts.Courier),
    };
    this.addPage();
  }
  addPage() {
    this.page = this.doc.addPage([W, H]);
    this.y = H - M;
  }
  need(h: number) {
    if (this.y - h < M) this.addPage();
  }
  wrap(text: string, font: PDFFont, size: number, width: number): string[] {
    const out: string[] = [];
    for (const para of clean(text).split('\n')) {
      let line = '';
      for (const word of para.split(' ')) {
        const next = line ? `${line} ${word}` : word;
        if (font.widthOfTextAtSize(next, size) > width && line) {
          out.push(line);
          line = word;
        } else line = next;
      }
      out.push(line);
    }
    return out;
  }
  text(s: string, o: {size?: number; font?: PDFFont; x?: number; width?: number; center?: boolean; color?: ReturnType<typeof rgb>; gap?: number} = {}) {
    const size = o.size ?? 11;
    const font = o.font ?? this.f.reg;
    const x = o.x ?? M;
    const width = o.width ?? W - M - x;
    for (const line of this.wrap(s, font, size, width)) {
      this.need(size + 4);
      const lx = o.center ? x + (width - font.widthOfTextAtSize(line, size)) / 2 : x;
      this.page.drawText(line, {x: lx, y: this.y - size, size, font, color: o.color ?? INK});
      this.y -= size + 3;
    }
    this.y -= o.gap ?? 0;
  }
  rule(weight = 1) {
    this.need(6);
    this.page.drawLine({start: {x: M, y: this.y}, end: {x: W - M, y: this.y}, thickness: weight, color: INK});
    this.y -= 6;
  }
  field(value: string, o: {x?: number; width?: number; multiline?: boolean; size?: number; minLines?: number; label?: string; noBreak?: boolean} = {}) {
    const size = o.size ?? 10;
    const x = o.x ?? M;
    const width = o.width ?? W - M - x;
    const lines = o.multiline ? Math.max(o.minLines ?? 2, this.wrap(value, this.f.reg, size, width - 6).length + 1) : 1;
    const h = lines * (size + 3) + 6;
    if (!o.noBreak) this.need(h + 2);
    const tf = this.form.createTextField(`f${++this.n}_${(o.label ?? 'field').replace(/\W+/g, '_').slice(0, 30)}`);
    if (o.multiline) tf.enableMultiline();
    tf.setText(clean(value));
    tf.addToPage(this.page, {x, y: this.y - h, width, height: h, borderWidth: 0, backgroundColor: FIELD_BG, font: this.f.reg});
    tf.setFontSize(size);
    this.y -= h + 4;
    return h;
  }
  checkbox(on: boolean, label: string, x = M, cite?: string, noBreak = false) {
    const size = 10.5;
    const labelW = W - M - (x + 18) - (cite ? this.f.reg.widthOfTextAtSize(clean(cite), 9.5) + 10 : 0);
    const lines = this.wrap(label, this.f.reg, size, labelW);
    if (!noBreak) this.need(lines.length * (size + 3) + 4);
    const cb = this.form.createCheckBox(`f${++this.n}_check_${label.replace(/\W+/g, '_').slice(0, 24)}`);
    cb.addToPage(this.page, {x, y: this.y - 11, width: 10, height: 10, borderWidth: 1, borderColor: INK});
    if (on) cb.check();
    const top = this.y;
    lines.forEach((l, i) => this.page.drawText(l, {x: x + 16, y: top - size - i * (size + 3), size, font: this.f.reg, color: INK}));
    if (cite) {
      const c = clean(cite);
      this.page.drawText(c, {x: W - M - this.f.reg.widthOfTextAtSize(c, 9.5), y: top - size, size: 9.5, font: this.f.reg, color: MUTED});
    }
    this.y -= lines.length * (size + 3) + 3;
  }
}

const label = (el: Element) => {
  const c = el.cloneNode(true) as HTMLElement;
  c.querySelectorAll('.cf-box, .cf-cite').forEach(n => n.remove());
  return clean(c.textContent ?? '');
};
const txt = (el: Element | null | undefined) => clean((el as HTMLElement | null)?.innerText ?? el?.textContent ?? '');

export async function buildFillablePdf(root: HTMLElement): Promise<Uint8Array> {
  const cf = (root.matches('.cf') ? root : root.querySelector('.cf')) as HTMLElement;
  const w = new Writer();
  await w.init();
  const {f} = w;

  const stamp = txt(cf.querySelector('.cf-stamp'));
  if (stamp) {
    const s = stamp.toUpperCase();
    w.page.drawText(s, {x: W - M - f.bold.widthOfTextAtSize(s, 10), y: H - 36, size: 10, font: f.bold, color: stamp.toLowerCase().includes('ready') ? rgb(0.02, 0.47, 0.34) : rgb(0.73, 0.11, 0.11)});
  }

  for (const line of Array.from(cf.querySelectorAll('.cf-court > div'))) w.text(txt(line), {font: f.bold, size: 11.5, center: true});
  w.y -= 6;
  w.rule(1.2);

  // Caption: parties on the left, case details on the right.
  const top = w.y;
  const colX = M + (W - 2 * M) * 0.53;
  const ps = Array.from(cf.querySelectorAll('.cf-parties p')).map(p => txt(p).replace(/,\s*$/, ''));
  const petitioner = (ps[0] ?? '').replace(/,?\s*Petitioner,?$/i, '');
  const respondent = ps.find((t, i) => i > 0 && !/^(petitioner|respondent)|against/i.test(t)) ?? '';
  w.field(petitioner, {width: colX - M - 16, label: 'petitioner'});
  w.text('Petitioner,', {font: f.ital, x: M + 40});
  w.text('— against —', {x: M, width: colX - M - 16, center: true});
  w.field(respondent, {width: colX - M - 16, label: 'respondent'});
  w.text('Respondent.', {font: f.ital, x: M + 40});
  const leftBottom = w.y;
  w.y = top;
  for (const p of Array.from(cf.querySelectorAll('.cf-meta p'))) {
    const blank = p.querySelector('.cf-blank');
    const label = clean(txt(p).replace(txt(blank), ''));
    w.text(label, {x: colX + 8, size: 10.5});
    w.y += 2;
    w.field(txt(blank), {x: colX + 8, label});
  }
  w.page.drawLine({start: {x: colX, y: top + 4}, end: {x: colX, y: Math.min(leftBottom, w.y) + 2}, thickness: 1.2, color: INK});
  w.y = Math.min(leftBottom, w.y);
  w.rule(1.2);
  w.y -= 4;

  const title = cf.querySelector('.cf-title');
  const small = title?.querySelector('small');
  w.text(clean(txt(title).replace(txt(small), '')), {font: f.bold, size: 12, center: true});
  if (small) w.text(txt(small), {font: f.ital, size: 10, center: true, color: MUTED});
  w.y -= 8;

  for (const sec of Array.from(cf.querySelectorAll('.cf-sec'))) {
    const h3 = sec.querySelector('h3');
    w.need(40);
    w.text(txt(h3), {font: f.bold, size: 11, gap: 2});
    const isEquity = sec.classList.contains('cf-equity');

    for (const child of Array.from(sec.children)) {
      if (child === h3) continue;
      if (child.matches('.cf-checks')) {
        const labels = Array.from(child.querySelectorAll('label'));
        const colW = (W - 2 * M) / 3;
        for (let i = 0; i < labels.length; i += 3) {
          w.need(30);
          const rowTop = w.y;
          let low = w.y;
          labels.slice(i, i + 3).forEach((l, j) => {
            w.y = rowTop;
            w.checkbox(!!l.querySelector('.cf-box.on'), label(l), M + j * colW, undefined, true);
            low = Math.min(low, w.y);
          });
          w.y = low;
        }
      } else if (child.matches('ul.cf-list')) {
        for (const li of Array.from(child.querySelectorAll('li'))) {
          const cite = li.querySelector('.cf-cite');
          w.checkbox(!!li.querySelector('.cf-box.on'), label(li), M, cite ? txt(cite) : undefined);
        }
      } else if (child.matches('table')) {
        const headers = Array.from(child.querySelectorAll('thead th')).map(txt);
        const rows = Array.from(child.querySelectorAll('tbody tr'));
        const widths = headers.map(hd => (hd === '' ? 0.05 : /program/i.test(hd) ? 0.53 : /hazard|class/i.test(hd) ? 0.24 : /location/i.test(hd) ? 0.24 : /record/i.test(hd) ? 0.17 : 0.15));
        const total = widths.reduce((a, b) => a + b, 0);
        const cols = widths.map(x => (x / total) * (W - 2 * M));
        w.need(60);
        let x = M;
        let hLines = 1;
        headers.forEach((hd, i) => {
          const ls = w.wrap(hd, f.bold, 9.5, cols[i] - 4);
          hLines = Math.max(hLines, ls.length);
          ls.forEach((l, k) => w.page.drawText(l, {x: x + 2, y: w.y - 10 - k * 11, size: 9.5, font: f.bold, color: INK}));
          x += cols[i];
        });
        w.y -= 6 + hLines * 11;
        for (const tr of rows) {
          const cells = Array.from(tr.querySelectorAll('td'));
          const rowLines = Math.max(1, ...cells.map((td, i) => w.wrap(txt(td), f.reg, 9.5, cols[i] - 9).length + (f.reg.widthOfTextAtSize(txt(td), 9.5) > cols[i] - 8 ? 1 : 0)));
          w.need(rowLines * 12.5 + 12);
          const rowTop = w.y;
          let low = w.y;
          let cx = M;
          cells.forEach((td, i) => {
            w.y = rowTop;
            if (td.querySelector('.cf-box')) {
              const cb = w.form.createCheckBox(`f${++w.n}_row_check`);
              cb.addToPage(w.page, {x: cx + 3, y: rowTop - 13, width: 10, height: 10, borderWidth: 1, borderColor: INK});
              if (td.querySelector('.cf-box.on')) cb.check();
              low = Math.min(low, rowTop - 18);
            } else {
              const value = txt(td);
              const multi = f.reg.widthOfTextAtSize(value, 9.5) > cols[i] - 8;
              w.field(value, {x: cx + 1, width: cols[i] - 3, size: 9.5, multiline: multi, minLines: 1, label: headers[i] || 'cell', noBreak: true});
              low = Math.min(low, w.y);
            }
            cx += cols[i];
          });
          w.y = low;
        }
        w.y -= 4;
      } else if (child.matches('.cf-memo')) {
        w.field(txt(child), {multiline: true, minLines: 4, label: 'memo'});
      } else if (child.matches('.cf-note')) {
        w.text(txt(child), {font: f.ital, size: 9.5, color: MUTED, gap: 2});
      } else if (isEquity) {
        w.text(txt(child), {size: 9.5, color: MUTED, gap: 2});
      } else {
        // Narrative paragraphs (neighborhood, pending notes): editable.
        w.field(txt(child).replace(/^Pending.*$/, ''), {multiline: true, minLines: 2, label: txt(h3)});
      }
    }
    w.y -= 6;
  }

  // Signatures
  w.need(70);
  w.y -= 10;
  const half = (W - 2 * M - 24) / 2;
  const sigTop = w.y;
  for (const [i, div] of Array.from(cf.querySelectorAll('.cf-sign > div')).entries()) {
    const x = M + i * (half + 24);
    w.y = sigTop;
    w.field('', {x, width: half, label: `signature_${i}`});
    const date = txt(div.querySelector('.cf-date'));
    w.text(clean(txt(div).replace(date, '')), {x, width: half, size: 9.5});
    w.text('Date:', {x, width: half, size: 9.5});
    w.y += 2;
    w.field(date.replace(/^Date:\s*/, ''), {x: x + 28, width: half - 28, size: 9.5, label: `date_${i}`});
  }
  w.y -= 8;
  w.rule(0.8);
  w.text(txt(cf.querySelector('.cf-foot')), {size: 8.5, color: MUTED, font: f.reg});

  w.form.updateFieldAppearances(f.reg);
  return w.doc.save();
}

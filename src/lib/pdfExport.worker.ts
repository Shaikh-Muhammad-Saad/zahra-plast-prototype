import { jsPDF } from 'jspdf';
import { autoTable, type Styles } from 'jspdf-autotable';
import type { PdfExportDocument, PdfWorkerResponse } from './pdfExportTypes';

const reply = (message: PdfWorkerResponse, transfer: Transferable[] = []) => self.postMessage(message, { transfer });
const printable = (value: string | number | null | boolean | undefined): string => {
  if (value === null || value === undefined || value === '') return '-';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  return String(value).replace(/[\u2010-\u2015]/g, '-').replace(/\u00a0/g, ' ');
};

self.onmessage = (event: MessageEvent<PdfExportDocument>) => {
  try {
    const report = event.data;
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4', compress: true, putOnlyUsedFonts: true, floatPrecision: 3 });
    doc.setProperties({ title: `${report.companyName} - ${report.title}`, author: report.companyName, subject: report.subtitle, creator: 'Zehra Plast' });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 12;
    const tableWidth = pageWidth - margin * 2;
    const totalRows = report.sections.reduce((sum, section) => sum + section.rows.length, 0);
    const sections = report.sections.length ? report.sections : [{ columns: [{ header: 'Records', width: 1 }], rows: [] }];
    let completed = 0;

    sections.forEach((section, index) => {
      if (index > 0) doc.addPage();
      const columnsWidth = section.columns.reduce((sum, column) => sum + column.width, 0);
      const columnStyles: Record<number, Partial<Styles>> = Object.fromEntries(section.columns.map((column, columnIndex) => [columnIndex, { cellWidth: tableWidth * column.width / columnsWidth, halign: column.align ?? 'left' }]));
      doc.setFontSize(8);
      const titleLines = section.title ? doc.splitTextToSize(printable(section.title), tableWidth) : [];
      const noteLines = section.note ? doc.splitTextToSize(printable(section.note), tableWidth) : [];
      const subtitleLines = doc.splitTextToSize(printable(report.subtitle), tableWidth);
      const tableTop = 32 + subtitleLines.length * 3.5 + titleLines.length * 4 + noteLines.length * 3.5 + 5;

      autoTable(doc, {
        head: [section.columns.map(column => column.header)],
        body: section.rows.length ? section.rows.map(row => row.map(printable)) : [[{ content: 'No records available.', colSpan: section.columns.length }]],
        startY: tableTop,
        margin: { top: tableTop, bottom: 16, left: margin, right: margin },
        tableWidth,
        theme: 'striped',
        showHead: 'everyPage',
        rowPageBreak: 'avoid',
        styles: { font: 'helvetica', fontSize: 8, cellPadding: 2, overflow: 'linebreak', valign: 'middle', textColor: [36, 52, 46], lineColor: [225, 232, 227], lineWidth: 0.1 },
        headStyles: { fillColor: [23, 107, 84], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8 },
        alternateRowStyles: { fillColor: [245, 248, 246] },
        columnStyles,
        willDrawPage: () => {
          doc.setFillColor(23, 107, 84);
          doc.rect(margin, 10, 1.4, 15, 'F');
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(16);
          doc.setTextColor(26, 48, 38);
          doc.text(printable(report.companyName), margin + 5, 16, { maxWidth: tableWidth - 70 });
          doc.setFontSize(11);
          doc.text(printable(report.title), margin + 5, 23);
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(8);
          doc.setTextColor(90, 108, 98);
          doc.text(`Generated ${report.generatedOn}`, pageWidth - margin, 15, { align: 'right' });
          doc.text(`${totalRows.toLocaleString('en-PK')} records`, pageWidth - margin, 21, { align: 'right' });
          doc.text(subtitleLines, margin, 31);
          let y = 32 + subtitleLines.length * 3.5;
          if (titleLines.length) {
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(23, 107, 84);
            doc.text(titleLines, margin, y + 2);
            y += titleLines.length * 4;
          }
          if (noteLines.length) {
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(90, 108, 98);
            doc.text(noteLines, margin, y + 2);
          }
        },
      });
      completed += section.rows.length;
      reply({ type: 'progress', completed, total: totalRows });
    });

    const pageCount = doc.getNumberOfPages();
    for (let page = 1; page <= pageCount; page++) {
      doc.setPage(page);
      doc.setDrawColor(218, 227, 221);
      doc.line(margin, pageHeight - 12, pageWidth - margin, pageHeight - 12);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(90, 108, 98);
      doc.text('Zehra Plast | Workspace export', margin, pageHeight - 7);
      doc.text(`Page ${page} of ${pageCount}`, pageWidth - margin, pageHeight - 7, { align: 'right' });
    }
    const buffer = doc.output('arraybuffer');
    reply({ type: 'complete', buffer }, [buffer]);
  } catch (cause) {
    reply({ type: 'error', message: cause instanceof Error ? cause.message : 'The PDF could not be generated.' });
  }
};

import type { PdfExportDocument, PdfWorkerResponse } from './pdfExportTypes';

/** Generate locally off the UI thread, including the complete customer matrix. */
export async function downloadPdf(document: PdfExportDocument, onProgress?: (completed: number, total: number) => void): Promise<void> {
  const worker = new Worker(new URL('./pdfExport.worker.ts', import.meta.url), { type: 'module' });
  try {
    const buffer = await new Promise<ArrayBuffer>((resolve, reject) => {
      worker.onmessage = (event: MessageEvent<PdfWorkerResponse>) => {
        const message = event.data;
        if (message.type === 'progress') onProgress?.(message.completed, message.total);
        if (message.type === 'complete') resolve(message.buffer);
        if (message.type === 'error') reject(new Error(message.message));
      };
      worker.onerror = () => reject(new Error('The PDF could not be generated. Please try again.'));
      worker.onmessageerror = () => reject(new Error('The PDF data could not be read. Please try again.'));
      worker.postMessage(document);
    });
    const url = URL.createObjectURL(new Blob([buffer], { type: 'application/pdf' }));
    const link = window.document.createElement('a');
    link.href = url;
    link.download = `${document.filename}.pdf`;
    window.document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } finally {
    worker.terminate();
  }
}

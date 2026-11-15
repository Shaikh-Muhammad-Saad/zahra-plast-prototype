export interface PdfExportColumn {
  header: string;
  width: number;
  align?: 'left' | 'right' | 'center';
}

export interface PdfExportSection {
  title?: string;
  note?: string;
  columns: PdfExportColumn[];
  rows: (string | number | null | boolean | undefined)[][];
}

export interface PdfExportDocument {
  title: string;
  subtitle: string;
  filename: string;
  companyName: string;
  generatedOn: string;
  sections: PdfExportSection[];
}

export type PdfWorkerResponse =
  | { type: 'progress'; completed: number; total: number }
  | { type: 'complete'; buffer: ArrayBuffer }
  | { type: 'error'; message: string };

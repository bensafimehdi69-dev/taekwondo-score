export type ExtractionMethod = "native" | "type3" | "ocr";

export type VisualTextItem = {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

export type ParsedPage = {
  pageNumber: number;
  width: number;
  height: number;
  orderedText: string[];
  items: VisualTextItem[];
  lines: VisualTextItem[];
  rawText: string;
  customWtFont: boolean;
  extractionMethod?: ExtractionMethod;
  extractionConfidence?: number;
  extractionWarnings?: string[];
};

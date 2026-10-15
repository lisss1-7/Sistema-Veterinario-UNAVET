import type { jsPDF } from 'jspdf';

export const observationParagraphs = (value: string) => value
  .split(/\r?\n/)
  .map((paragraph) => paragraph.trim().replace(/^[-–•]\s+/, ''))
  .filter(Boolean);

export type ClinicalPdfLine = { text: string; last: boolean; bullet: boolean };

export function clinicalPdfLines(doc: jsPDF, value: string, width: number, bullets = false): ClinicalPdfLine[] {
  const paragraphs = bullets ? observationParagraphs(value) : value.split(/\r?\n/);
  return paragraphs.flatMap((paragraph) => {
    const lines = doc.splitTextToSize(paragraph, width - (bullets ? 4 : 0)) as string[];
    return lines.map((text, index) => ({ text, last: index === lines.length - 1, bullet: bullets && index === 0 }));
  });
}

export function drawClinicalPdfLine(doc: jsPDF, line: ClinicalPdfLine, x: number, y: number, width: number, bullets = false) {
  if (line.bullet) doc.text('-', x, y);
  const textX = x + (bullets ? 4 : 0);
  const textWidth = width - (bullets ? 4 : 0);
  const words = line.text.trim().split(/\s+/);
  if (line.last || words.length < 2) {
    doc.text(line.text, textX, y);
    return;
  }
  const wordsWidth = words.reduce((total, word) => total + doc.getTextWidth(word), 0);
  const gap = Math.max(0, (textWidth - wordsWidth) / (words.length - 1));
  let wordX = textX;
  for (const word of words) {
    doc.text(word, wordX, y);
    wordX += doc.getTextWidth(word) + gap;
  }
}

// Типи для Drive-панелі. ВИНЕСЕНО з server-actions: файл із 'use server'
// може експортувати ЛИШЕ async-функції (Next.js), тому типи живуть тут.

export interface DriveNode {
  id: string;
  name: string;
  mimeType: string;
  webViewLink?: string;
  isFolder: boolean;
  children?: DriveNode[];
}

export interface ChangePlan {
  linked: { folder: string; path: string; folderId: string; unit: string; unitId: string; score: number }[];
  renameSuggestions: { folder: string; path: string; folderId: string; suggestUnit: string; suggestUnitId: string; canonicalName: string; score: number }[];
  createSuggestions: { id: string; name: string; type: string }[];
  extraFolders: { name: string; path: string; folderId: string; bestGuess?: string; bestScore?: number }[];
}

export interface AnalyzeReport {
  tree: DriveNode[];
  structureNote?: string | null;
  structureHint?: string | null;
  changePlan: ChangePlan;
  instructionDocs: { name: string; path: string; fileId: string; webViewLink?: string }[];
  indexedFiles: number;
  indexSkippedReason: string | null;
  summary: { linked: number; renameSuggestions: number; createSuggestions: number; extraFolders: number; instructionDocs: number; indexedFiles: number };
}

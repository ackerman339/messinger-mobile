import type { UploadContentType } from '../types/file';

export const DOCUMENT_FILE_TYPES: Record<string, UploadContentType> = {
  '.doc': 'application/msword',
  '.docx':
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.ppt': 'application/vnd.ms-powerpoint',
  '.pptx':
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.odt': 'application/vnd.oasis.opendocument.text',
  '.ods': 'application/vnd.oasis.opendocument.spreadsheet',
  '.odp': 'application/vnd.oasis.opendocument.presentation',
  '.txt': 'text/plain',
  '.csv': 'text/csv',
  '.pdf': 'application/pdf',
};

export const OTHER_FILE_TYPES: Record<string, UploadContentType> = {
  '.kml': 'application/vnd.google-earth.kml+xml',
  '.kmz': 'application/vnd.google-earth.kmz',
  '.shp': 'application/vnd.shp',
  '.shx': 'application/vnd.shx',
  '.dbf': 'application/vnd.dbf',
  '.prj': 'application/octet-stream',
  '.zip': 'application/zip',
  '.rar': 'application/vnd.rar',
  '.tar': 'application/x-tar',
  '.apk': 'application/vnd.android.package-archive',
  '.dmg': 'application/x-apple-diskimage',
  '.geojson': 'application/geo+json',
  '.gpx': 'application/gpx+xml',
  '.tab': 'application/x-mapinfo-tab',
  '.tif': 'image/tiff',
  '.tiff': 'image/tiff',
  '.dae': 'model/vnd.collada+xml',
  '.skp': 'application/vnd.google.sketchup',
};

export type DocumentCategory = 'pdf' | 'documents' | 'other';

export const DOCUMENT_PICKER_TYPES = [
  ...new Set([
    ...Object.values(DOCUMENT_FILE_TYPES),
    'application/octet-stream',
  ]),
];

export function getAttachmentContentType(
  name: string,
  category: DocumentCategory,
): UploadContentType | undefined {
  if (category === 'pdf') return 'application/pdf';
  const extension = name.match(/\.[^.]+$/)?.[0].toLowerCase();
  if (!extension) return undefined;
  return (category === 'documents' ? DOCUMENT_FILE_TYPES : OTHER_FILE_TYPES)[
    extension
  ];
}

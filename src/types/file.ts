export const UPLOAD_CONTENT_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/tiff',
  'image/geotiff',
  'video/mp4',
  'video/webm',
  'video/quicktime',
  'audio/webm',
  'audio/ogg',
  'audio/mp4',
  'audio/mpeg',
  'audio/webm; codecs=opus',
  'audio/webm;codecs=opus',
  'audio/ogg;codecs=opus',
  'audio/m4a',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.oasis.opendocument.text',
  'application/vnd.oasis.opendocument.spreadsheet',
  'application/vnd.oasis.opendocument.presentation',
  'application/vnd.google-earth.kml+xml',
  'application/vnd.google-earth.kmz',
  'application/vnd.shp',
  'application/vnd.shx',
  'application/vnd.dbf',
  'application/x-dbf',
  'application/geo+json',
  'application/vnd.geo+json',
  'application/gpx+xml',
  'application/x-gpx+xml',
  'application/x-mapinfo-tab',
  'application/zip',
  'application/x-zip-compressed',
  'application/vnd.rar',
  'application/x-rar-compressed',
  'application/x-rar',
  'application/x-tar',
  'application/vnd.android.package-archive',
  'application/x-apple-diskimage',
  'model/vnd.collada+xml',
  'application/vnd.google.sketchup',
  'application/x-sketchup',
  'text/plain',
  'text/csv',
  'application/octet-stream',
] as const;

export type UploadContentType = (typeof UPLOAD_CONTENT_TYPES)[number];

export type UploadFile = {
  contentType: UploadContentType;
  size: number;
  fileName: string;
};

export type UploadDto = {
  files: UploadFile[];
};

export type FileAttachment = {
  id: string;
  fileName: string;
  size: number;
  storageKey: string;
  contentType: string;
};

export type PresignedUrl = {
  key: string;
  url: string;
};

export type DownloadDto = {
  attachmentId: string;
};

export type LocalFile = {
  uri: string;
  name: string;
  size: number;
  type: string;
};

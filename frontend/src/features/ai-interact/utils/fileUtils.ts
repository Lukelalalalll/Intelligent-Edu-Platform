/**
 * Returns a Font Awesome icon class name for a given MIME type.
 * Used in both MessageItem (displaying sent attachments) and
 * ChatInput (displaying pending attachments in the input area).
 */
export function getFileIcon(mimeType?: string): string {
    if (!mimeType) return 'fa-file-alt';
    if (mimeType.startsWith('image/')) return 'fa-file-image';
    if (mimeType === 'application/pdf') return 'fa-file-pdf';
    if (mimeType.includes('word') || mimeType.includes('document')) return 'fa-file-word';
    if (mimeType.includes('excel') || mimeType.includes('spreadsheet')) return 'fa-file-excel';
    if (mimeType.includes('powerpoint') || mimeType.includes('presentation')) return 'fa-file-powerpoint';
    if (mimeType.includes('zip') || mimeType.includes('compressed') || mimeType.includes('tar')) return 'fa-file-archive';
    if (mimeType.includes('markdown') || mimeType.includes('text/md')) return 'fa-file-code';
    return 'fa-file-alt';
}

/**
 * Returns a CSS module class key for color-coding file type icons.
 */
export function getFileIconColor(mimeType?: string): string {
    if (!mimeType) return 'fileIconDefault';
    if (mimeType === 'application/pdf') return 'fileIconPdf';
    if (mimeType.includes('word') || mimeType.includes('document')) return 'fileIconWord';
    if (mimeType.startsWith('image/')) return 'fileIconImage';
    if (mimeType.includes('markdown') || mimeType.includes('text/md') || mimeType.includes('code')) return 'fileIconCode';
    return 'fileIconDefault';
}

/**
 * Formats a file size in bytes to a human-readable string.
 */
export function formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export const MIME_TYPES: Record<string, string> = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".svg": "image/svg+xml",
}

export const PREVIEWABLE_EXTENSIONS = Object.keys( MIME_TYPES )

export function getMime(filename: string): string {
    const lower = filename.toLowerCase()
    const ext = PREVIEWABLE_EXTENSIONS.find( e => lower.endsWith( e ) )
    return ext ? MIME_TYPES[ext] : "application/octet-stream"
}

export function isPreviewable(filename: string, size: number): boolean {
    const lower = filename.toLowerCase()
    return size <= 10_000_000 && PREVIEWABLE_EXTENSIONS.some( e => lower.endsWith( e ) )
}
export function formatFileSize(bytes: number): string {
    const magnitudes = [ '', 'K', 'M', 'G', 'T' ]

    let size = bytes
    let mag = 0

    while ( size >= 1000 && mag < 4 ) {
        size /= 1000
        mag++
    }

    return `${ Math.round( size * 10 ) / 10 } ${ magnitudes[mag] }o`
}
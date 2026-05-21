export function downloadBlobURL(blobUrl: string, filename: string) {
    const link = document.createElement( "a" )

    link.href = blobUrl
    link.download = filename

    document.body.append( link )

    link.click()
    link.remove()

    setTimeout( () => URL.revokeObjectURL( blobUrl ), 7000 )
}

export function createBlobURL(data: BlobPart, mime: string): string {
    return URL.createObjectURL( new Blob( [ data ], { type: mime } ) )
}
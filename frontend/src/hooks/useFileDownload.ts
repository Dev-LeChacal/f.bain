import { useEffect, useRef, useState } from "react";
import { ForeignFile } from "../lib/crypto.ts";
import { formatFileSize } from "../lib/utils.ts";
import { getMime, isPreviewable } from "../lib/mime.ts";
import { createBlobURL, downloadBlobURL } from "../lib/blob.ts";

type DownloadStatus = "Loading" | "Ready" | "Downloading" | "Done" | "Error"

interface ProgressState {
    status: DownloadStatus
    text: string
    progress: number
}

const ERROR_STATE = (text: string): ProgressState => ({ status: "Error", text, progress: 1 })

export function useFileDownload(uuid: string | undefined, hash: string) {
    const [ progress, setProgress ] = useState<ProgressState>( {
        status: "Loading",
        text: "Fetching file metadata",
        progress: 0
    } )

    const [ filename, setFilename ] = useState( "" )
    const [ fileSize, setFileSize ] = useState( "" )
    const [ previewUrl, setPreviewUrl ] = useState<string | null>( null )
    const [ downloaded, setDownloaded ] = useState( false )

    const fileRef = useRef<ForeignFile | null>( null )
    const blobRef = useRef<string | null>( null )

    const isNotValid = !uuid || !hash

    useEffect( () => {
        if ( isNotValid ) return

        ForeignFile.fromIDPair( "", uuid, hash ).then( file => {
            fileRef.current = file
            setFilename( file.filename )
            setFileSize( formatFileSize( file.size ) )

            if ( isPreviewable( file.filename, file.size ) ) {
                file.getData( (p: Partial<ProgressState>) => setProgress( prev => ({ ...prev, ...p }) ) ).then( blob => {
                    const url = createBlobURL( blob, getMime( file.filename ) )

                    blobRef.current = url
                    setPreviewUrl( url )

                    setDownloaded( true )
                    setProgress( { status: "Done", text: "Save", progress: 1 } )
                } )

            } else {
                setProgress( { status: "Ready", text: "Download", progress: 0 } )
            }

        } ).catch( (e: unknown) => setProgress( ERROR_STATE( String( e ) ) ) )
    }, [ uuid, hash, isNotValid ] )

    useEffect( () => {
        return () => {
            if ( blobRef.current ) URL.revokeObjectURL( blobRef.current )
        }
    }, [] )

    const effectiveProgress = isNotValid ? ERROR_STATE( "Invalid link" ) : progress

    const handleDownload = async () => {
        if ( downloaded ) {
            if ( blobRef.current && filename ) downloadBlobURL( blobRef.current, filename )

            return
        }

        if ( !fileRef.current ) return

        setDownloaded( true )
        setProgress( { status: "Downloading", text: "Downloading", progress: 0 } )

        try {
            const blob = await fileRef.current.getData( (p: Partial<ProgressState>) => {
                setProgress( prev => ({ ...prev, ...p }) )
            } )

            downloadBlobURL( URL.createObjectURL( blob ), filename )
            setProgress( { status: "Done", text: "File downloaded", progress: 1 } )

        } catch {
            setDownloaded( false )
            setProgress( ERROR_STATE( "Download failed" ) )
        }
    }

    return { progress: effectiveProgress, filename, fileSize, previewUrl, handleDownload }
}
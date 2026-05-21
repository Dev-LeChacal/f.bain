import * as React from "react";
import { useEffect, useRef, useState } from "react";
import { formatFileSize } from "../lib/utils.ts";

type UploadStatus = "idle" | "uploading" | "error" | "success"

interface ProgressState {
    status: UploadStatus
    text: string
    progress: number
}

const KEY_STRENGTH = 14

const Upload = () => {
    const [ status, setStatus ] = useState<UploadStatus>( "idle" )
    const [ progress, setProgress ] = useState<ProgressState>( { status: "idle", text: "", progress: 0 } )
    const [ maxFileSize, setMaxFileSize ] = useState( 500000000 )

    const inputRef = useRef<HTMLInputElement>( null )

    useEffect( () => {
        if ( !import.meta.env.DEV ) {
            fetch( "/max-filesize" ).then( (r) => r.json() ).then( (json) => setMaxFileSize( json.max ) );
        }
    }, [] )

    const handleFile = (file: File) => {
        if ( file.size >= maxFileSize ) {
            setStatus( "error" )
            setProgress( { status: "error", text: "The file is too large", progress: 1 } )

            return
        }

        setStatus( "uploading" )
        setProgress( { status: "idle", text: "Generating key", progress: 0 } )

        const worker = new Worker(
            new URL( "../workers/upload.worker.ts", import.meta.url ),
            { type: "module" }
        )

        worker.onmessage = (e) => {
            const { type, payload } = e.data

            if ( type === "progress" ) {
                setProgress( (prev) => ({
                    ...prev,
                    text: payload.statusText ?? prev.text,
                    progress: payload.progress ?? prev.progress,
                    status: (payload.status as UploadStatus) ?? prev.status,
                }) )

            } else if ( type === "done" ) {
                setStatus( "success" );
                setProgress( { status: "success", text: "Redirecting ...", progress: 1 } )

                setTimeout( () => {
                    window.location.href = `/${ payload.uuid }?rt=${ payload.revocationToken }#${ payload.password }`
                }, 1500 )

                worker.terminate()

            } else if ( type === "error" ) {
                setStatus( "error" )
                setProgress( { status: "error", text: payload, progress: 1 } )
                worker.terminate()
            }
        };

        worker.postMessage( { file, keyLength: KEY_STRENGTH } )
    }

    const onFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if ( file ) void handleFile( file );
    }

    const onDrop = (e: React.DragEvent) => {
        e.preventDefault();

        const file = e.dataTransfer.items ? e.dataTransfer.items[0].getAsFile() : e.dataTransfer.files[0];

        if ( file ) void handleFile( file );
    }

    const progressColor = status === "error" ? "bg-(--error)" : status === "success" ? "bg-(--success)" : "bg-(--white)"

    return (
        <div
            className={ "relative w-full h-screen" + status === "idle" ? "cursor-pointer" : "" }
            onDragOver={ (e) => e.preventDefault() }
            onDrop={ onDrop }
            onClick={ () => status === "idle" && inputRef.current?.click() }
        >
            <input ref={ inputRef } type="file" className="hidden" onChange={ onFileInput }/>

            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-center">
                { status === "idle" && (
                    <>
                        <img src="/share.svg" alt="upload" className="mx-auto"/>
                        <p className="mt-2 text-(--primary)">Click or drop to upload</p>
                    </>
                ) }

                { status !== "idle" && (
                    <>
                        <div className="w-75 h-4 bg-(--background) rounded-full px-1 mx-auto">
                            <div
                                className={ `h-2 rounded-full transition-all duration-100 ${ progressColor }` }
                                style={ { width: `${ progress.progress * 100 }%` } }
                            />
                        </div>

                        <p className="mt-2 text-(--primary)">{ progress.text }</p>
                    </>
                ) }
            </div>

            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-center">
                <p className="text-sm text-(--primary)">
                    Max file size: <span className="text-(--white)">{ formatFileSize( maxFileSize ) }</span>
                </p>
            </div>
        </div>
    )
}

export default Upload

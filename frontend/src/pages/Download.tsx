import { useEffect, useRef, useState } from 'react'
import { useLocation, useParams } from 'react-router-dom'
import { ForeignFile } from '../lib/crypto'

type DownloadStatus = 'loading' | 'ready' | 'downloading' | 'done' | 'error'

interface ProgressState {
    status: DownloadStatus
    text: string
    progress: number
}

function getSizeHumanReadable(size: number): string {
    const magnitudes = [ '', 'K', 'M', 'G', 'T' ]
    let mag = 0
    while ( size >= 1000 && mag < 4 ) {
        size /= 1000
        mag++
    }
    return `${ Math.round( size * 10 ) / 10 } ${ magnitudes[mag] }B`
}

function downloadBlobURL(blobUrl: string, filename: string) {
    const link = document.createElement( 'a' )
    link.href = blobUrl
    link.download = filename
    document.body.append( link )
    link.click()
    link.remove()
    setTimeout( () => URL.revokeObjectURL( blobUrl ), 7000 )
}

const Download = () => {
    const { uuid } = useParams<{ uuid: string }>()
    const location = useLocation()

    const [ progress, setProgress ] = useState<ProgressState>( {
        status: 'loading',
        text: 'Fetching file metadata',
        progress: 0
    } )
    const [ filename, setFilename ] = useState( '' )
    const [ fileSize, setFileSize ] = useState( '' )
    const [ previewUrl, setPreviewUrl ] = useState<string | null>( null )
    const [ showSettings, setShowSettings ] = useState( false )
    const [ revocationToken, setRevocationToken ] = useState( '' )
    const [ settingsText, setSettingsText ] = useState( '' )
    const [ tokenInput, setTokenInput ] = useState( '' )
    const [ hasToken, setHasToken ] = useState( false )
    const [ downloaded, setDownloaded ] = useState( false )

    const fileRef = useRef<ForeignFile | null>( null )
    const blobRef = useRef<string | null>( null )

    useEffect( () => {
        const hash = decodeURI( location.hash.substring( 1 ) )

        if ( !uuid || !hash ) {
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setProgress( { status: 'error', text: 'Invalid link', progress: 1 } )
            return
        }

        const url = new URL( location.search, window.location.href )
        const urlRevToken = url.searchParams.get( 'rt' )

        const token = urlRevToken
            ? (() => {
                window.history.replaceState( null, '', `/${ uuid }${ location.hash }` )
                localStorage.setItem( `revocation-${ uuid }`, urlRevToken )
                return urlRevToken
            })()
            : localStorage.getItem( `revocation-${ uuid }` ) || ''

        setRevocationToken( token )
        setHasToken( token !== '' )

        ForeignFile.fromIDPair( '', uuid, hash ).then( file => {
            fileRef.current = file
            setFilename( file.filename )
            setFileSize( getSizeHumanReadable( file.size ) )

            const lower = file.filename.toLowerCase()
            if ( file.size <= 10_000_000 && (lower.endsWith( '.jpg' ) || lower.endsWith( '.png' )) ) {
                file.getData( p => setProgress( prev => ({ ...prev, ...p as object }) ) ).then( blob => {
                    const url = URL.createObjectURL( blob )
                    blobRef.current = url
                    setPreviewUrl( url )
                    setDownloaded( true )
                    setProgress( { status: 'done', text: 'Save', progress: 1 } )
                } )
            } else {
                setProgress( { status: 'ready', text: 'Download', progress: 0 } )
            }
        } ).catch( e => {
            setProgress( { status: 'error', text: String( e ), progress: 1 } )
        } )

    }, [ location.hash, location.search, uuid ] )

    const handleDownload = async () => {
        if ( downloaded ) {
            if ( blobRef.current && filename ) downloadBlobURL( blobRef.current, filename )
            return
        }

        if ( !fileRef.current ) return

        setDownloaded( true )
        setProgress( { status: 'downloading', text: 'Downloading', progress: 0 } )

        try {
            const blob = await fileRef.current.getData( (p: object) => {
                setProgress( prev => ({ ...prev, ...p }) )
            } )
            downloadBlobURL( URL.createObjectURL( blob ), filename )
            setProgress( { status: 'done', text: 'File downloaded', progress: 1 } )

        } catch ( _ ) {
            setDownloaded( false )
            setProgress( { status: 'error', text: 'Download failed', progress: 1 } )
        }
    }

    const handleDelete = async () => {
        if ( !uuid ) return
        const confirmed = window.confirm( 'Are you sure?' )
        if ( !confirmed ) return
        const ok = await ForeignFile.delete( uuid, revocationToken )
        if ( ok ) {
            localStorage.removeItem( `revocation-${ uuid }` )
            window.location.href = '/'
        } else {
            setSettingsText( 'File deletion failed' )
        }
    }

    const handleExportToken = () => {
        setTokenInput( localStorage.getItem( `revocation-${ uuid }` ) || '' )
        localStorage.removeItem( `revocation-${ uuid }` )
        setSettingsText( "Removed revocation token from internal storage. You won't be able to delete this file without it." )
        setHasToken( false )
    }

    const handleImportToken = () => {
        if ( !tokenInput ) return
        localStorage.setItem( `revocation-${ uuid }`, tokenInput )
        setRevocationToken( tokenInput )
        setHasToken( true )
        setSettingsText( '' )
    }

    const progressColor = progress.status === 'error'
        ? 'bg-red-500'
        : progress.status === 'done'
            ? 'bg-green-500'
            : 'bg-white'

    const progressWidth = progress.status === 'error' || progress.status === 'done'
        ? '100%'
        : `${ (progress.progress as number) * 100 }%`

    return (
        <div className="flex flex-col items-center w-full min-h-screen pt-16">
            { previewUrl && (
                <img src={ previewUrl } alt="preview" className="max-w-[90vw] max-h-[60vh] mb-4"/>
            ) }

            <div className="flex flex-col items-center max-w-[min(500px,90vw)] w-full mx-4">
                <div className="flex flex-row items-center gap-4">
                    <img src="/file.svg" alt="file" height="90"/>
                    <div className="text-left">
                        <p className="text-white font-medium break-all mb-1">{ filename }</p>
                        <p className="text-sm text-gray-400 mb-2">{ fileSize }</p>

                        <div className="flex flex-row gap-2">
                            <div
                                className="relative flex items-center justify-center w-48 h-8 bg-[#2A2A3C] rounded-full cursor-pointer overflow-hidden"
                                onClick={ handleDownload }
                            >
                                <div
                                    className={ `absolute left-0 top-0 h-full rounded-full transition-all duration-100 opacity-80 ${ progressColor }` }
                                    style={ { width: progressWidth } }
                                />
                                <p className="relative z-10 text-sm text-white select-none">{ progress.text }</p>
                            </div>

                            <div
                                className="flex items-center justify-center w-8 h-8 bg-[#21212f] rounded-full cursor-pointer hover:brightness-125"
                                onClick={ () => setShowSettings( !showSettings ) }
                            >
                                <img src="/settings.svg" alt="settings" className="h-full p-1.5"/>
                            </div>
                        </div>
                    </div>
                </div>

                { showSettings && (
                    <div className="w-full mt-6">
                        <div className="flex gap-2 w-full">
                            <button
                                className="flex-1 bg-[#21212f] text-white rounded-2xl py-1 px-2 cursor-pointer hover:brightness-125"
                                onClick={ hasToken ? handleExportToken : handleImportToken }
                            >
                                { hasToken ? 'Export token' : 'Import token' }
                            </button>
                            <button
                                className="flex-1 bg-[#21212f] text-white rounded-2xl py-1 px-2 cursor-pointer hover:brightness-125 disabled:opacity-40"
                                onClick={ handleDelete }
                                disabled={ !hasToken }
                            >
                                Delete file
                            </button>
                        </div>

                        { settingsText && (
                            <p className="text-sm mt-2 text-gray-400">{ settingsText }</p>
                        ) }

                        { !hasToken && (
                            <div className="mt-2 text-sm text-gray-400">
                                <span>Revocation token: </span>
                                <input
                                    type="text"
                                    className="bg-[#21212f] text-white px-2 py-0.5 border-none"
                                    value={ tokenInput }
                                    onChange={ e => setTokenInput( e.target.value ) }
                                />
                            </div>
                        ) }
                    </div>
                ) }
            </div>
        </div>
    )
}

export default Download
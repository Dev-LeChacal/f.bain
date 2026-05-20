const KEY_ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
const BLOCK_SIZE = 1024 * 1024;
const PBKDF2_ITERATIONS = 1_000_000;

export function generatePassword(length: number): string {
    const array = new Uint8Array( length );
    let output = "";

    while ( output.length < length ) {
        window.crypto.getRandomValues( array );

        for ( let i = 0; i < array.length; i++ ) {
            if ( array[i] > Math.floor( 255 / KEY_ALPHABET.length ) * KEY_ALPHABET.length ) continue;

            output += KEY_ALPHABET[Math.abs( array[i] % KEY_ALPHABET.length )];

            if ( output.length === length ) break;
        }
    }

    return output;
}

function wait(milliseconds: number): Promise<void> {
    return new Promise( (res) => setTimeout( () => res(), milliseconds ) );
}

export class CryptoPair {
    readonly filenameIVBase: ArrayBuffer;
    readonly blockIVBase: ArrayBuffer;
    readonly password: string;
    readonly key: CryptoKey;

    private _filenameEncrypted = false;
    private rolledBack = false;
    private blockNumber = 0;

    constructor(password: string, key: CryptoKey, blockIVBase: ArrayBuffer, filenameIVBase: ArrayBuffer) {
        this.filenameIVBase = filenameIVBase;
        this.blockIVBase = blockIVBase;
        this.password = password;
        this.key = key;
    }

    static async fromPassword(password: string, salt: Uint8Array<ArrayBuffer>): Promise<CryptoPair> {
        const subtle = window.crypto.subtle;

        const importedPassword = await subtle.importKey(
            "raw",
            new TextEncoder().encode( password ),
            "PBKDF2",
            false,
            [ "deriveBits" ]
        );

        const strengthened = await subtle.deriveBits(
            { name: "PBKDF2", hash: "SHA-256", salt, iterations: PBKDF2_ITERATIONS },
            importedPassword,
            256
        );

        const key = await subtle.importKey(
            "raw",
            strengthened.slice( 0, 16 ) as ArrayBuffer,
            "AES-GCM",
            false,
            [ "encrypt", "decrypt" ]
        );

        return new CryptoPair( password, key, strengthened.slice( 16, 24 ) as ArrayBuffer, strengthened.slice( 24, 32 ) as ArrayBuffer );
    }

    async encryptFilename(filename: string): Promise<string> {
        if ( this._filenameEncrypted ) throw new Error( "Cannot encrypt twice using the same IV" );

        this._filenameEncrypted = true;

        const enc_bytes = await window.crypto.subtle.encrypt(
            { name: "AES-GCM", iv: this.genFullIV( this.filenameIVBase, 0 ), tagLength: 128 },
            this.key,
            new TextEncoder().encode( filename )
        );

        return btoa( new Uint8Array( enc_bytes ).reduce( (data, byte) => data + String.fromCharCode( byte ), '' ) );
    }

    async encryptBlock(blockData: Uint8Array<ArrayBuffer>): Promise<ArrayBuffer> {
        const cipher = await window.crypto.subtle.encrypt(
            { name: "AES-GCM", iv: this.genFullIV( this.blockIVBase, this.blockNumber++ ), tagLength: 128 },
            this.key,
            blockData
        );

        this.rolledBack = false;

        return cipher;
    }

    async rollbackIV(): Promise<void> {
        if ( !this.rolledBack ) {
            this.blockNumber--;
            this.rolledBack = true;
        }
    }

    async decryptFilename(cipher: string): Promise<string> {
        const b64 = atob( cipher );
        const decoded_cipher = new Uint8Array( b64.length ) as unknown as Uint8Array<ArrayBuffer>;

        for ( let i = 0; i < b64.length; i++ ) decoded_cipher[i] = b64.charCodeAt( i );

        return new TextDecoder().decode( await window.crypto.subtle.decrypt(
            { name: "AES-GCM", iv: this.genFullIV( this.filenameIVBase, 0 ), tagLength: 128 },
            this.key,
            decoded_cipher
        ) );
    }

    async decryptBlock(cipher: ArrayBuffer): Promise<ArrayBuffer> {
        return await window.crypto.subtle.decrypt(
            { name: "AES-GCM", iv: this.genFullIV( this.blockIVBase, this.blockNumber++ ), tagLength: 128 },
            this.key,
            cipher
        );
    }

    private genFullIV(ivBase: ArrayBuffer, n = 0): Uint8Array<ArrayBuffer> {
        const iv = new Uint8Array( 12 ) as Uint8Array<ArrayBuffer>;

        iv.set( new Uint8Array( ivBase ), 0 );
        iv.set( new Uint8Array( [ n >> 24 & 0xff, n >> 16 & 0xff, n >> 8 & 0xff, n & 0xff ] ), 8 );

        return iv;
    }
}

export class LocalFile {
    private file: File;

    constructor(file: File) {
        this.file = file;
    }

    async upload(keyLength: number, progressHandler: (p: object) => void, host = ""): Promise<{
        uuid: string,
        revocationToken: string,
        password: string
    }> {
        if ( window.crypto === undefined ) throw new Error( "browser does not support necessary cryptographic API" );

        const salt = new Uint8Array( 32 ) as Uint8Array<ArrayBuffer>;
        window.crypto.getRandomValues( salt );

        const password = generatePassword( keyLength );

        let keyPair: CryptoPair;
        try {
            keyPair = await CryptoPair.fromPassword( password, salt );
        } catch ( e ) {
            console.log( e );
            throw new Error( "failed to construct encryption pair", { cause: e } );
        }

        progressHandler( { statusText: "encrypting filename" } );
        let encryptedFilename: string;
        try {
            encryptedFilename = await keyPair.encryptFilename( this.file.name );
        } catch ( e ) {
            console.log( e );
            throw new Error( "failed to encrypt file name", { cause: e } );
        }

        progressHandler( { statusText: "creating session" } );
        const contentLength = Math.ceil( this.file.size / BLOCK_SIZE ) * 16 + this.file.size;
        const sessionToken = await this._createUploadSession( host, encryptedFilename, salt, contentLength );
        const response = await this._uploadWithSession( host, sessionToken, keyPair, progressHandler );

        return {
            uuid: response.uuid,
            revocationToken: response.revocation_token,
            password
        };
    }

    private async _createUploadSession(host: string, encryptedFilename: string, saltArray: Uint8Array<ArrayBuffer>, contentLength: number): Promise<string> {
        const response = await fetch( `${ host }/upload`, {
            method: "POST",
            body: JSON.stringify( {
                filename: encryptedFilename,
                salt: Array.from( saltArray ),
                content_length: contentLength
            } ),
            headers: { "content-type": "application/json" }
        } );

        if ( response.status === 422 ) {
            const error = await response.json();
            let error_msg = "";
            for ( const e of error.detail ) error_msg += e.loc + ": " + e.msg + "\n";
            throw new Error( error_msg );
        }

        if ( !response.ok ) throw new Error( "failed to create session" );

        return (await response.json()).session_token;
    }

    private async _uploadWithSession(host: string, sessionToken: string, keyPair: CryptoPair, progressHandler: (p: object) => void): Promise<{
        uuid: string,
        revocation_token: string
    }> {
        let done = false;

        while ( !done ) {
            const promise = new Promise<{ uuid: string, revocation_token: string }>( (resolve, reject) => {
                const socket = new WebSocket( `wss://${ host ? new URL( host ).host : location.host }/upload/${ sessionToken }` );

                socket.onopen = () => {
                    progressHandler( { status: "neutral", statusText: "uploading file" } );
                };

                socket.onmessage = async (event) => {
                    const data = JSON.parse( event.data );

                    switch ( data.code ) {
                        case 201:
                            resolve( data );
                            break;
                        case 100: {
                            const offset = data.block * BLOCK_SIZE;
                            if ( offset > this.file.size ) {
                                socket.close( 1000 );
                                done = true;
                                reject( new Error( "server requested more data than anticipated" ) );
                                return;
                            }
                            let cipher: ArrayBuffer;
                            try {
                                const blockData = new Uint8Array( await this.file.slice( offset, offset + BLOCK_SIZE ).arrayBuffer() ) as Uint8Array<ArrayBuffer>;
                                cipher = await keyPair.encryptBlock( blockData );
                            } catch ( e ) {
                                done = true;
                                reject( e );
                                return;
                            }
                            socket.send( cipher );
                            progressHandler( { progress: offset / this.file.size } );
                            break;
                        }
                        case 414:
                        case 401:
                            reject( new Error( data.detail ) );
                            break;
                    }
                };

                socket.onclose = () => {
                    if ( !done ) reject( new Error( "closed before finished" ) );
                };

                socket.onerror = (event) => {
                    console.log( event );
                    reject( new Error( "error while uploading" ) );
                };
            } );

            try {
                return await promise;
            } catch ( e ) {
                if ( done ) throw e;
                else {
                    console.log( e );
                    await keyPair.rollbackIV();
                }
            }

            progressHandler( { statusText: "Reconnecting in 10s", status: "error" } );
            await wait( 10000 );
            progressHandler( { statusText: "Reconnecting...", status: "error" } );
        }

        throw new Error( "upload failed" );
    }
}

export class ForeignFile {
    readonly host: string;
    readonly id: string;
    readonly filename: string;
    readonly size: number;
    private _keyPair: CryptoPair;

    constructor(host: string, id: string, keyPair: CryptoPair, filename: string, size: number) {
        this.host = host;
        this.id = id;
        this._keyPair = keyPair;
        this.filename = filename;
        this.size = size;
    }

    static async fromIDPair(host: string, id: string, password: string): Promise<ForeignFile> {
        const resp = await fetch( `${ host }/${ id }/meta` );
        if ( !resp.ok ) throw new Error( "failed to fetch information" );

        const resp_json = await resp.json();

        let keyPair: CryptoPair;
        try {
            keyPair = await CryptoPair.fromPassword( password, new Uint8Array( resp_json.salt ) as Uint8Array<ArrayBuffer> );
        } catch ( e ) {
            console.log( e );
            throw new Error( "failed to create key pair", { cause: e } );
        }

        let filename: string;
        try {
            filename = await keyPair.decryptFilename( resp_json.filename );
        } catch ( e ) {
            console.log( e );
            throw new Error( "failed to decrypt", { cause: e } );
        }

        return new ForeignFile( host, id, keyPair, filename, resp_json.content_length );
    }

    static async delete(file_id: string, revocationToken: string): Promise<boolean> {
        const resp = await fetch( "/" + file_id, {
            method: "DELETE",
            headers: { authorization: revocationToken }
        } );
        return resp.status === 200;
    }

    static async expires_at(file_id: string, revocationToken: string): Promise<number> {
        const resp = await fetch( `/${ file_id }/expire`, {
            headers: { authorization: revocationToken }
        } );
        if ( resp.ok ) {
            const contents = await resp.json();
            return contents.expires_at;
        }
        return -2;
    }

    static async set_expires_at(file_id: string, revocationToken: string, timestamp: number): Promise<boolean> {
        const resp = await fetch( `/${ file_id }/expire`, {
            method: "PUT",
            body: JSON.stringify( { "expires_at": timestamp } ),
            headers: { authorization: revocationToken, "content-type": "application/json" }
        } );
        return resp.status === 200;
    }

    async getData(progressHandler: (p: object) => void): Promise<Blob> {
        let done = false;
        let offset = 0;
        let blob = new Blob( [] );

        while ( !done ) {
            const promise = new Promise<Blob>( (resolve, reject) => {
                const socket = new WebSocket( `wss://${ this.host || location.host }/${ this.id }/raw` );
                let first_msg = true;

                socket.onopen = () => {
                    progressHandler( { statusText: "Downloading", status: "neutral", progress: offset / this.size } );
                };

                socket.onmessage = async (event) => {
                    const data = event.data;

                    if ( first_msg ) {
                        const json = JSON.parse( data );
                        if ( json.code != 200 ) {
                            done = true;
                            reject( new Error( "File was not found" ) );
                            return;
                        }
                        socket.send( JSON.stringify( { "read": BLOCK_SIZE + 16, "seek": offset } ) );
                        first_msg = false;
                        return;
                    }

                    try {
                        blob = new Blob( [ blob, await this._keyPair.decryptBlock( await data.arrayBuffer() ) ] );
                    } catch ( e ) {
                        done = true;
                        reject( e );
                        return;
                    }

                    offset += data.size;
                    progressHandler( { progress: offset / this.size } );

                    if ( offset == this.size ) {
                        done = true;
                        socket.close( 1000 );
                        resolve( blob );
                        return;
                    }

                    socket.send( JSON.stringify( { "read": BLOCK_SIZE + 16 } ) );
                };

                socket.onclose = () => {
                    if ( !done ) reject( new Error( "closed before finished" ) );
                };

                socket.onerror = (event) => {
                    console.log( event );
                    reject( new Error( "error while downloading" ) );
                };
            } );

            try {
                return await promise;
            } catch ( e ) {
                if ( done ) throw e;
                else console.log( e );
            }

            progressHandler( { statusText: "Reconnecting in 10s", status: "error" } );
            await wait( 10000 );
            progressHandler( { statusText: "Reconnecting...", status: "error" } );
        }

        throw new Error( "download failed" );
    }
}
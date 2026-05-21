import { LocalFile } from "../lib/crypto";

self.onmessage = async (e: MessageEvent) => {
    const { file, keyLength } = e.data;
    const localFile = new LocalFile( file );

    try {
        const result = await localFile.upload( keyLength, (p) => {
            self.postMessage( { type: "progress", payload: p } );
        } );

        self.postMessage( { type: "done", payload: result } );

    } catch ( err ) {
        self.postMessage( { type: "error", payload: String( err ) } );
    }
};
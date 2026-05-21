export function useRevocationToken(uuid: string | undefined, search: string, hash: string) {
    const urlRevToken = new URL( search, window.location.href ).searchParams.get( "rt" )

    if ( uuid && urlRevToken ) {
        window.history.replaceState( null, "", `/${ uuid }${ hash }` )
        localStorage.setItem( `revocation-${ uuid }`, urlRevToken )
    }

    const token = (uuid && urlRevToken)
        ? urlRevToken
        : (uuid ? localStorage.getItem( `revocation-${ uuid }` ) : null) || ""

    return {
        revocationToken: token,
        hasToken: token !== ""
    }
}
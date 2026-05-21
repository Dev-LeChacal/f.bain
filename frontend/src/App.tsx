import { BrowserRouter, Route, Routes } from "react-router-dom"
import Upload from "./components/Upload.tsx"
import Download from "./components/Download.tsx"

const App = () => {
    return (
        <BrowserRouter>
            <Routes>
                <Route path="/" element={ <Upload/> }/>
                <Route path="/:uuid" element={ <Download/> }/>
            </Routes>
        </BrowserRouter>
    )
}

export default App
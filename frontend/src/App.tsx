import { BrowserRouter, Route, Routes } from 'react-router-dom'
import Upload from './pages/Upload'
import Download from './pages/Download'

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
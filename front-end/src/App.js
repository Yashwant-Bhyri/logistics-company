import { BrowserRouter as Router, Routes, Route } from "react-router-dom";

import LoginPage from "./pages/LoginPage";

import RegisterPage from "./pages/RegisterPage";
import CustomerPage from "./pages/CustomerPage";
import DriverPage from "./pages/DriverPage";
import AdminPage from "./pages/AdminPage";
import DriverSetupPage from "./pages/DriverSetupPage";
import OpsCommsPage from "./pages/OpsCommsPage";

function App() {
    return (
        <Router>
            <Routes>

                {/* ENTRY */}
                <Route path="/" element={<LoginPage />} />
                <Route path="/login" element={<LoginPage />} />

                {/* OTHER PAGES */}
                <Route path="/register" element={<RegisterPage />} />
                <Route path="/customer" element={<CustomerPage />} />
                <Route path="/driver" element={<DriverPage />} />
                <Route path="/admin" element={<AdminPage />} />
                <Route path="/ops-comms" element={<OpsCommsPage />} />

                <Route path="/driver/set_password" element={<DriverSetupPage />} />

            </Routes>
        </Router>
    );
}

export default App;

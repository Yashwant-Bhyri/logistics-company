// Login Page
import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";

export default function LoginPage() {
    const [identifier, setIdentifier] = useState("");
    const [role, setRole] = useState("customer");
    const navigate = useNavigate();
    const [password, setPassword] = useState("");
    const [loading, setLoading] = useState(false);

    const handleLogin = async () => {
        setLoading(true);
        try {
            const response = await fetch("/login", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    identifier,
                    role,
                    password
                })
            });

            const raw = await response.text();
            let data = {};
            try {
                data = raw ? JSON.parse(raw) : {};
            } catch {
                data = { message: raw?.slice(0, 200) || response.statusText };
            }

            if (response.ok) {
                if (data.token) {
                    localStorage.setItem("token", data.token);
                }
                alert("✅ Login successful!");
                if (role === "customer") navigate("/customer", {
                    state: {
                        customerId: data.customer_id,
                        customerName: data.name
                    }
                });
                if (role === "driver") {
                    localStorage.setItem("driver_id", data.driver_id);
                    navigate("/driver");
                }
                if (role === "admin") {
                    if (data.admin_id != null) localStorage.setItem("admin_id", String(data.admin_id));
                    if (data.name) localStorage.setItem("admin_name", data.name);
                    navigate("/admin");
                }
            } else {
                alert(data.message || "❌ Login failed");
            }
        } catch (error) {
            console.error(error);
            const msg = error?.message || String(error);
            alert(
                `❌ Could not reach the API. Is Flask running on port 5000?\n\n${msg}`
            );
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style={{
            minHeight: "100vh",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            backgroundColor: "#f5f7fa",
            fontFamily: "system-ui, -apple-system, sans-serif"
        }}>
            <div style={{
                maxWidth: "450px",
                width: "100%",
                margin: "20px",
                padding: "35px",
                backgroundColor: "white",
                borderRadius: "16px",
                boxShadow: "0 4px 20px rgba(0,0,0,0.1)",
                border: "1px solid #e0e4e8"
            }}>
                {/* Logo/Header */}
                <div style={{ textAlign: "center", marginBottom: "30px" }}>
                    <div style={{
                        fontSize: "48px",
                        marginBottom: "10px"
                    }}>
                        📦
                    </div>
                    <h2 style={{
                        color: "#2c3e50",
                        margin: "0 0 5px 0",
                        fontSize: "24px",
                        fontWeight: "600"
                    }}>
                        LOGISTICS COMPANY<sup style={{ fontSize: "12px" }}>™</sup>
                    </h2>
                    <p style={{
                        color: "#7f8c8d",
                        margin: "0",
                        fontSize: "14px"
                    }}>
                        Sign in to your account
                    </p>
                </div>

                {/* Login Form */}
                <div style={{ marginBottom: "20px" }}>
                    <label style={{
                        display: "block",
                        marginBottom: "8px",
                        color: "#2c3e50",
                        fontWeight: "500",
                        fontSize: "14px"
                    }}>
                        📧 Email or Phone Number
                    </label>
                    <input
                        type="text"
                        placeholder="Enter your email or phone"
                        value={identifier}
                        onChange={(e) => setIdentifier(e.target.value)}
                        style={{
                            width: "100%",
                            padding: "12px 15px",
                            border: "1px solid #ddd",
                            borderRadius: "8px",
                            fontSize: "14px",
                            boxSizing: "border-box",
                            transition: "border-color 0.2s",
                            outline: "none"
                        }}
                        onFocus={(e) => e.target.style.borderColor = "#007bff"}
                        onBlur={(e) => e.target.style.borderColor = "#ddd"}
                    />
                </div>

                <div style={{ marginBottom: "20px" }}>
                    <label style={{
                        display: "block",
                        marginBottom: "8px",
                        color: "#2c3e50",
                        fontWeight: "500",
                        fontSize: "14px"
                    }}>
                        🔒 Password
                    </label>
                    <input
                        type="password"
                        placeholder="Enter your password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        onKeyPress={(e) => e.key === 'Enter' && handleLogin()}
                        style={{
                            width: "100%",
                            padding: "12px 15px",
                            border: "1px solid #ddd",
                            borderRadius: "8px",
                            fontSize: "14px",
                            boxSizing: "border-box",
                            transition: "border-color 0.2s",
                            outline: "none"
                        }}
                        onFocus={(e) => e.target.style.borderColor = "#007bff"}
                        onBlur={(e) => e.target.style.borderColor = "#ddd"}
                    />
                </div>

                <div style={{ marginBottom: "25px" }}>
                    <label style={{
                        display: "block",
                        marginBottom: "8px",
                        color: "#2c3e50",
                        fontWeight: "500",
                        fontSize: "14px"
                    }}>
                        👤 Role
                    </label>
                    <select
                        value={role}
                        onChange={(e) => setRole(e.target.value)}
                        style={{
                            width: "100%",
                            padding: "12px 15px",
                            border: "1px solid #ddd",
                            borderRadius: "8px",
                            fontSize: "14px",
                            backgroundColor: "white",
                            cursor: "pointer",
                            outline: "none"
                        }}
                    >
                        <option value="customer">Customer</option>
                        <option value="driver">Driver</option>
                        <option value="admin">Admin</option>
                    </select>
                </div>

                <button
                    onClick={handleLogin}
                    disabled={loading}
                    style={{
                        width: "100%",
                        padding: "12px",
                        backgroundColor: loading ? "#6c757d" : "#007bff",
                        color: "white",
                        border: "none",
                        borderRadius: "8px",
                        fontSize: "16px",
                        fontWeight: "600",
                        cursor: loading ? "not-allowed" : "pointer",
                        transition: "background-color 0.2s",
                        marginBottom: "20px"
                    }}
                    onMouseEnter={(e) => {
                        if (!loading) e.target.style.backgroundColor = "#0056b3";
                    }}
                    onMouseLeave={(e) => {
                        if (!loading) e.target.style.backgroundColor = "#007bff";
                    }}
                >
                    {loading ? "⏳ Logging in..." : "🔓 Login"}
                </button>

                {/* Links */}
                <div style={{
                    textAlign: "center",
                    borderTop: "1px solid #e0e4e8",
                    paddingTop: "20px"
                }}>
                    <p style={{ margin: "0 0 10px 0", fontSize: "14px" }}>
                        Don't have an account?{" "}
                        <Link to="/register" style={{
                            color: "#007bff",
                            textDecoration: "none",
                            fontWeight: "500"
                        }}>
                            Register here
                        </Link>
                    </p>
                    <p style={{ margin: "0", fontSize: "14px" }}>
                        New driver?{" "}
                        <Link to="/driver/set_password?token=test123" style={{
                            color: "#28a745",
                            textDecoration: "none",
                            fontWeight: "500"
                        }}>
                            Activate your account
                        </Link>
                    </p>
                </div>

                {/* Demo credentials hint */}
                <div style={{
                    marginTop: "20px",
                    padding: "12px",
                    backgroundColor: "#f8f9fa",
                    borderRadius: "8px",
                    fontSize: "12px",
                    color: "#6c757d",
                    textAlign: "center"
                }}>
                    <strong>💡 Demo Credentials:</strong><br />
                    Customer: customer@example.com / password<br />
                    Driver: driver@example.com / password
                </div>
            </div>
        </div>
    );
}
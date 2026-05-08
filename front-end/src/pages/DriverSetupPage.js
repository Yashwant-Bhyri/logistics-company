//Driver Register
import React, { useState } from "react";
import { useNavigate, Link } from "react-router-dom";

export default function DriverSetupPage() {
    const [token, setToken] = useState("");
    const [verified, setVerified] = useState(false);
    const [driverId, setDriverId] = useState("");
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [loading, setLoading] = useState(false);
    const [isButtonHovered, setIsButtonHovered] = useState(false);
    const navigate = useNavigate();

    // STEP 1: verify token
    const verifyToken = async () => {
        if (!token.trim()) {
            alert("Please enter your activation token");
            return;
        }
        setLoading(true);
        try {
            const res = await fetch("/driver/verify_token", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ token })
            });
            const data = await res.json();
            if (data.valid) {
                setVerified(true);
                setDriverId(data.driver_id);
            } else {
                alert(data.message);
            }
        } catch (error) {
            alert("Error verifying token. Please try again.");
        } finally {
            setLoading(false);
        }
    };

    // STEP 2: set password
    const handleSetPassword = async () => {
        if (password !== confirmPassword) {
            alert("Passwords do not match");
            return;
        }
        if (password.length < 6) {
            alert("Password must be at least 6 characters");
            return;
        }
        setLoading(true);
        try {
            const res = await fetch("/driver/set_password", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ token, password })
            });
            const data = await res.json();
            if (res.ok) {
                alert("Account activated successfully! Please log in.");
                navigate("/login");
            } else {
                alert(data.message);
            }
        } catch (error) {
            alert("Error setting password. Please try again.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style={styles.container}>
            <div style={styles.card}>
                {/* Logo/Header */}
                <div style={styles.header}>
                    <div style={styles.icon}>🚛</div>
                    <h1 style={styles.title}>Driver Account Setup</h1>
                    <p style={styles.subtitle}>Activate your driver account</p>
                </div>

                {/* STEP 1 - Token Verification */}
                {!verified && (
                    <div style={styles.section}>
                        <h3 style={styles.sectionTitle}>Step 1: Verify Your Token</h3>
                        <div style={styles.formGroup}>
                            <label style={styles.label}>🔑 Activation Token</label>
                            <input
                                type="text"
                                placeholder="Enter your activation token"
                                value={token}
                                onChange={(e) => setToken(e.target.value)}
                                style={styles.input}
                                onFocus={(e) => e.target.style.borderColor = "#007bff"}
                                onBlur={(e) => e.target.style.borderColor = "#ddd"}
                                onKeyPress={(e) => e.key === 'Enter' && verifyToken()}
                            />
                            <p style={styles.hint}>
                                Enter the token provided by your administrator to activate your account.
                            </p>
                        </div>
                        <button
                            onClick={verifyToken}
                            disabled={loading}
                            onMouseEnter={() => setIsButtonHovered(true)}
                            onMouseLeave={() => setIsButtonHovered(false)}
                            style={{
                                ...styles.button,
                                backgroundColor: loading ? "#6c757d" : (isButtonHovered ? "#0056b3" : "#007bff"),
                                cursor: loading ? "not-allowed" : "pointer"
                            }}
                        >
                            {loading ? "⏳ Verifying..." : "🔓 Verify Token"}
                        </button>
                    </div>
                )}

                {/* STEP 2 - Set Password */}
                {verified && (
                    <div style={styles.section}>
                        <div style={styles.successBadge}>
                            ✅ Token Verified! Driver ID: <strong>{driverId}</strong>
                        </div>
                        <h3 style={styles.sectionTitle}>Step 2: Set Your Password</h3>
                        <div style={styles.formGroup}>
                            <label style={styles.label}>🔒 Password</label>
                            <input
                                type="password"
                                placeholder="Enter your password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                style={styles.input}
                                onFocus={(e) => e.target.style.borderColor = "#007bff"}
                                onBlur={(e) => e.target.style.borderColor = "#ddd"}
                            />
                        </div>
                        <div style={styles.formGroup}>
                            <label style={styles.label}>✓ Confirm Password</label>
                            <input
                                type="password"
                                placeholder="Confirm your password"
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                style={styles.input}
                                onFocus={(e) => e.target.style.borderColor = "#007bff"}
                                onBlur={(e) => e.target.style.borderColor = "#ddd"}
                                onKeyPress={(e) => e.key === 'Enter' && handleSetPassword()}
                            />
                        </div>
                        <div style={styles.passwordHint}>
                            <span>🔒 Password must be at least 6 characters</span>
                            {password && confirmPassword && password !== confirmPassword && (
                                <span style={styles.errorText}>⚠️ Passwords do not match</span>
                            )}
                        </div>
                        <button
                            onClick={handleSetPassword}
                            disabled={loading}
                            onMouseEnter={() => setIsButtonHovered(true)}
                            onMouseLeave={() => setIsButtonHovered(false)}
                            style={{
                                ...styles.button,
                                backgroundColor: loading ? "#6c757d" : (isButtonHovered ? "#0056b3" : "#007bff"),
                                cursor: loading ? "not-allowed" : "pointer"
                            }}
                        >
                            {loading ? "⏳ Activating..." : "✅ Activate Account"}
                        </button>
                    </div>
                )}

                {/* Back to Login Link - Fixed with React Router Link */}
                <div style={styles.footer}>
                    <Link
                        to="/login"
                        style={styles.link}
                        onMouseEnter={(e) => e.target.style.textDecoration = "underline"}
                        onMouseLeave={(e) => e.target.style.textDecoration = "none"}
                    >
                        ← Back to Login
                    </Link>
                </div>
            </div>
        </div>
    );
}

const styles = {
    container: {
        minHeight: "100vh",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        backgroundColor: "#f5f7fa",
        fontFamily: "system-ui, -apple-system, sans-serif",
        padding: "20px"
    },
    card: {
        maxWidth: "500px",
        width: "100%",
        backgroundColor: "white",
        borderRadius: "16px",
        boxShadow: "0 4px 20px rgba(0,0,0,0.1)",
        padding: "35px",
        border: "1px solid #e0e4e8"
    },
    header: {
        textAlign: "center",
        marginBottom: "30px"
    },
    icon: {
        fontSize: "48px",
        marginBottom: "10px"
    },
    title: {
        color: "#2c3e50",
        margin: "0 0 5px 0",
        fontSize: "24px",
        fontWeight: "600"
    },
    subtitle: {
        color: "#7f8c8d",
        margin: "0",
        fontSize: "14px"
    },
    section: {
        marginBottom: "25px"
    },
    sectionTitle: {
        color: "#2c3e50",
        fontSize: "18px",
        marginBottom: "20px",
        paddingBottom: "10px",
        borderBottom: "2px solid #e0e4e8"
    },
    formGroup: {
        marginBottom: "20px"
    },
    label: {
        display: "block",
        marginBottom: "8px",
        color: "#2c3e50",
        fontWeight: "500",
        fontSize: "14px"
    },
    input: {
        width: "100%",
        padding: "12px 15px",
        border: "1px solid #ddd",
        borderRadius: "8px",
        fontSize: "14px",
        boxSizing: "border-box",
        transition: "border-color 0.2s",
        outline: "none"
    },
    hint: {
        fontSize: "12px",
        color: "#7f8c8d",
        marginTop: "8px"
    },
    passwordHint: {
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        fontSize: "12px",
        marginBottom: "20px",
        flexWrap: "wrap",
        gap: "10px"
    },
    errorText: {
        color: "#dc3545"
    },
    button: {
        width: "100%",
        padding: "12px",
        color: "white",
        border: "none",
        borderRadius: "8px",
        fontSize: "16px",
        fontWeight: "600",
        transition: "background-color 0.2s"
    },
    successBadge: {
        backgroundColor: "#d4edda",
        color: "#155724",
        padding: "12px",
        borderRadius: "8px",
        marginBottom: "20px",
        textAlign: "center",
        fontSize: "14px",
        border: "1px solid #c3e6cb"
    },
    footer: {
        textAlign: "center",
        marginTop: "20px",
        paddingTop: "20px",
        borderTop: "1px solid #e0e4e8"
    },
    link: {
        color: "#007bff",
        textDecoration: "none",
        fontSize: "14px",
        cursor: "pointer"
    }
};
// Register Page
import React, { useState } from "react";
import { useNavigate, Link } from "react-router-dom";

export default function RegisterPage() {
    const [form, setForm] = useState({
        name: "",
        phone: "",
        email: "",
        address: "",
        password: ""
    });
    const [confirmPassword, setConfirmPassword] = useState("");
    const [loading, setLoading] = useState(false);
    const [isButtonHovered, setIsButtonHovered] = useState(false);
    const navigate = useNavigate();

    const handleRegister = async () => {
        if (!form.name || !form.phone || !form.email || !form.address || !form.password) {
            alert("Please fill in all fields");
            return;
        }
        if (form.password !== confirmPassword) {
            alert("Passwords do not match");
            return;
        }
        if (form.password.length < 6) {
            alert("Password must be at least 6 characters");
            return;
        }
        if (!form.email.includes("@")) {
            alert("Please enter a valid email address");
            return;
        }

        setLoading(true);
        try {
            const response = await fetch("/register", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(form)
            });
            const data = await response.json();
            if (response.ok) {
                alert("✅ Registration successful! Please log in.");
                navigate("/login");
            } else {
                alert(data.message || "Registration failed");
            }
        } catch (error) {
            console.error(error);
            alert("Server error. Please try again.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style={styles.container}>
            <div style={styles.card}>
                {/* Logo/Header */}
                <div style={styles.header}>
                    <div style={styles.icon}>📝</div>
                    <h1 style={styles.title}>Create Account</h1>
                    <p style={styles.subtitle}>Join as a new customer</p>
                </div>

                {/* Registration Form */}
                <div style={styles.form}>
                    <div style={styles.formRow}>
                        <div style={styles.formGroup}>
                            <label style={styles.label}>👤 Full Name</label>
                            <input
                                type="text"
                                placeholder="Enter your full name"
                                value={form.name}
                                onChange={(e) => setForm({ ...form, name: e.target.value })}
                                style={styles.input}
                                onFocus={(e) => e.target.style.borderColor = "#007bff"}
                                onBlur={(e) => e.target.style.borderColor = "#ddd"}
                            />
                        </div>
                        <div style={styles.formGroup}>
                            <label style={styles.label}>📞 Phone Number</label>
                            <input
                                type="tel"
                                placeholder="Enter your phone number"
                                value={form.phone}
                                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                                style={styles.input}
                                onFocus={(e) => e.target.style.borderColor = "#007bff"}
                                onBlur={(e) => e.target.style.borderColor = "#ddd"}
                            />
                        </div>
                    </div>

                    <div style={styles.formRow}>
                        <div style={styles.formGroup}>
                            <label style={styles.label}>📧 Email Address</label>
                            <input
                                type="email"
                                placeholder="Enter your email"
                                value={form.email}
                                onChange={(e) => setForm({ ...form, email: e.target.value })}
                                style={styles.input}
                                onFocus={(e) => e.target.style.borderColor = "#007bff"}
                                onBlur={(e) => e.target.style.borderColor = "#ddd"}
                            />
                        </div>
                        <div style={styles.formGroup}>
                            <label style={styles.label}>🏠 Shipping Address</label>
                            <input
                                type="text"
                                placeholder="Enter your shipping address"
                                value={form.address}
                                onChange={(e) => setForm({ ...form, address: e.target.value })}
                                style={styles.input}
                                onFocus={(e) => e.target.style.borderColor = "#007bff"}
                                onBlur={(e) => e.target.style.borderColor = "#ddd"}
                            />
                        </div>
                    </div>

                    <div style={styles.formRow}>
                        <div style={styles.formGroup}>
                            <label style={styles.label}>🔒 Password</label>
                            <input
                                type="password"
                                placeholder="Create a password"
                                value={form.password}
                                onChange={(e) => setForm({ ...form, password: e.target.value })}
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
                                onKeyPress={(e) => e.key === 'Enter' && handleRegister()}
                            />
                        </div>
                    </div>

                    {/* Password Hint */}
                    {form.password && confirmPassword && form.password !== confirmPassword && (
                        <div style={styles.errorAlert}>
                            ⚠️ Passwords do not match
                        </div>
                    )}
                    {form.password && form.password.length < 6 && (
                        <div style={styles.warningAlert}>
                            🔒 Password must be at least 6 characters
                        </div>
                    )}

                    {/* Register Button */}
                    <button
                        onClick={handleRegister}
                        disabled={loading}
                        onMouseEnter={() => setIsButtonHovered(true)}
                        onMouseLeave={() => setIsButtonHovered(false)}
                        style={{
                            ...styles.button,
                            backgroundColor: loading ? "#6c757d" : (isButtonHovered ? "#0056b3" : "#007bff"),
                            cursor: loading ? "not-allowed" : "pointer"
                        }}
                    >
                        {loading ? "⏳ Creating Account..." : "📝 Register"}
                    </button>

                    {/* Login Link */}
                    <div style={styles.footer}>
                        <span style={styles.footerText}>Already have an account?</span>
                        <Link
                            to="/login"
                            style={styles.link}
                            onMouseEnter={(e) => e.target.style.textDecoration = "underline"}
                            onMouseLeave={(e) => e.target.style.textDecoration = "none"}
                        >
                            Sign in here
                        </Link>
                    </div>
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
        maxWidth: "800px",
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
    form: {
        display: "flex",
        flexDirection: "column",
        gap: "20px"
    },
    formRow: {
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: "20px"
    },
    formGroup: {
        display: "flex",
        flexDirection: "column",
        gap: "8px"
    },
    label: {
        color: "#2c3e50",
        fontWeight: "500",
        fontSize: "14px"
    },
    input: {
        padding: "12px 15px",
        border: "1px solid #ddd",
        borderRadius: "8px",
        fontSize: "14px",
        transition: "border-color 0.2s",
        outline: "none",
        fontFamily: "inherit"
    },
    button: {
        width: "100%",
        padding: "12px",
        color: "white",
        border: "none",
        borderRadius: "8px",
        fontSize: "16px",
        fontWeight: "600",
        transition: "background-color 0.2s",
        marginTop: "10px"
    },
    footer: {
        textAlign: "center",
        marginTop: "20px",
        paddingTop: "20px",
        borderTop: "1px solid #e0e4e8",
        display: "flex",
        justifyContent: "center",
        gap: "8px"
    },
    footerText: {
        color: "#7f8c8d",
        fontSize: "14px"
    },
    link: {
        color: "#007bff",
        textDecoration: "none",
        fontSize: "14px",
        cursor: "pointer"
    },
    errorAlert: {
        backgroundColor: "#f8d7da",
        color: "#721c24",
        padding: "10px",
        borderRadius: "8px",
        fontSize: "13px",
        border: "1px solid #f5c6cb"
    },
    warningAlert: {
        backgroundColor: "#fff3cd",
        color: "#856404",
        padding: "10px",
        borderRadius: "8px",
        fontSize: "13px",
        border: "1px solid #ffeeba"
    }
};

//Responsive
const mediaQuery = "@media (max-width: 640px)";
const responsiveStyles = {
    [mediaQuery]: {
        formRow: {
            gridTemplateColumns: "1fr"
        }
    }
};

if (typeof window !== 'undefined' && window.matchMedia("(max-width: 640px)").matches) {
    const styleElement = document.createElement('style');
    styleElement.textContent = `
        @media (max-width: 640px) {
            .register-form-row {
                grid-template-columns: 1fr !important;
            }
        }
    `;
    document.head.appendChild(styleElement);
}
import React, { useState, useEffect, useRef } from "react";
import { useLocation, useNavigate, Link } from "react-router-dom";
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon-2x.png',
    iconUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon.png',
    shadowUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png',
});

function CustomerPage() {
    const [form, setForm] = useState({});
    const [orderId, setOrderId] = useState("");
    const [orders, setOrders] = useState([]);
    const [trackingOrder, setTrackingOrder] = useState(null);
    const [trackingInfo, setTrackingInfo] = useState(null);
    const [loading, setLoading] = useState(true);
    const [trackingLoading, setTrackingLoading] = useState(false);
    const [activeSection, setActiveSection] = useState("create");
    const [assistQuery, setAssistQuery] = useState("");
    const [assistAnswer, setAssistAnswer] = useState("");
    const [assistBusy, setAssistBusy] = useState(false);
    const [assistError, setAssistError] = useState("");
    const [notifChannel, setNotifChannel] = useState("sms");
    const [draftSubject, setDraftSubject] = useState("");
    const [draftBody, setDraftBody] = useState("");
    const [notifBusy, setNotifBusy] = useState(false);
    const location = useLocation();
    const navigate = useNavigate();
    const { customerId, customerName } = location.state || {};
    const mapRef = useRef(null);
    const mapInstanceRef = useRef(null);
    const markerRef = useRef(null);

    const getAuthHeaders = (includeJson = false) => {
        const token = localStorage.getItem("token");
        const headers = {};
        if (includeJson) headers["Content-Type"] = "application/json";
        if (token) headers["Authorization"] = `Bearer ${token}`;
        return headers;
    };

    // Fetch all orders for this customer
    useEffect(() => {
        const fetchOrders = async () => {
            try {
                const res = await fetch("/orders", {
                    headers: getAuthHeaders()
                });
                const data = await res.json();
                const customerOrders = data.filter(o => o.sender_id === customerId || o.receiver_id === customerId);
                setOrders(customerOrders);
                setLoading(false);
            } catch (err) {
                console.error(err);
                setLoading(false);
            }
        };
        if (customerId) {
            fetchOrders();
        }
    }, [customerId]);

    // Initialize map for tracking
    useEffect(() => {
        if (!trackingInfo || !trackingInfo.current_location) return;

        // Small delay to ensure DOM is ready
        const timer = setTimeout(() => {
            if (!mapRef.current) return;

            if (mapInstanceRef.current) {
                mapInstanceRef.current.remove();
                mapInstanceRef.current = null;
            }

            const { lat, lng } = trackingInfo.current_location;

            // Validate coordinates
            if (!lat || !lng) return;

            mapInstanceRef.current = L.map(mapRef.current).setView([lat, lng], 13);
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '© OpenStreetMap contributors',
                maxZoom: 19
            }).addTo(mapInstanceRef.current);

            // Create custom icon for package
            const packageIcon = L.divIcon({
                html: `<div style="background-color: #dc3545; width: 24px; height: 24px; border-radius: 50%; border: 3px solid white; box-shadow: 0 0 4px rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; font-size: 14px;">📦</div>`,
                iconSize: [30, 30],
                className: 'pulse-marker'
            });

            // Add marker for current location
            markerRef.current = L.marker([lat, lng], { icon: packageIcon })
                .bindPopup(`
                <div style="text-align: center;">
                    <strong>📦 Your Package</strong><br/>
                    Status: ${trackingInfo.status}<br/>
                    Last updated: ${new Date(trackingInfo.last_updated).toLocaleString()}
                </div>
            `)
                .addTo(mapInstanceRef.current)
                .openPopup();

            const style = document.createElement('style');
            style.textContent = `
            .pulse-marker {
                animation: pulse 1.5s infinite;
            }
            @keyframes pulse {
                0% { transform: scale(1); opacity: 1; }
                50% { transform: scale(1.2); opacity: 0.8; }
                100% { transform: scale(1); opacity: 1; }
            }
        `;
            document.head.appendChild(style);

            // Force map to refresh
            setTimeout(() => {
                if (mapInstanceRef.current) {
                    mapInstanceRef.current.invalidateSize();
                }
            }, 100);
        }, 100);

        return () => clearTimeout(timer);
    }, [trackingInfo]);

    const handleChange = e => setForm({ ...form, [e.target.name]: e.target.value });

    const handleSelectPayment = (orderId, method) => {
        fetch("/select_payment_method", {
            method: "POST",
            headers: getAuthHeaders(true),
            body: JSON.stringify({ order_id: orderId, method: method })
        })
            .then(res => res.json())
            .then(data => {
                alert(data.message);
                setOrders(prev =>
                    prev.map(o =>
                        o.order_id === Number(orderId)
                            ? { ...o, payment_method: method, status: "In Progress" }
                            : o
                    )
                );
            })
            .catch(err => console.error(err));
    };

    const statusColor = (status) => {
        switch (status) {
            case "Pending": return "#ffc107";
            case "In Progress": return "#17a2b8";
            case "In Transit": return "#007bff";
            case "Delivered": return "#28a745";
            default: return "#6c757d";
        }
    };

    const statusBadgeStyle = (status) => ({
        display: "inline-block",
        padding: "4px 12px",
        borderRadius: "20px",
        fontSize: "12px",
        fontWeight: "600",
        backgroundColor: statusColor(status),
        color: "white"
    });

    const formatDate = (dateString) => {
        if (!dateString) return "—";
        const date = new Date(dateString);
        return date.toLocaleString();
    };

    const getStatusSteps = (currentStatus) => {
        const steps = [
            { name: "Order Placed", key: "Pending", icon: "📝", description: "Your order has been received" },
            { name: "Processing", key: "In Progress", icon: "⚙️", description: "Payment confirmed, preparing your package" },
            { name: "In Transit", key: "In Transit", icon: "🚚", description: "Package is on the way to you" },
            { name: "Delivered", key: "Delivered", icon: "✅", description: "Package has been delivered" }
        ];

        let currentIndex = steps.findIndex(s => s.key === currentStatus);
        if (currentIndex === -1) currentIndex = 0;

        return steps.map((step, idx) => ({
            ...step,
            completed: idx <= currentIndex,
            active: idx === currentIndex
        }));
    };

    const createOrder = () => {
        if (!form.receiver_id || !form.weight || !form.type) {
            alert("Please fill in all required fields (Receiver ID, Weight, Type)");
            return;
        }

        fetch("/create_order", {
            method: "POST",
            headers: getAuthHeaders(true),
            body: JSON.stringify({
                receiver_id: parseInt(form.receiver_id),
                weight: parseFloat(form.weight),
                length: parseFloat(form.length) || 0,
                width: parseFloat(form.width) || 0,
                height: parseFloat(form.height) || 0,
                type: form.type,
            }),
        })
            .then(res => res.json())
            .then(data => {
                alert("✅ " + data.message);
                setForm({});
                fetch("/orders", { headers: getAuthHeaders() })
                    .then(res => res.json())
                    .then(data => {
                        const customerOrders = data.filter(o => o.sender_id === customerId || o.receiver_id === customerId);
                        setOrders(customerOrders);
                    });
            })
            .catch(err => {
                console.error(err);
                alert("❌ Something went wrong");
            });
    };

    const trackOrder = async () => {
        if (!orderId) {
            alert("Please enter an Order ID");
            return;
        }
        setTrackingLoading(true);
        try {
            const res = await fetch(`/track_order/${orderId}`, {
                headers: getAuthHeaders()
            });
            const data = await res.json();
            if (data.order_id) {
                setTrackingOrder(data);
                setTrackingInfo(data);
                // Scroll to tracking section
                document.getElementById('tracking-results')?.scrollIntoView({ behavior: 'smooth' });
            } else {
                alert("Order not found");
                setTrackingOrder(null);
                setTrackingInfo(null);
            }
        } catch (err) {
            console.error(err);
            alert("Error tracking order");
        } finally {
            setTrackingLoading(false);
        }
    };

    const refreshTracking = async () => {
        if (!trackingOrder) return;
        setTrackingLoading(true);
        try {
            const res = await fetch(`/track_order/${trackingOrder.order_id}`, {
                headers: getAuthHeaders()
            });
            const data = await res.json();
            setTrackingOrder(data);
            setTrackingInfo(data);
        } catch (err) {
            console.error(err);
        } finally {
            setTrackingLoading(false);
        }
    };

    const askTrackingAssistant = async () => {
        const tok = localStorage.getItem("token");
        if (!tok) {
            alert("AI assistant needs a logged-in session. Please log out and sign in again.");
            return;
        }
        if (!trackingOrder?.order_id) return;
        setAssistBusy(true);
        setAssistError("");
        try {
            const res = await fetch("/api/ai/tracking-assistant", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${tok}`
                },
                body: JSON.stringify({
                    order_id: trackingOrder.order_id,
                    message: assistQuery.trim() || "Summarize shipment status briefly."
                })
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                setAssistAnswer("");
                setAssistError(data.error || `Error ${res.status}`);
                return;
            }
            setAssistAnswer(data.answer || "");
        } catch (e) {
            setAssistAnswer("");
            setAssistError(String(e.message || e));
        } finally {
            setAssistBusy(false);
        }
    };

    const generateNotificationDraft = async () => {
        const tok = localStorage.getItem("token");
        if (!tok) {
            alert("Sign in required to draft notifications.");
            return;
        }
        if (!trackingOrder?.order_id) return;
        setNotifBusy(true);
        setDraftSubject("");
        setDraftBody("");
        try {
            const res = await fetch("/api/ai/notification-draft", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${tok}`
                },
                body: JSON.stringify({
                    order_id: trackingOrder.order_id,
                    channel: notifChannel,
                    tone: "professional concise",
                    template: "status_update_general"
                })
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                alert(data.error || `Draft failed (${res.status})`);
                return;
            }
            setDraftSubject(data.subject || "");
            setDraftBody(data.body || "");
        } catch (e) {
            alert(String(e.message || e));
        } finally {
            setNotifBusy(false);
        }
    };

    const logout = () => {
        localStorage.removeItem("token");
        navigate("/login");
    };

    const OrderTable = ({ orders, isOutbound = false }) => (
        <div style={{ overflowX: "auto" }}>
            <table style={{
                width: "100%",
                borderCollapse: "collapse",
                backgroundColor: "white",
                borderRadius: "8px",
                overflow: "hidden",
                boxShadow: "0 1px 3px rgba(0,0,0,0.1)"
            }}>
                <thead style={{ backgroundColor: "#f8f9fa" }}>
                    <tr>
                        <th style={thStyle}>Order ID</th>
                        <th style={thStyle}>{isOutbound ? "Receiver ID" : "Sender ID"}</th>
                        <th style={thStyle}>Weight</th>
                        <th style={thStyle}>Type</th>
                        <th style={thStyle}>Status</th>
                        <th style={thStyle}>Completed At</th>
                        {isOutbound && <th style={thStyle}>Price</th>}
                        {isOutbound && <th style={thStyle}>Payment</th>}
                        <th style={thStyle}>Action</th>
                    </tr>
                </thead>
                <tbody>
                    {orders.map((o, idx) => (
                        <tr key={o.order_id} style={{
                            borderBottom: "1px solid #eee",
                            backgroundColor: idx % 2 === 0 ? "white" : "#f9f9f9"
                        }}>
                            <td style={tdStyle}>#{o.order_id}</td>
                            <td style={tdStyle}>{isOutbound ? o.receiver_id : o.sender_id}</td>
                            <td style={tdStyle}>{o.weight} kg</td>
                            <td style={tdStyle}>
                                <span style={{
                                    padding: "2px 8px",
                                    borderRadius: "12px",
                                    fontSize: "11px",
                                    fontWeight: "600",
                                    backgroundColor: o.type === "Express" ? "#ffeaa7" : o.type === "Priority" ? "#ff7675" : "#dfe6e9",
                                    color: o.type === "Express" ? "#d63031" : o.type === "Priority" ? "#fff" : "#2d3436"
                                }}>
                                    {o.type}
                                </span>
                            </td>
                            <td style={tdStyle}>
                                <span style={statusBadgeStyle(o.status)}>{o.status}</span>
                            </td>
                            <td style={tdStyle}>
                                {o.status === "Delivered" ? (
                                    <span style={{ fontSize: "12px", color: "#28a745" }}>
                                        📅 {formatDate(o.completed_at)}
                                    </span>
                                ) : (
                                    <span style={{ fontSize: "12px", color: "#999" }}>—</span>
                                )}
                            </td>
                            {isOutbound && (
                                <>
                                    <td style={tdStyle}>${o.price?.toFixed(2)}</td>
                                    <td style={tdStyle}>
                                        {o.status === "Pending" ? (
                                            <select
                                                onChange={(e) => handleSelectPayment(o.order_id, e.target.value)}
                                                style={{
                                                    padding: "6px 10px",
                                                    borderRadius: "6px",
                                                    border: "1px solid #ddd",
                                                    backgroundColor: "white",
                                                    cursor: "pointer"
                                                }}
                                                defaultValue=""
                                            >
                                                <option value="" disabled>Select Payment</option>
                                                <option value="Card">💳 Card</option>
                                                <option value="Cash">💵 Cash</option>
                                                <option value="Online">🌐 Online</option>
                                            </select>
                                        ) : (
                                            <span style={{ color: "#28a745", fontWeight: "500" }}>
                                                ✅ {o.payment_method}
                                            </span>
                                        )}
                                    </td>
                                </>
                            )}
                            <td style={tdStyle}>
                                <button
                                    onClick={() => {
                                        setOrderId(o.order_id.toString());
                                        trackOrder();
                                    }}
                                    style={{
                                        padding: "4px 10px",
                                        backgroundColor: "#007bff",
                                        color: "white",
                                        border: "none",
                                        borderRadius: "4px",
                                        cursor: "pointer",
                                        fontSize: "11px"
                                    }}
                                >
                                    🔍 Track
                                </button>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );

    const thStyle = {
        padding: "12px 15px",
        textAlign: "left",
        fontWeight: "600",
        color: "#2c3e50",
        borderBottom: "2px solid #e0e4e8"
    };

    const tdStyle = {
        padding: "12px 15px",
        color: "#555"
    };

    if (!customerId) {
        return (
            <div style={styles.container}>
                <div style={styles.card}>
                    <h2>🔒 Session Expired</h2>
                    <p>Please log in again to continue.</p>
                    <button onClick={() => navigate("/login")} style={styles.button}>Go to Login</button>
                </div>
            </div>
        );
    }

    return (
        <div style={styles.container}>
            <div style={styles.card}>
                {/* Header */}
                <div style={styles.header}>
                    <div>
                        <h1 style={styles.title}>📦 Welcome, {customerName}!</h1>
                        <p style={styles.subtitle}>Customer ID: {customerId}</p>
                    </div>
                    <button onClick={logout} style={styles.logoutBtn}>🚪 Logout</button>
                </div>

                {/* Action Buttons */}
                <div style={styles.buttonGroup}>
                    <button
                        onClick={() => setActiveSection("create")}
                        style={activeSection === "create" ? styles.activeButton : styles.secondaryButton}
                    >
                        ✨ Create Order
                    </button>
                    <button
                        onClick={() => setActiveSection("track")}
                        style={activeSection === "track" ? styles.activeButton : styles.secondaryButton}
                    >
                        🔍 Track Order
                    </button>
                    <button
                        onClick={() => setActiveSection("history")}
                        style={activeSection === "history" ? styles.activeButton : styles.secondaryButton}
                    >
                        📋 Order History
                    </button>
                </div>

                {/* Create Order Section */}
                {activeSection === "create" && (
                    <div style={styles.formContainer}>
                        <h3 style={styles.sectionTitle}>Create New Order</h3>
                        <div style={styles.formGrid}>
                            <input
                                name="receiver_id"
                                placeholder="Receiver ID *"
                                value={form.receiver_id || ""}
                                onChange={handleChange}
                                style={styles.input}
                            />
                            <input
                                name="weight"
                                placeholder="Weight (kg) *"
                                type="number"
                                value={form.weight || ""}
                                onChange={handleChange}
                                style={styles.input}
                            />
                            <input
                                name="length"
                                placeholder="Length (cm)"
                                type="number"
                                value={form.length || ""}
                                onChange={handleChange}
                                style={styles.input}
                            />
                            <input
                                name="width"
                                placeholder="Width (cm)"
                                type="number"
                                value={form.width || ""}
                                onChange={handleChange}
                                style={styles.input}
                            />
                            <input
                                name="height"
                                placeholder="Height (cm)"
                                type="number"
                                value={form.height || ""}
                                onChange={handleChange}
                                style={styles.input}
                            />
                            <select
                                name="type"
                                value={form.type || ""}
                                onChange={handleChange}
                                style={styles.input}
                            >
                                <option value="">Select Type *</option>
                                <option value="Regular">📦 Regular</option>
                                <option value="Express">⚡ Express</option>
                                <option value="Priority">⭐ Priority</option>
                            </select>
                        </div>
                        <button onClick={createOrder} style={styles.primaryButton}>
                            📮 Submit Order
                        </button>
                    </div>
                )}

                {/* Track Order Section */}
                {activeSection === "track" && (
                    <div style={styles.formContainer}>
                        <h3 style={styles.sectionTitle}>Track Your Order</h3>
                        <div style={styles.trackingInput}>
                            <input
                                placeholder="Enter Order ID"
                                value={orderId}
                                onChange={(e) => setOrderId(e.target.value)}
                                style={styles.trackingInputField}
                                onKeyPress={(e) => e.key === 'Enter' && trackOrder()}
                            />
                            <button onClick={trackOrder} disabled={trackingLoading} style={styles.trackBtn}>
                                {trackingLoading ? "⏳ Tracking..." : "🔍 Track Order"}
                            </button>
                        </div>

                        {/* Tracking Results */}
                        {trackingOrder && trackingInfo && (
                            <div id="tracking-results" style={styles.trackingResult}>
                                {/* Order Info Card */}
                                <div style={styles.orderInfoCard}>
                                    <div style={styles.orderInfoHeader}>
                                        <h3>Order #{trackingOrder.order_id}</h3>
                                        <span style={statusBadgeStyle(trackingOrder.status)}>
                                            {trackingOrder.status}
                                        </span>
                                    </div>
                                    <div style={styles.orderDetails}>
                                        <div><strong>From:</strong> Customer #{trackingOrder.sender_id}</div>
                                        <div><strong>To:</strong> Customer #{trackingOrder.receiver_id}</div>
                                        <div><strong>Weight:</strong> {trackingOrder.weight} kg</div>
                                        <div><strong>Type:</strong> {trackingOrder.type}</div>
                                        {trackingOrder.completed_at && (
                                            <div><strong>Delivered:</strong> {formatDate(trackingOrder.completed_at)}</div>
                                        )}
                                    </div>
                                </div>

                                {/* Status Timeline */}
                                <div style={styles.timelineSection}>
                                    <h4>📊 Delivery Progress</h4>
                                    <div style={styles.timeline}>
                                        {getStatusSteps(trackingOrder.status).map((step, idx) => (
                                            <div key={idx} style={styles.timelineStep}>
                                                <div style={{
                                                    ...styles.timelineIcon,
                                                    backgroundColor: step.completed ? statusColor(step.key) : "#e0e4e8",
                                                    border: step.active ? "3px solid #007bff" : "none"
                                                }}>
                                                    {step.icon}
                                                </div>
                                                <div style={styles.timelineContent}>
                                                    <div style={{
                                                        ...styles.timelineTitle,
                                                        color: step.completed ? "#28a745" : step.active ? "#007bff" : "#999"
                                                    }}>
                                                        {step.name}
                                                    </div>
                                                    <div style={styles.timelineDesc}>{step.description}</div>
                                                    {step.active && (
                                                        <div style={styles.timelineStatus}>Current Status</div>
                                                    )}
                                                </div>
                                                {idx < getStatusSteps(trackingOrder.status).length - 1 && (
                                                    <div style={{
                                                        ...styles.timelineLine,
                                                        backgroundColor: step.completed ? "#28a745" : "#e0e4e8"
                                                    }} />
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {/* Map Section */}
                                {trackingInfo.current_location && (
                                    <div style={styles.mapSection}>
                                        <div style={styles.mapHeader}>
                                            <h4>📍 Current Package Location</h4>
                                            <button onClick={refreshTracking} disabled={trackingLoading} style={styles.refreshBtn}>
                                                {trackingLoading ? "⏳" : "🔄 Refresh"}
                                            </button>
                                        </div>
                                        <div ref={mapRef} style={styles.map} />
                                        <div style={styles.locationInfo}>
                                            <div>📍 <strong>Location:</strong> {trackingInfo.current_location.address || `${trackingInfo.current_location.lat}, ${trackingInfo.current_location.lng}`}</div>
                                            <div>🕐 <strong>Last Updated:</strong> {new Date(trackingInfo.last_updated).toLocaleString()}</div>
                                        </div>
                                    </div>
                                )}

                                {/* Update History */}
                                {trackingInfo.updates && trackingInfo.updates.length > 0 && (
                                    <div style={styles.updateHistory}>
                                        <h4>📋 Update History</h4>
                                        {trackingInfo.updates.map((update, idx) => (
                                            <div key={idx} style={styles.updateItem}>
                                                <div style={styles.updateIcon}>
                                                    {update.update_type === "ARRIVED" ? "📍" :
                                                        update.update_type === "STOP_COMPLETED" ? "✅" : "📝"}
                                                </div>
                                                <div style={styles.updateContent}>
                                                    <div style={styles.updateMessage}>{update.notes || `Status updated to ${update.new_status}`}</div>
                                                    <div style={styles.updateTime}>{formatDate(update.updated_at)}</div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                <div style={styles.aiAssistantBox}>
                                    <h4 style={{ marginTop: 0 }}>🤖 Tracking assistant</h4>
                                    <p style={styles.aiHint}>
                                        Ask plain-language questions. Answers use only shipment data stored in our system.
                                    </p>
                                    <textarea
                                        placeholder="Example: What's the payment status and last scan?"
                                        value={assistQuery}
                                        onChange={(e) => setAssistQuery(e.target.value)}
                                        style={styles.aiTextarea}
                                        rows={4}
                                        disabled={assistBusy}
                                    />
                                    <div style={styles.aiRow}>
                                        <button type="button" onClick={askTrackingAssistant} disabled={assistBusy} style={styles.aiPrimary}>
                                            {assistBusy ? "⏳ Asking..." : "Ask assistant"}
                                        </button>
                                        {assistError && (
                                            <span style={styles.aiError}>{assistError}</span>
                                        )}
                                    </div>
                                    {assistAnswer && (
                                        <div style={styles.aiAnswer}>
                                            {assistAnswer}
                                        </div>
                                    )}
                                </div>

                                <div style={styles.notifDraftBox}>
                                    <h4 style={{ marginTop: 0 }}>✉️ Message draft ({notifChannel === "sms" ? "SMS-style" : "Email"})</h4>
                                    <p style={styles.aiHint}>
                                        Generates a reusable customer message from this order (copy only—nothing is sent automatically).
                                    </p>
                                    <div style={styles.aiRow}>
                                        <select
                                            value={notifChannel}
                                            onChange={(e) => setNotifChannel(e.target.value)}
                                            style={styles.filterSelectCompact}
                                            disabled={notifBusy}
                                        >
                                            <option value="sms">SMS-length draft</option>
                                            <option value="email">Email draft</option>
                                        </select>
                                        <button type="button" onClick={generateNotificationDraft} disabled={notifBusy} style={styles.aiSecondary}>
                                            {notifBusy ? "⏳ Generating..." : "Generate draft"}
                                        </button>
                                    </div>
                                    {(draftSubject || draftBody) && (
                                        <div style={styles.draftOut}>
                                            {draftSubject ? (
                                                <div><strong>Subject:</strong> {draftSubject}</div>
                                            ) : null}
                                            <pre style={styles.draftBody}>{draftBody}</pre>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* Order History Section */}
                {activeSection === "history" && (
                    <div style={styles.historySection}>
                        <h3 style={styles.sectionTitle}>📋 Your Order History</h3>
                        {loading ? (
                            <p>Loading orders...</p>
                        ) : orders.length === 0 ? (
                            <p style={styles.emptyState}>No orders found. Create your first order!</p>
                        ) : (
                            <>
                                <h4 style={{ marginTop: 20 }}>📥 Incoming Packages</h4>
                                {orders.filter(o => o.receiver_id === customerId).length > 0 ? (
                                    <OrderTable orders={orders.filter(o => o.receiver_id === customerId)} isOutbound={false} />
                                ) : (
                                    <p style={styles.emptyState}>No incoming packages</p>
                                )}

                                <h4 style={{ marginTop: 30 }}>📤 Outbound Packages</h4>
                                {orders.filter(o => o.sender_id === customerId).length > 0 ? (
                                    <OrderTable orders={orders.filter(o => o.sender_id === customerId)} isOutbound={true} />
                                ) : (
                                    <p style={styles.emptyState}>No outbound packages</p>
                                )}
                            </>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}

const styles = {
    container: {
        minHeight: "100vh",
        backgroundColor: "#f5f7fa",
        padding: "40px 20px",
        fontFamily: "system-ui, -apple-system, sans-serif"
    },
    card: {
        maxWidth: "1400px",
        margin: "0 auto",
        backgroundColor: "white",
        borderRadius: "16px",
        boxShadow: "0 4px 20px rgba(0,0,0,0.1)",
        padding: "30px"
    },
    header: {
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: "30px",
        paddingBottom: "20px",
        borderBottom: "2px solid #e0e4e8"
    },
    title: {
        margin: 0,
        fontSize: "28px",
        color: "#2c3e50"
    },
    subtitle: {
        margin: "5px 0 0",
        color: "#7f8c8d"
    },
    logoutBtn: {
        padding: "8px 16px",
        backgroundColor: "#dc3545",
        color: "white",
        border: "none",
        borderRadius: "8px",
        cursor: "pointer",
        fontSize: "14px"
    },
    buttonGroup: {
        display: "flex",
        gap: "15px",
        marginBottom: "25px",
        justifyContent: "center"
    },
    primaryButton: {
        padding: "10px 24px",
        backgroundColor: "#007bff",
        color: "white",
        border: "none",
        borderRadius: "8px",
        fontSize: "14px",
        fontWeight: "600",
        cursor: "pointer",
        width: "100%"
    },
    secondaryButton: {
        padding: "10px 24px",
        backgroundColor: "#f8f9fa",
        color: "#2c3e50",
        border: "1px solid #ddd",
        borderRadius: "8px",
        fontSize: "14px",
        fontWeight: "600",
        cursor: "pointer"
    },
    activeButton: {
        padding: "10px 24px",
        backgroundColor: "#007bff",
        color: "white",
        border: "none",
        borderRadius: "8px",
        fontSize: "14px",
        fontWeight: "600",
        cursor: "pointer",
        boxShadow: "0 2px 8px rgba(0,123,255,0.3)"
    },
    formContainer: {
        backgroundColor: "#f8f9fa",
        padding: "25px",
        borderRadius: "12px",
        marginTop: "20px"
    },
    sectionTitle: {
        fontSize: "20px",
        color: "#2c3e50",
        marginBottom: "20px",
        paddingBottom: "10px",
        borderBottom: "2px solid #e0e4e8"
    },
    formGrid: {
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
        gap: "15px",
        marginBottom: "20px"
    },
    input: {
        padding: "12px 15px",
        border: "1px solid #ddd",
        borderRadius: "8px",
        fontSize: "14px",
        outline: "none"
    },
    trackingInput: {
        display: "flex",
        gap: "10px",
        marginBottom: "20px"
    },
    trackingInputField: {
        flex: 1,
        padding: "12px 15px",
        border: "1px solid #ddd",
        borderRadius: "8px",
        fontSize: "14px",
        outline: "none"
    },
    trackBtn: {
        padding: "12px 24px",
        backgroundColor: "#007bff",
        color: "white",
        border: "none",
        borderRadius: "8px",
        cursor: "pointer",
        fontSize: "14px",
        fontWeight: "600"
    },
    trackingResult: {
        marginTop: "20px"
    },
    orderInfoCard: {
        backgroundColor: "#f8f9fa",
        borderRadius: "12px",
        padding: "20px",
        marginBottom: "20px",
        border: "1px solid #e0e4e8"
    },
    orderInfoHeader: {
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: "15px",
        flexWrap: "wrap",
        gap: "10px"
    },
    orderDetails: {
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
        gap: "10px",
        fontSize: "14px"
    },
    timelineSection: {
        marginBottom: "20px"
    },
    timeline: {
        display: "flex",
        justifyContent: "space-between",
        position: "relative",
        marginTop: "20px",
        flexWrap: "wrap"
    },
    timelineStep: {
        flex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        position: "relative",
        minWidth: "100px",
        textAlign: "center"
    },
    timelineIcon: {
        width: "50px",
        height: "50px",
        borderRadius: "50%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: "24px",
        marginBottom: "10px"
    },
    timelineContent: {
        textAlign: "center"
    },
    timelineTitle: {
        fontSize: "13px",
        fontWeight: "600",
        marginBottom: "4px"
    },
    timelineDesc: {
        fontSize: "10px",
        color: "#666",
        maxWidth: "120px"
    },
    timelineStatus: {
        fontSize: "10px",
        color: "#007bff",
        marginTop: "4px",
        fontWeight: "bold"
    },
    timelineLine: {
        position: "absolute",
        top: "25px",
        left: "50%",
        width: "100%",
        height: "2px",
        zIndex: -1
    },
    mapSection: {
        marginBottom: "20px"
    },
    mapHeader: {
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: "10px"
    },
    map: {
        width: "100%",
        height: "350px",
        borderRadius: "8px",
        border: "1px solid #ddd"
    },
    refreshBtn: {
        padding: "6px 12px",
        backgroundColor: "#28a745",
        color: "white",
        border: "none",
        borderRadius: "6px",
        cursor: "pointer",
        fontSize: "12px"
    },
    locationInfo: {
        marginTop: "10px",
        padding: "10px",
        backgroundColor: "#f8f9fa",
        borderRadius: "8px",
        fontSize: "13px"
    },
    updateHistory: {
        marginTop: "20px"
    },
    updateItem: {
        display: "flex",
        gap: "12px",
        padding: "10px",
        borderBottom: "1px solid #eee",
        alignItems: "flex-start"
    },
    updateIcon: {
        fontSize: "18px"
    },
    updateContent: {
        flex: 1
    },
    updateMessage: {
        fontSize: "13px",
        color: "#333"
    },
    updateTime: {
        fontSize: "11px",
        color: "#999",
        marginTop: "4px"
    },
    historySection: {
        marginTop: "20px"
    },
    emptyState: {
        textAlign: "center",
        padding: "40px",
        color: "#7f8c8d"
    },
    aiAssistantBox: {
        marginTop: "24px",
        padding: "20px",
        backgroundColor: "#f0f7ff",
        borderRadius: "12px",
        border: "1px solid #cce5ff"
    },
    notifDraftBox: {
        marginTop: "18px",
        padding: "20px",
        backgroundColor: "#f8fdf8",
        borderRadius: "12px",
        border: "1px solid #cce8cc"
    },
    aiHint: {
        margin: "4px 0 12px",
        fontSize: "13px",
        color: "#555"
    },
    aiTextarea: {
        width: "100%",
        boxSizing: "border-box",
        padding: "12px",
        borderRadius: "8px",
        border: "1px solid #b8daff",
        fontSize: "14px",
        fontFamily: "inherit",
        resize: "vertical",
        marginBottom: "10px",
        outline: "none"
    },
    aiRow: {
        display: "flex",
        flexWrap: "wrap",
        gap: "10px",
        alignItems: "center",
        marginBottom: "10px"
    },
    aiPrimary: {
        padding: "10px 18px",
        backgroundColor: "#0056b3",
        color: "white",
        border: "none",
        borderRadius: "8px",
        cursor: "pointer",
        fontWeight: "600",
        fontSize: "14px"
    },
    aiSecondary: {
        padding: "10px 18px",
        backgroundColor: "#28a745",
        color: "white",
        border: "none",
        borderRadius: "8px",
        cursor: "pointer",
        fontWeight: "600",
        fontSize: "14px"
    },
    filterSelectCompact: {
        padding: "8px 12px",
        borderRadius: "8px",
        border: "1px solid #ccc",
        fontSize: "14px"
    },
    aiError: {
        color: "#c82333",
        fontSize: "13px"
    },
    aiAnswer: {
        marginTop: "8px",
        padding: "14px",
        backgroundColor: "white",
        borderRadius: "8px",
        border: "1px solid #b8daff",
        fontSize: "14px",
        lineHeight: "1.5",
        whiteSpace: "pre-wrap"
    },
    draftOut: {
        marginTop: "12px",
        padding: "12px",
        backgroundColor: "white",
        borderRadius: "8px",
        border: "1px dashed #bbb",
        fontSize: "14px"
    },
    draftBody: {
        marginTop: "8px",
        fontFamily: "system-ui, sans-serif",
        whiteSpace: "pre-wrap",
        margin: "8px 0 0",
        padding: "0",
        overflow: "auto"
    },
    button: {
        padding: "10px 20px",
        backgroundColor: "#007bff",
        color: "white",
        border: "none",
        borderRadius: "8px",
        cursor: "pointer"
    }
};

export default CustomerPage;

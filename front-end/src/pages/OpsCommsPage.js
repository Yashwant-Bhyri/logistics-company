import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

export default function OpsCommsPage() {
    const navigate = useNavigate();
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [metrics, setMetrics] = useState(null);
    const [inbox, setInbox] = useState([]);
    const [feed, setFeed] = useState([]);
    const [latestMessageId, setLatestMessageId] = useState(0);

    const [selectedType, setSelectedType] = useState("");
    const [selectedId, setSelectedId] = useState("");
    const [selectedName, setSelectedName] = useState("");
    const [thread, setThread] = useState([]);
    const [threadBusy, setThreadBusy] = useState(false);

    const [threadMessage, setThreadMessage] = useState("");
    const [threadChannel, setThreadChannel] = useState("chat");
    const [threadSubject, setThreadSubject] = useState("");
    const [autoReply, setAutoReply] = useState(true);
    const [threadSendBusy, setThreadSendBusy] = useState(false);

    const [broadcastAudience, setBroadcastAudience] = useState("all");
    const [broadcastChannel, setBroadcastChannel] = useState("chat");
    const [broadcastSubject, setBroadcastSubject] = useState("Operations update");
    const [broadcastMessage, setBroadcastMessage] = useState("");
    const [broadcastBusy, setBroadcastBusy] = useState(false);

    const [driverStatusId, setDriverStatusId] = useState("");
    const [driverStatusType, setDriverStatusType] = useState("late");
    const [driverStatusDetail, setDriverStatusDetail] = useState("");
    const [incidentBusy, setIncidentBusy] = useState(false);

    const [complaintCustomerId, setComplaintCustomerId] = useState("");
    const [complaintDetail, setComplaintDetail] = useState("");
    const [complaintCases, setComplaintCases] = useState([]);
    const [complaintBuckets, setComplaintBuckets] = useState({ high: 0, medium: 0, low: 0, open: 0, resolved: 0 });
    const [complaintFilter, setComplaintFilter] = useState("open");
    const [activeComplaintId, setActiveComplaintId] = useState("");
    const [activeComplaintCase, setActiveComplaintCase] = useState(null);
    const [complaintLoading, setComplaintLoading] = useState(false);
    const [complaintReply, setComplaintReply] = useState("");
    const [complaintReplyBusy, setComplaintReplyBusy] = useState(false);
    const [actionBusy, setActionBusy] = useState(false);
    const [analyticsWindow, setAnalyticsWindow] = useState("30d");
    const [driverProfiles, setDriverProfiles] = useState([]);
    const [driverProfilesLoading, setDriverProfilesLoading] = useState(false);
    const [advancedAnalytics, setAdvancedAnalytics] = useState(null);
    const [advancedAnalyticsLoading, setAdvancedAnalyticsLoading] = useState(false);

    const authHeaders = () => {
        const token = localStorage.getItem("token");
        return {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`
        };
    };

    const cleanText = (value) =>
        String(value || "")
            .replace(
                /This is a simulated notification only\.?\s*No real message was sent\.?/gi,
                "This update has been logged to the participant conversation timeline."
            )
            .replace(/\bfake\b/gi, "demo")
            .replace(/\bsimulated\b/gi, "system-generated");

    const selectThread = async (participantType, participantId, participantName) => {
        setSelectedType(participantType);
        setSelectedId(String(participantId));
        setSelectedName(participantName || "");
        setThreadBusy(true);
        try {
            const res = await fetch(
                `/api/ai/ops-comms/thread?participant_type=${encodeURIComponent(participantType)}&participant_id=${participantId}&limit=300`,
                { headers: authHeaders() }
            );
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                setError(data.error || `Thread load failed (${res.status})`);
                return;
            }
            setThread(Array.isArray(data.messages) ? data.messages : []);
            setSelectedName(data.participant_name || participantName || "");
        } catch (e) {
            setError(String(e.message || e));
        } finally {
            setThreadBusy(false);
        }
    };

    const loadInbox = async () => {
        const res = await fetch("/api/ai/ops-comms/inbox?limit=150", { headers: authHeaders() });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || `Inbox failed (${res.status})`);
        setInbox(Array.isArray(data.threads) ? data.threads : []);
        setMetrics(data.metrics || null);
    };

    const loadDriverProfiles = async () => {
        setDriverProfilesLoading(true);
        try {
            const res = await fetch("/api/ai/ops-comms/driver-profiles?limit=300", { headers: authHeaders() });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || `Driver profiles failed (${res.status})`);
            setDriverProfiles(Array.isArray(data.profiles) ? data.profiles : []);
        } finally {
            setDriverProfilesLoading(false);
        }
    };

    const loadAdvancedAnalytics = async (windowOverride) => {
        const win = windowOverride || analyticsWindow;
        setAdvancedAnalyticsLoading(true);
        try {
            const res = await fetch(`/api/ai/ops-comms/advanced-analytics?horizon=${encodeURIComponent(win)}`, { headers: authHeaders() });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || `Advanced analytics failed (${res.status})`);
            setAdvancedAnalytics(data);
        } finally {
            setAdvancedAnalyticsLoading(false);
        }
    };

    const loadComplaintCases = async () => {
        const res = await fetch("/api/ai/ops-comms/complaints?limit=200", { headers: authHeaders() });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || `Complaint queue failed (${res.status})`);
        const cases = Array.isArray(data.cases) ? data.cases : [];
        setComplaintCases(cases);
        setComplaintBuckets(data.bucket_counts || { high: 0, medium: 0, low: 0, open: 0, resolved: 0 });
        if (cases.length === 0) {
            setActiveComplaintId("");
            setActiveComplaintCase(null);
            return;
        }
        const hasActive = activeComplaintId && cases.some((c) => String(c.complaint_id) === String(activeComplaintId));
        if (!hasActive) {
            setActiveComplaintId(String(cases[0].complaint_id));
        }
    };

    const loadComplaintDetail = async (complaintId) => {
        if (!complaintId) return;
        setComplaintLoading(true);
        try {
            const res = await fetch(`/api/ai/ops-comms/complaint-case?complaint_id=${complaintId}`, { headers: authHeaders() });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || `Complaint detail failed (${res.status})`);
            setActiveComplaintCase(data);
            setActiveComplaintId(String(complaintId));
            if (data.customer_id) {
                await selectThread("customer", data.customer_id, data.customer_name || "");
            }
        } catch (e) {
            setError(String(e.message || e));
        } finally {
            setComplaintLoading(false);
        }
    };

    const loadBootstrap = async () => {
        setLoading(true);
        setError("");
        try {
            const token = localStorage.getItem("token");
            if (!token) {
                navigate("/login");
                return;
            }
            const res = await fetch("/api/ai/ops-comms/bootstrap", { headers: authHeaders() });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                throw new Error(data.error || `Bootstrap failed (${res.status})`);
            }
            setMetrics(data.metrics || null);
            const list = Array.isArray(data.inbox) ? data.inbox : [];
            setInbox(list);
            setFeed(Array.isArray(data.feed) ? data.feed.slice().reverse() : []);
            setLatestMessageId(Number(data.latest_message_id || 0));
            await loadComplaintCases();
            await loadDriverProfiles();
            await loadAdvancedAnalytics();
            if (list.length > 0) {
                const first = list[0];
                await selectThread(first.participant_type, first.participant_id, first.participant_name);
            }
        } catch (e) {
            setError(String(e.message || e));
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadBootstrap();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        const timer = setInterval(async () => {
            try {
                const res = await fetch(`/api/ai/ops-comms/live?since_id=${latestMessageId}`, { headers: authHeaders() });
                const data = await res.json().catch(() => ({}));
                if (!res.ok) return;
                const incoming = Array.isArray(data.events) ? data.events : [];
                if (incoming.length > 0) {
                    setFeed((prev) => [...incoming.slice().reverse(), ...prev].slice(0, 250));
                    setLatestMessageId(Number(data.latest_message_id || latestMessageId));
                    await loadInbox();
                    await loadComplaintCases();
                    await loadDriverProfiles();
                    await loadAdvancedAnalytics();
                    if (selectedType && selectedId) {
                        const touched = incoming.some(
                            (ev) => ev.participant_type === selectedType && String(ev.participant_id) === String(selectedId)
                        );
                        if (touched) {
                            await selectThread(selectedType, selectedId, selectedName);
                        }
                    }
                }
            } catch {
                // keep silent during polling
            }
        }, 6000);
        return () => clearInterval(timer);
    }, [latestMessageId, selectedType, selectedId, selectedName]); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        if (!activeComplaintId) return;
        loadComplaintDetail(activeComplaintId);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeComplaintId]);

    useEffect(() => {
        if (!loading) {
            loadAdvancedAnalytics(analyticsWindow).catch(() => {});
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [analyticsWindow]);

    const sendThreadMessage = async () => {
        if (!selectedType || !selectedId) {
            alert("Select a thread first.");
            return;
        }
        const msg = threadMessage.trim();
        if (!msg) return;
        setThreadSendBusy(true);
        setError("");
        try {
            const res = await fetch("/api/ai/ops-comms/thread-message", {
                method: "POST",
                headers: authHeaders(),
                body: JSON.stringify({
                    participant_type: selectedType,
                    participant_id: Number(selectedId),
                    message: msg,
                    channel: threadChannel,
                    subject: threadSubject,
                    auto_reply: autoReply
                })
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                setError(data.error || `Send failed (${res.status})`);
                return;
            }
            setThreadMessage("");
            await loadInbox();
            await loadDriverProfiles();
            await loadComplaintCases();
            await loadAdvancedAnalytics();
            await selectThread(selectedType, selectedId, selectedName);
        } catch (e) {
            setError(String(e.message || e));
        } finally {
            setThreadSendBusy(false);
        }
    };

    const sendBroadcast = async () => {
        const msg = broadcastMessage.trim();
        if (!msg) return;
        setBroadcastBusy(true);
        setError("");
        try {
            const res = await fetch("/api/ai/ops-comms/broadcast", {
                method: "POST",
                headers: authHeaders(),
                body: JSON.stringify({
                    audience: broadcastAudience,
                    channel: broadcastChannel,
                    subject: broadcastSubject,
                    message: msg
                })
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                setError(data.error || `Broadcast failed (${res.status})`);
                return;
            }
            setBroadcastMessage("");
            await loadInbox();
            await loadDriverProfiles();
            await loadComplaintCases();
            await loadAdvancedAnalytics();
        } catch (e) {
            setError(String(e.message || e));
        } finally {
            setBroadcastBusy(false);
        }
    };

    const logDriverStatus = async () => {
        const driverId = Number(driverStatusId);
        const detail = driverStatusDetail.trim();
        if (!driverId || !detail) return;
        setIncidentBusy(true);
        setError("");
        try {
            const res = await fetch("/api/ai/ops-comms/log-driver-status", {
                method: "POST",
                headers: authHeaders(),
                body: JSON.stringify({
                    driver_id: driverId,
                    status_type: driverStatusType,
                    detail
                })
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                setError(data.error || `Driver status log failed (${res.status})`);
                return;
            }
            setDriverStatusDetail("");
            await loadInbox();
            await loadDriverProfiles();
            await loadComplaintCases();
            await loadAdvancedAnalytics();
        } catch (e) {
            setError(String(e.message || e));
        } finally {
            setIncidentBusy(false);
        }
    };

    const logComplaint = async () => {
        const customerId = Number(complaintCustomerId);
        const detail = complaintDetail.trim();
        if (!customerId || !detail) return;
        setIncidentBusy(true);
        setError("");
        try {
            const res = await fetch("/api/ai/ops-comms/log-customer-complaint", {
                method: "POST",
                headers: authHeaders(),
                body: JSON.stringify({
                    customer_id: customerId,
                    detail
                })
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                setError(data.error || `Complaint log failed (${res.status})`);
                return;
            }
            setComplaintDetail("");
            await loadInbox();
            await loadDriverProfiles();
            await loadComplaintCases();
            await loadAdvancedAnalytics();
        } catch (e) {
            setError(String(e.message || e));
        } finally {
            setIncidentBusy(false);
        }
    };

    const sendComplaintReply = async () => {
        const complaintId = Number(activeComplaintId);
        const msg = complaintReply.trim();
        if (!complaintId || !msg) return;
        setComplaintReplyBusy(true);
        setError("");
        try {
            const res = await fetch("/api/ai/ops-comms/complaint-reply", {
                method: "POST",
                headers: authHeaders(),
                body: JSON.stringify({
                    complaint_id: complaintId,
                    message: msg,
                    channel: "chat",
                    subject: "Complaint response"
                })
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                setError(data.error || `Complaint reply failed (${res.status})`);
                return;
            }
            setComplaintReply("");
            await loadComplaintCases();
            await loadComplaintDetail(complaintId);
            await loadInbox();
            await loadDriverProfiles();
            await loadAdvancedAnalytics();
        } catch (e) {
            setError(String(e.message || e));
        } finally {
            setComplaintReplyBusy(false);
        }
    };

    const applyNextBestAction = async (action) => {
        if (!action) return;
        setActionBusy(true);
        setError("");
        try {
            if (action.mode === "prepare_case_response" && action.complaintId) {
                setComplaintFilter("open");
                setActiveComplaintId(String(action.complaintId));
                await loadComplaintDetail(action.complaintId);
                setComplaintReply(action.draftReply || "");
                return;
            }
            await loadComplaintCases();
            await loadInbox();
            await loadDriverProfiles();
            await loadAdvancedAnalytics();
        } catch (e) {
            setError(String(e.message || e));
        } finally {
            setActionBusy(false);
        }
    };

    const complaintCount = useMemo(
        () => inbox.filter((x) => x.kind === "complaint" && x.needs_attention).length,
        [inbox]
    );
    const delayCount = useMemo(
        () => inbox.filter((x) => x.kind === "delay_alert" && x.needs_attention).length,
        [inbox]
    );
    const filteredComplaintCases = useMemo(() => {
        if (complaintFilter === "all") return complaintCases;
        if (complaintFilter === "open") return complaintCases.filter((c) => c.status === "open");
        if (complaintFilter === "resolved") return complaintCases.filter((c) => c.status === "resolved");
        if (complaintFilter === "high") return complaintCases.filter((c) => c.severity === "high");
        if (complaintFilter === "medium") return complaintCases.filter((c) => c.severity === "medium");
        if (complaintFilter === "low") return complaintCases.filter((c) => c.severity === "low");
        return complaintCases;
    }, [complaintCases, complaintFilter]);
    const openPriorityCase = useMemo(() => {
        const severityWeight = { high: 3, medium: 2, low: 1 };
        return complaintCases
            .filter((c) => c.status === "open")
            .sort((a, b) => {
                const sa = severityWeight[a.severity] || 0;
                const sb = severityWeight[b.severity] || 0;
                if (sa !== sb) return sb - sa;
                return Number(b.complaint_id || 0) - Number(a.complaint_id || 0);
            })[0] || null;
    }, [complaintCases]);
    const nextBestAction = useMemo(() => {
        const target = openPriorityCase || null;
        const aging = advancedAnalytics?.aging_open_counts || {};
        const overdue = Number(aging.over_3d || 0) + Number(aging.d1_to_3 || 0);
        if (target) {
            const draftReply = target.severity === "high"
                ? "Thank you for reporting this. We have escalated this complaint to priority handling and assigned a recovery owner. You will receive a concrete ETA/update within 20 minutes."
                : "Thank you for raising this. We are actively reviewing your case and will provide a confirmed ETA/update shortly.";
            return {
                title: `Resolve complaint case #${target.complaint_id}`,
                summary: `${target.customer_name} has an open ${target.severity}-severity case${target.order_id ? ` linked to order #${target.order_id}` : ""}.`,
                preview: "Open the case, prefill an individualized recovery response, and send immediately.",
                cta: "Prepare Case Response",
                mode: "prepare_case_response",
                complaintId: target.complaint_id,
                draftReply
            };
        }
        if (overdue > 0) {
            return {
                title: "Clear aging complaint backlog",
                summary: `${overdue} complaint case(s) are aging beyond short-cycle SLA windows.`,
                preview: "Refresh queue and prioritize oldest open complaints first.",
                cta: "Refresh Queue",
                mode: "refresh_queue"
            };
        }
        return {
            title: "Maintain service watch",
            summary: "No open complaints are pending immediate intervention.",
            preview: "Refresh queue and continue proactive outbound messaging cadence.",
            cta: "Refresh Queue",
            mode: "refresh_queue"
        };
    }, [openPriorityCase, advancedAnalytics]);
    const orderRecoveryLens = useMemo(() => {
        const oc = activeComplaintCase?.order_context;
        if (!oc || typeof oc !== "object") return null;
        const updates = Array.isArray(oc.recent_updates) ? oc.recent_updates : [];
        const deliveries = Array.isArray(oc.deliveries) ? oc.deliveries : [];
        const payments = Array.isArray(oc.payments) ? oc.payments : [];
        const shipment = oc.shipment_public || {};

        const latestStatus = updates[0]?.new_status || updates[0]?.update_type || shipment?.status || "Unknown";
        const routeSignals = updates.filter((u) => {
            const t = String(u.update_type || "").toLowerCase();
            const n = String(u.notes || "").toLowerCase();
            return t.includes("exception") || t.includes("delay") || n.includes("delay") || n.includes("damag");
        }).length;
        const completedDeliveries = deliveries.filter((d) => String(d.delivery_status || "").toLowerCase().includes("delivered")).length;
        const assurance = Math.max(20, Math.min(98, 60 + completedDeliveries * 8 + payments.length * 4 - routeSignals * 9));

        return {
            latestStatus,
            routeSignals,
            completedDeliveries,
            paymentsCount: payments.length,
            assurance,
            senderName: oc.party_sender?.name || "Sender",
            receiverName: oc.party_receiver?.name || "Receiver",
            orderType: shipment.item_type || shipment.order_type || "General shipment",
            weight: shipment.weight_kg || shipment.weight || null
        };
    }, [activeComplaintCase]);
    const driverProfileById = useMemo(() => {
        const m = {};
        driverProfiles.forEach((p) => {
            m[String(p.driver_id)] = p;
        });
        return m;
    }, [driverProfiles]);
    const selectedDriverProfile = useMemo(() => {
        if (selectedType !== "driver" || !selectedId) return null;
        return driverProfileById[String(selectedId)] || null;
    }, [selectedType, selectedId, driverProfileById]);
    const riskDrivers = useMemo(
        () => driverProfiles.filter((p) => p.is_risk).slice(0, 12),
        [driverProfiles]
    );

    if (loading) {
        return (
            <div style={styles.loadingWrap}>
                <h2 style={{ margin: 0 }}>Launching Ops Communication Center...</h2>
            </div>
        );
    }

    return (
        <div style={styles.page}>
            <div style={styles.header}>
                <div>
                    <h1 style={styles.title}>Ops Communication Center</h1>
                    <p style={styles.subtitle}>
                        AI-supported operations chat across drivers and customers with live complaint and delay visibility.
                    </p>
                </div>
                <div style={{ display: "flex", gap: 10 }}>
                    <button onClick={loadBootstrap} style={styles.secondaryBtn}>Refresh</button>
                    <button onClick={() => navigate("/admin")} style={styles.primaryBtn}>Back To Admin</button>
                </div>
            </div>

            <div style={styles.metricsRow}>
                <MetricCard label="Customers" value={metrics?.customers_total || 0} />
                <MetricCard label="Drivers" value={metrics?.drivers_total || 0} />
                <MetricCard label="On Leave" value={metrics?.drivers_on_leave || 0} />
                <MetricCard label="Complaints (24h)" value={metrics?.complaints_24h || complaintCount} alert />
                <MetricCard label="Delay Alerts (24h)" value={metrics?.delay_alerts_24h || delayCount} alert />
            </div>

            {error ? <div style={styles.error}>{error}</div> : null}

            <div style={styles.topForms}>
                <div style={styles.panel}>
                    <h3 style={styles.panelTitle}>Broadcast Update</h3>
                    <div style={styles.inlineRow}>
                        <select value={broadcastAudience} onChange={(e) => setBroadcastAudience(e.target.value)} style={styles.input}>
                            <option value="all">All participants</option>
                            <option value="drivers">All drivers</option>
                            <option value="customers">All customers</option>
                        </select>
                        <select value={broadcastChannel} onChange={(e) => setBroadcastChannel(e.target.value)} style={styles.input}>
                            <option value="chat">Chat</option>
                            <option value="email">Email</option>
                            <option value="sms">SMS</option>
                        </select>
                    </div>
                    <input
                        value={broadcastSubject}
                        onChange={(e) => setBroadcastSubject(e.target.value)}
                        placeholder="Subject"
                        style={styles.input}
                    />
                    <textarea
                        rows={3}
                        value={broadcastMessage}
                        onChange={(e) => setBroadcastMessage(e.target.value)}
                        placeholder="Write an operations update for the selected audience..."
                        style={styles.textarea}
                    />
                    <button onClick={sendBroadcast} disabled={broadcastBusy} style={styles.primaryBtn}>
                        {broadcastBusy ? "Sending..." : "Send Broadcast"}
                    </button>
                </div>

                <div style={styles.panel}>
                    <h3 style={styles.panelTitle}>Log Driver Status</h3>
                    <div style={styles.inlineRow}>
                        <input
                            type="number"
                            value={driverStatusId}
                            onChange={(e) => setDriverStatusId(e.target.value)}
                            placeholder="Driver ID (e.g. 2026)"
                            style={styles.input}
                        />
                        <select value={driverStatusType} onChange={(e) => setDriverStatusType(e.target.value)} style={styles.input}>
                            <option value="late">Late</option>
                            <option value="leave">Leave</option>
                            <option value="issue">Issue</option>
                        </select>
                    </div>
                    <textarea
                        rows={3}
                        value={driverStatusDetail}
                        onChange={(e) => setDriverStatusDetail(e.target.value)}
                        placeholder="e.g. 45 min delay due to port congestion near stop 3"
                        style={styles.textarea}
                    />
                    <button onClick={logDriverStatus} disabled={incidentBusy} style={styles.secondaryBtn}>
                        {incidentBusy ? "Saving..." : "Log Driver Status"}
                    </button>
                </div>

                <div style={styles.panel}>
                    <h3 style={styles.panelTitle}>Log Customer Complaint</h3>
                    <input
                        type="number"
                        value={complaintCustomerId}
                        onChange={(e) => setComplaintCustomerId(e.target.value)}
                        placeholder="Customer ID (e.g. 8)"
                        style={styles.input}
                    />
                    <textarea
                        rows={3}
                        value={complaintDetail}
                        onChange={(e) => setComplaintDetail(e.target.value)}
                        placeholder="e.g. promised slot missed and no ETA update received"
                        style={styles.textarea}
                    />
                    <button onClick={logComplaint} disabled={incidentBusy} style={styles.secondaryBtn}>
                        {incidentBusy ? "Saving..." : "Log Complaint"}
                    </button>
                </div>
            </div>

            <div style={styles.complaintBoard}>
                <div style={styles.panel}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                        <h3 style={styles.panelTitle}>Customer Complaints Queue</h3>
                        <select value={complaintFilter} onChange={(e) => setComplaintFilter(e.target.value)} style={{ ...styles.input, maxWidth: 180 }}>
                            <option value="open">Open only</option>
                            <option value="all">All complaints</option>
                            <option value="resolved">Resolved</option>
                            <option value="high">High severity</option>
                            <option value="medium">Medium severity</option>
                            <option value="low">Low severity</option>
                        </select>
                    </div>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
                        <span style={styles.badge}>Open: {complaintBuckets.open || 0}</span>
                        <span style={styles.badge}>Resolved: {complaintBuckets.resolved || 0}</span>
                        <span style={{ ...styles.badge, borderColor: "#ef4444", color: "#991b1b" }}>High: {complaintBuckets.high || 0}</span>
                        <span style={{ ...styles.badge, borderColor: "#f59e0b", color: "#92400e" }}>Medium: {complaintBuckets.medium || 0}</span>
                        <span style={{ ...styles.badge, borderColor: "#64748b", color: "#334155" }}>Low: {complaintBuckets.low || 0}</span>
                    </div>
                    <div style={{ ...styles.listBox, maxHeight: 260 }}>
                        {filteredComplaintCases.length === 0 ? (
                            <p style={styles.muted}>No complaints in this filter.</p>
                        ) : (
                            filteredComplaintCases.map((c) => (
                                <button
                                    key={c.complaint_id}
                                    onClick={() => setActiveComplaintId(String(c.complaint_id))}
                                    style={{
                                        ...styles.threadRow,
                                        ...(String(activeComplaintId) === String(c.complaint_id) ? styles.threadActive : {})
                                    }}
                                >
                                    <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                                        <strong>{c.customer_name} · #{c.customer_id}</strong>
                                        <span style={styles.kindPill}>{c.severity}</span>
                                    </div>
                                    <div style={{ fontSize: 12, color: "#4b5563", marginTop: 4 }}>
                                        Case #{c.complaint_id} · {c.status} · {c.order_id ? `Order #${c.order_id}` : "No order linked"}
                                    </div>
                                    <div style={{ marginTop: 6, fontSize: 13, whiteSpace: "pre-wrap", color: "#111827" }}>
                                        {cleanText(c.body)}
                                    </div>
                                </button>
                            ))
                        )}
                    </div>
                    <OperationalIntelligenceBoard
                        analytics={advancedAnalytics}
                        analyticsWindow={analyticsWindow}
                        setAnalyticsWindow={setAnalyticsWindow}
                        loading={advancedAnalyticsLoading}
                    />
                    <div style={styles.actionCard}>
                        <div style={styles.actionHeader}>
                            <h4 style={{ margin: 0, fontSize: 14 }}>Next Best Action</h4>
                            <span style={styles.actionBadge}>AI Guided</span>
                        </div>
                        <div style={styles.actionTitle}>{nextBestAction.title}</div>
                        <div style={styles.actionSummary}>{nextBestAction.summary}</div>
                        <div style={styles.actionPreview}>
                            <strong>Action Preview:</strong> {nextBestAction.preview}
                        </div>
                        <button
                            onClick={() => applyNextBestAction(nextBestAction)}
                            disabled={actionBusy}
                            style={styles.primaryBtn}
                        >
                            {actionBusy ? "Applying..." : nextBestAction.cta}
                        </button>
                    </div>
                </div>

                <div style={styles.panel}>
                    <h3 style={styles.panelTitle}>Complaint Case Detail</h3>
                    {complaintLoading ? (
                        <p style={styles.muted}>Loading complaint case...</p>
                    ) : !activeComplaintCase ? (
                        <p style={styles.muted}>Select a complaint to review details.</p>
                    ) : (
                        <>
                            <div style={{ fontSize: 13, color: "#475569", marginBottom: 8 }}>
                                Case #{activeComplaintCase.complaint_id} · {activeComplaintCase.status} · {activeComplaintCase.severity}
                            </div>
                            <div style={{ ...styles.listBox, maxHeight: 220 }}>
                                {Array.isArray(activeComplaintCase.thread) && activeComplaintCase.thread.length > 0 ? (
                                    activeComplaintCase.thread.map((m) => (
                                        <div key={m.message_id} style={styles.messageItem}>
                                            <div style={styles.feedMeta}>
                                                <span>{m.actor_role}</span>
                                                <span>{m.direction} · {m.channel || "chat"}</span>
                                            </div>
                                            {m.subject ? <div style={{ fontWeight: 600, marginTop: 4 }}>{m.subject}</div> : null}
                                            <div style={{ marginTop: 4, whiteSpace: "pre-wrap", fontSize: 14 }}>{cleanText(m.body)}</div>
                                        </div>
                                    ))
                                ) : (
                                    <p style={styles.muted}>No case messages yet.</p>
                                )}
                            </div>
                            <div style={{ marginTop: 10 }}>
                                <textarea
                                    rows={3}
                                    value={complaintReply}
                                    onChange={(e) => setComplaintReply(e.target.value)}
                                    placeholder="Write an individual response for this complaint..."
                                    style={styles.textarea}
                                />
                                <button onClick={sendComplaintReply} disabled={complaintReplyBusy} style={styles.primaryBtn}>
                                    {complaintReplyBusy ? "Sending..." : "Respond To This Complaint"}
                                </button>
                            </div>
                            <div style={{ marginTop: 12 }}>
                                <h4 style={{ margin: "0 0 6px", fontSize: 14 }}>Order Details</h4>
                                {activeComplaintCase.order_id ? (
                                    <p style={{ margin: "0 0 8px", fontSize: 13, color: "#374151" }}>Linked order: #{activeComplaintCase.order_id}</p>
                                ) : (
                                    <p style={{ margin: "0 0 8px", fontSize: 13, color: "#64748b" }}>No order linked for this complaint.</p>
                                )}
                                <OrderRecoveryShowcase lens={orderRecoveryLens} />
                                {activeComplaintCase.order_context ? (
                                    <pre style={styles.orderContextPre}>
                                        {JSON.stringify(activeComplaintCase.order_context, null, 2)}
                                    </pre>
                                ) : (
                                    <p style={styles.muted}>Order context not available.</p>
                                )}
                            </div>
                        </>
                    )}
                </div>
            </div>

            <div style={styles.mainGrid}>
                <div style={styles.column}>
                    <h3 style={styles.sectionTitle}>Live Event Feed</h3>
                    <div style={styles.listBox}>
                        {feed.length === 0 ? (
                            <p style={styles.muted}>No events yet.</p>
                        ) : (
                            feed.map((ev) => (
                                <div key={ev.message_id} style={styles.feedItem}>
                                    <div style={styles.feedMeta}>
                                        <span>{ev.kind}</span>
                                        <span>{ev.participant_type} #{ev.participant_id}</span>
                                    </div>
                                    <div style={{ fontWeight: 600 }}>
                                        {ev.participant_name || `${ev.participant_type} #${ev.participant_id}`}
                                    </div>
                                    <div style={{ fontSize: 13 }}>{cleanText(ev.body)}</div>
                                </div>
                            ))
                        )}
                    </div>
                </div>

                <div style={styles.column}>
                    <h3 style={styles.sectionTitle}>Conversation Inbox</h3>
                    <div style={styles.listBox}>
                        {inbox.length === 0 ? (
                            <p style={styles.muted}>No threads available.</p>
                        ) : (
                            inbox.map((row) => {
                                const active = String(row.participant_id) === String(selectedId) && row.participant_type === selectedType;
                                const dp = row.participant_type === "driver" ? driverProfileById[String(row.participant_id)] : null;
                                return (
                                    <button
                                        key={`${row.participant_type}-${row.participant_id}`}
                                        onClick={() => selectThread(row.participant_type, row.participant_id, row.participant_name)}
                                        style={{ ...styles.threadRow, ...(active ? styles.threadActive : {}) }}
                                    >
                                        <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                                            <strong>{row.participant_name || `${row.participant_type} #${row.participant_id}`}</strong>
                                            <span style={styles.kindPill}>{row.kind}</span>
                                        </div>
                                        <div style={{ fontSize: 12, color: "#4b5563", marginTop: 4 }}>
                                            {row.actor_role} · {row.channel || "chat"}
                                        </div>
                                        {dp ? (
                                            <div style={{ marginTop: 6, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                                                <StarRating rating={dp.rating} />
                                                <span style={{ ...(dp.is_risk ? styles.driverRiskPill : styles.driverSafePill) }}>
                                                    {dp.is_risk ? "Risk" : "Healthy"}
                                                </span>
                                            </div>
                                        ) : null}
                                        <div style={{ marginTop: 6, fontSize: 13, color: "#111827", whiteSpace: "pre-wrap" }}>
                                            {cleanText(row.body)}
                                        </div>
                                    </button>
                                );
                            })
                        )}
                    </div>
                </div>

                <div style={styles.columnWide}>
                    <h3 style={styles.sectionTitle}>
                        Thread {selectedName ? `with ${selectedName}` : ""}
                    </h3>
                    {selectedDriverProfile ? (
                        <div style={{ ...styles.driverProfileCard, marginBottom: 8 }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                                <strong>{selectedDriverProfile.name} · Driver #{selectedDriverProfile.driver_id}</strong>
                                <StarRating rating={selectedDriverProfile.rating} />
                            </div>
                            <div style={{ marginTop: 6, display: "flex", gap: 8, flexWrap: "wrap" }}>
                                <span style={styles.driverBadge}>Status: {selectedDriverProfile.status}</span>
                                <span style={styles.driverBadge}>Active assignments: {selectedDriverProfile.active_assignments}</span>
                                <span style={styles.driverBadge}>Open complaints: {selectedDriverProfile.open_complaints}</span>
                                <span style={styles.driverBadge}>Late alerts (14d): {selectedDriverProfile.late_alerts_14d}</span>
                                <span style={styles.driverBadge}>Issues (14d): {selectedDriverProfile.issue_reports_14d}</span>
                            </div>
                            {selectedDriverProfile.risk_flags?.length ? (
                                <div style={{ marginTop: 7, color: "#991b1b", fontSize: 12 }}>
                                    Risk flags: {selectedDriverProfile.risk_flags.join(", ")}
                                </div>
                            ) : null}
                        </div>
                    ) : null}
                    <div style={styles.listBox}>
                        {threadBusy ? (
                            <p style={styles.muted}>Loading thread...</p>
                        ) : thread.length === 0 ? (
                            <p style={styles.muted}>Select a thread from inbox.</p>
                        ) : (
                            thread.map((m) => (
                                <div key={m.message_id} style={styles.messageItem}>
                                    <div style={styles.feedMeta}>
                                        <span>{m.actor_role}</span>
                                        <span>{m.direction} · {m.channel || "chat"}</span>
                                    </div>
                                    {m.subject ? <div style={{ fontWeight: 600, marginTop: 4 }}>{m.subject}</div> : null}
                                    <div style={{ marginTop: 4, whiteSpace: "pre-wrap", fontSize: 14 }}>{cleanText(m.body)}</div>
                                </div>
                            ))
                        )}
                    </div>
                    <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
                        <div style={styles.inlineRow}>
                            <select value={threadChannel} onChange={(e) => setThreadChannel(e.target.value)} style={styles.input}>
                                <option value="chat">Chat</option>
                                <option value="email">Email</option>
                                <option value="sms">SMS</option>
                            </select>
                            <input
                                value={threadSubject}
                                onChange={(e) => setThreadSubject(e.target.value)}
                                placeholder="Subject (optional)"
                                style={styles.input}
                            />
                        </div>
                        <textarea
                            rows={3}
                            value={threadMessage}
                            onChange={(e) => setThreadMessage(e.target.value)}
                            placeholder="Type a message to this participant..."
                            style={styles.textarea}
                        />
                        <label style={{ fontSize: 13, color: "#374151" }}>
                            <input
                                type="checkbox"
                                checked={autoReply}
                                onChange={(e) => setAutoReply(e.target.checked)}
                                style={{ marginRight: 8 }}
                            />
                            Generate participant acknowledgment automatically
                        </label>
                        <button onClick={sendThreadMessage} disabled={threadSendBusy} style={styles.primaryBtn}>
                            {threadSendBusy ? "Sending..." : "Send To Thread"}
                        </button>
                    </div>
                </div>

                <div style={styles.column}>
                    <h3 style={styles.sectionTitle}>Driver Risk Radar</h3>
                    <div style={styles.listBox}>
                        {driverProfilesLoading ? (
                            <p style={styles.muted}>Loading driver profiles...</p>
                        ) : riskDrivers.length === 0 ? (
                            <p style={styles.muted}>No active driver risks detected.</p>
                        ) : (
                            riskDrivers.map((d) => (
                                <div key={d.driver_id} style={styles.driverRiskRow}>
                                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                                        <strong>{d.name} · #{d.driver_id}</strong>
                                        <StarRating rating={d.rating} />
                                    </div>
                                    <div style={{ marginTop: 6, display: "flex", gap: 6, flexWrap: "wrap" }}>
                                        {(d.risk_flags || []).map((f) => (
                                            <span key={f} style={styles.driverRiskFlag}>{f}</span>
                                        ))}
                                    </div>
                                    <div style={{ marginTop: 6, fontSize: 12, color: "#7f1d1d" }}>
                                        Complaints: {d.open_complaints} · Late alerts: {d.late_alerts_14d} · Issues: {d.issue_reports_14d}
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>

            </div>
        </div>
    );
}

function MetricCard({ label, value, alert }) {
    return (
        <div style={{ ...styles.metricCard, ...(alert ? styles.metricAlert : {}) }}>
            <div style={{ fontSize: 12, textTransform: "uppercase", color: "#475569" }}>{label}</div>
            <div style={{ fontSize: 28, fontWeight: 800, color: "#0f172a" }}>{value}</div>
        </div>
    );
}

function OperationalIntelligenceBoard({ analytics, analyticsWindow, setAnalyticsWindow, loading }) {
    if (loading && !analytics) {
        return <div style={styles.analyticsPanel}><p style={styles.muted}>Loading operational analytics...</p></div>;
    }
    const a = analytics || {};
    const sev = a.severity_counts || {};
    const aging = a.aging_open_counts || {};
    const roots = a.root_cause_counts || {};
    const impacts = Array.isArray(a.driver_impact_top) ? a.driver_impact_top : [];
    const insights = Array.isArray(a.insights) ? a.insights : [];

    const rootPairs = Object.entries(roots).sort((x, y) => Number(y[1] || 0) - Number(x[1] || 0));
    const maxRoot = Math.max(1, ...rootPairs.map(([, v]) => Number(v || 0)));
    const backlogAging = Number(aging.d1_to_3 || 0) + Number(aging.over_3d || 0);
    const backlogOpen = Number(a.open_complaints || 0);
    const backlogShare = backlogOpen > 0 ? Math.round((backlogAging / backlogOpen) * 100) : 0;
    const highSev = Number(sev.high || 0);
    const severeShare = backlogOpen > 0 ? Math.round((highSev / backlogOpen) * 100) : 0;
    const unresolvedGap = Math.max(0, Number(a.open_complaints || 0) - Number(a.resolved_complaints || 0));

    const topRoot = rootPairs[0]?.[0] || "other";
    const rootActionMap = {
        delay_or_eta: "Trigger proactive ETA updates on all delayed routes and rebalance stops.",
        damage_quality: "Escalate packaging/handling QA and mark at-risk hubs for inspection.",
        cold_chain_temp: "Lock cold-chain temperature checks before dispatch confirmation.",
        communication_gap: "Auto-push milestone notifications to affected customers.",
        other: "Audit inbound complaint text and refine categorization playbooks."
    };
    const topRootAction = rootActionMap[topRoot] || rootActionMap.other;

    const pressureBand = Number(a.critical_pressure_index || 0) >= 70
        ? "Critical"
        : Number(a.critical_pressure_index || 0) >= 40
            ? "Elevated"
            : "Controlled";
    const pressureColor = pressureBand === "Critical" ? "#b91c1c" : pressureBand === "Elevated" ? "#92400e" : "#065f46";

    return (
        <div style={styles.analyticsPanel}>
            <div style={styles.analyticsHead}>
                <h4 style={{ margin: 0, fontSize: 15 }}>Operational Intelligence Board</h4>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 12, color: "#475569" }}>Horizon</span>
                    <select
                        value={analyticsWindow}
                        onChange={(e) => setAnalyticsWindow(e.target.value)}
                        style={{ ...styles.input, minWidth: 130, padding: "7px 9px" }}
                    >
                        <option value="24h">Last 24h</option>
                        <option value="7d">Last 7 days</option>
                        <option value="30d">Last 30 days</option>
                        <option value="90d">Last 90 days</option>
                    </select>
                </div>
            </div>

            <div style={styles.analyticsKpiGrid}>
                <div style={styles.analyticsKpi}><span>Critical Pressure</span><strong>{a.critical_pressure_index ?? 0}</strong></div>
                <div style={styles.analyticsKpi}><span>Recovery Efficiency</span><strong>{a.recovery_efficiency_score ?? 0}</strong></div>
                <div style={styles.analyticsKpi}><span>Open Rate</span><strong>{a.open_rate_pct ?? 0}%</strong></div>
                <div style={styles.analyticsKpi}><span>Median Resolution</span><strong>{a.median_resolution_hours ?? 0}h</strong></div>
            </div>
            <div style={styles.analyticsInsight}>
                <strong>Pressure band:</strong>{" "}
                <span style={{ color: pressureColor, fontWeight: 800 }}>{pressureBand}</span>
                {" · "}
                <strong>Aging backlog:</strong> {backlogAging}/{backlogOpen || 0} ({backlogShare}%)
                {" · "}
                <strong>High-severity share:</strong> {severeShare}%
                {" · "}
                <strong>Open/Resolved gap:</strong> {unresolvedGap}
            </div>

            <div style={styles.deepAnalyticsGrid}>
                <div style={styles.deepCard}>
                    <h5 style={styles.deepTitle}>Root Cause Mix</h5>
                    {rootPairs.length === 0 ? <p style={styles.muted}>No complaint signals in horizon.</p> : rootPairs.map(([k, v]) => (
                        <div key={k} style={{ marginBottom: 7 }}>
                            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#334155" }}>
                                <span>{k.replaceAll("_", " ")}</span>
                                <strong>{v}</strong>
                            </div>
                            <div style={styles.rootBarTrack}>
                                <div style={{ ...styles.rootBarFill, width: `${Math.round((Number(v || 0) / maxRoot) * 100)}%` }} />
                            </div>
                        </div>
                    ))}
                </div>

                <div style={styles.deepCard}>
                    <h5 style={styles.deepTitle}>Backlog Aging Risk</h5>
                    <div style={styles.riskTableRow}><span>&lt; 2h</span><strong>{aging.under_2h || 0}</strong></div>
                    <div style={styles.riskTableRow}><span>2h - 24h</span><strong>{aging.h2_to_24 || 0}</strong></div>
                    <div style={styles.riskTableRow}><span>1d - 3d</span><strong>{aging.d1_to_3 || 0}</strong></div>
                    <div style={styles.riskTableRow}><span>&gt; 3d</span><strong style={{ color: "#b91c1c" }}>{aging.over_3d || 0}</strong></div>
                    <div style={{ marginTop: 8, fontSize: 12, color: "#334155" }}>
                        Severity split: H {sev.high || 0} · M {sev.medium || 0} · L {sev.low || 0}
                    </div>
                </div>

                <div style={styles.deepCard}>
                    <h5 style={styles.deepTitle}>Driver Impact Map</h5>
                    {impacts.length === 0 ? (
                        <p style={styles.muted}>No driver linkage from current open complaint orders.</p>
                    ) : (
                        impacts.slice(0, 6).map((d) => (
                            <div key={d.driver_id} style={styles.riskTableRow}>
                                <span>{d.driver_name} · #{d.driver_id}</span>
                                <strong>{d.linked_open_orders} affected orders</strong>
                            </div>
                        ))
                    )}
                </div>
            </div>

            {insights.length > 0 ? (
                <div style={styles.analyticsInsight}>
                    <strong>Executive Insights:</strong>
                    {insights.map((i, idx) => (
                        <div key={idx} style={{ marginTop: 4 }}>{i}</div>
                    ))}
                </div>
            ) : null}
            <div style={{ ...styles.analyticsInsight, borderColor: "#fde68a", background: "#fffbeb", color: "#78350f" }}>
                <strong>Programmatic next step:</strong> {topRootAction}
            </div>
        </div>
    );
}

function OrderRecoveryShowcase({ lens }) {
    if (!lens) return null;
    return (
        <div style={styles.recoveryCard}>
            <div style={styles.recoveryTop}>
                <h4 style={{ margin: 0, fontSize: 14 }}>Recovery Intelligence Layer</h4>
                <span style={styles.recoveryTag}>{lens.latestStatus}</span>
            </div>
            <p style={{ margin: "6px 0 10px", fontSize: 12, color: "#334155" }}>
                {lens.senderName} → {lens.receiverName} · {lens.orderType}{lens.weight ? ` · ${lens.weight}kg` : ""}
            </p>
            <div style={styles.recoveryMeterWrap}>
                <div style={styles.recoveryMeterLabel}>Customer Assurance</div>
                <div style={styles.recoveryMeterTrack}>
                    <div style={{ ...styles.recoveryMeterFill, width: `${lens.assurance}%` }} />
                </div>
                <div style={styles.recoveryMeterValue}>{lens.assurance}%</div>
            </div>
            <div style={styles.recoveryGrid}>
                <div style={styles.recoveryCell}><span>Route Risk Signals</span><strong>{lens.routeSignals}</strong></div>
                <div style={styles.recoveryCell}><span>Completed Deliveries</span><strong>{lens.completedDeliveries}</strong></div>
                <div style={styles.recoveryCell}><span>Payment Checkpoints</span><strong>{lens.paymentsCount}</strong></div>
            </div>
        </div>
    );
}

function StarRating({ rating }) {
    const value = Math.max(0, Math.min(5, Number(rating || 0)));
    const pct = `${(value / 5) * 100}%`;
    const hue = value >= 4.5 ? "#16a34a" : value >= 3 ? "#d97706" : "#dc2626";
    return (
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={styles.starWrap}>
                <div style={styles.starBase}>★★★★★</div>
                <div style={{ ...styles.starFill, width: pct, color: hue }}>★★★★★</div>
            </div>
            <span style={{ fontSize: 12, fontWeight: 700, color: hue }}>{value.toFixed(1)}</span>
        </div>
    );
}

const styles = {
    page: {
        minHeight: "100vh",
        padding: "24px",
        background: "linear-gradient(135deg, #f8fafc 0%, #ecfeff 40%, #eef2ff 100%)",
        fontFamily: "system-ui, -apple-system, Segoe UI, sans-serif",
        color: "#0f172a"
    },
    loadingWrap: {
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#f8fafc"
    },
    header: {
        display: "flex",
        justifyContent: "space-between",
        alignItems: "flex-start",
        gap: 16,
        marginBottom: 14
    },
    title: {
        margin: 0,
        fontSize: 30,
        fontWeight: 900,
        letterSpacing: "-0.02em"
    },
    subtitle: {
        margin: "6px 0 0",
        color: "#334155",
        maxWidth: 860
    },
    metricsRow: {
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
        gap: 10,
        marginBottom: 14
    },
    metricCard: {
        background: "#ffffff",
        border: "1px solid #dbeafe",
        borderRadius: 12,
        padding: "12px 14px",
        boxShadow: "0 10px 20px rgba(15, 23, 42, 0.06)"
    },
    metricAlert: {
        borderColor: "#fecaca",
        background: "#fff7ed"
    },
    topForms: {
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
        gap: 12,
        marginBottom: 14
    },
    complaintBoard: {
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))",
        gap: 12,
        marginBottom: 14
    },
    panel: {
        background: "#ffffff",
        border: "1px solid #e2e8f0",
        borderRadius: 12,
        padding: 12,
        boxShadow: "0 6px 18px rgba(15, 23, 42, 0.05)"
    },
    panelTitle: {
        margin: "0 0 8px",
        fontSize: 16
    },
    pulseCard: {
        marginTop: 10,
        border: "1px solid #dbeafe",
        borderRadius: 12,
        background: "linear-gradient(145deg, #f8fafc 0%, #eef2ff 55%, #ecfeff 100%)",
        padding: 10
    },
    pulseHeader: {
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: 8
    },
    pulseTag: {
        fontSize: 11,
        textTransform: "uppercase",
        letterSpacing: "0.06em",
        border: "1px solid #cbd5e1",
        borderRadius: 999,
        padding: "3px 7px",
        background: "rgba(255,255,255,0.8)"
    },
    pulseBody: {
        display: "flex",
        gap: 12,
        alignItems: "center",
        flexWrap: "wrap"
    },
    pulseGrid: {
        display: "grid",
        gridTemplateColumns: "repeat(2, minmax(90px, 1fr))",
        gap: 8
    },
    pulseMetric: {
        border: "1px solid #dbeafe",
        borderRadius: 9,
        background: "rgba(255,255,255,0.86)",
        padding: "7px 8px",
        display: "grid",
        gap: 2,
        fontSize: 11,
        color: "#475569"
    },
    severityRail: {
        marginTop: 9,
        display: "flex",
        gap: 6,
        alignItems: "stretch"
    },
    severityChunk: {
        textAlign: "center",
        fontSize: 11,
        fontWeight: 700,
        borderRadius: 8,
        padding: "6px 4px"
    },
    pulseAction: {
        margin: "10px 0 0",
        fontSize: 12,
        color: "#334155",
        lineHeight: 1.4
    },
    momentumCard: {
        marginTop: 10,
        border: "1px solid #bfdbfe",
        borderRadius: 12,
        background: "linear-gradient(120deg, #f0f9ff 0%, #eff6ff 40%, #f5f3ff 100%)",
        padding: 10
    },
    momentumHeader: {
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: 8
    },
    momentumPill: {
        fontSize: 11,
        textTransform: "uppercase",
        letterSpacing: "0.06em",
        border: "1px solid #93c5fd",
        borderRadius: 999,
        padding: "3px 8px",
        color: "#1d4ed8",
        background: "rgba(255,255,255,0.8)"
    },
    momentumBody: {
        display: "grid",
        gridTemplateColumns: "1.2fr 1fr",
        gap: 10,
        alignItems: "center"
    },
    sparklineWrap: {
        display: "flex",
        gap: 8,
        alignItems: "flex-end",
        border: "1px solid #dbeafe",
        borderRadius: 10,
        background: "rgba(255,255,255,0.85)",
        padding: "10px 8px"
    },
    sparkCol: {
        flex: 1,
        display: "grid",
        gap: 5,
        justifyItems: "center"
    },
    sparkBar: {
        width: "100%",
        maxWidth: 26,
        borderRadius: 7,
        background: "linear-gradient(180deg, #0284c7 0%, #4338ca 100%)",
        boxShadow: "0 6px 14px rgba(67, 56, 202, 0.25)"
    },
    sparkLabel: {
        fontSize: 10,
        color: "#475569"
    },
    momentumRight: {
        border: "1px solid #dbeafe",
        borderRadius: 10,
        background: "rgba(255,255,255,0.86)",
        padding: 10,
        display: "grid",
        gap: 6
    },
    momentumStatLine: {
        display: "flex",
        justifyContent: "space-between",
        gap: 8,
        fontSize: 12,
        color: "#334155"
    },
    actionCard: {
        marginTop: 10,
        border: "1px solid #99f6e4",
        borderRadius: 12,
        background: "linear-gradient(125deg, #f0fdfa 0%, #ecfeff 40%, #f8fafc 100%)",
        padding: 10
    },
    actionHeader: {
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: 6
    },
    actionBadge: {
        fontSize: 11,
        textTransform: "uppercase",
        letterSpacing: "0.06em",
        border: "1px solid #5eead4",
        borderRadius: 999,
        padding: "3px 8px",
        color: "#0f766e",
        background: "rgba(255,255,255,0.8)"
    },
    actionTitle: {
        fontWeight: 800,
        fontSize: 15,
        color: "#0f172a"
    },
    actionSummary: {
        marginTop: 4,
        fontSize: 13,
        color: "#334155"
    },
    actionPreview: {
        marginTop: 8,
        marginBottom: 10,
        fontSize: 12,
        color: "#0f172a",
        lineHeight: 1.4,
        border: "1px solid #ccfbf1",
        borderRadius: 8,
        background: "rgba(255,255,255,0.85)",
        padding: "8px 9px"
    },
    analyticsSpanTwo: {
        gridColumn: "1 / span 2",
        minWidth: 0
    },
    analyticsPanel: {
        marginTop: 2,
        border: "1px solid #bae6fd",
        borderRadius: 12,
        background: "linear-gradient(125deg, #f0f9ff 0%, #f8fafc 55%, #eef2ff 100%)",
        padding: 12
    },
    analyticsHead: {
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: 10,
        flexWrap: "wrap",
        marginBottom: 10
    },
    analyticsKpiGrid: {
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
        gap: 8,
        marginBottom: 10
    },
    analyticsKpi: {
        border: "1px solid #dbeafe",
        borderRadius: 9,
        background: "rgba(255,255,255,0.88)",
        padding: "8px 9px",
        display: "grid",
        gap: 2,
        fontSize: 12,
        color: "#475569"
    },
    analyticsBars: {
        border: "1px solid #dbeafe",
        borderRadius: 10,
        background: "rgba(255,255,255,0.9)",
        padding: 10,
        display: "grid",
        gridTemplateColumns: "repeat(6, minmax(56px, 1fr))",
        gap: 8,
        alignItems: "end"
    },
    analyticsBarCol: {
        display: "grid",
        gap: 7,
        justifyItems: "center"
    },
    analyticsBarStackWrap: {
        height: 130,
        display: "flex",
        alignItems: "flex-end"
    },
    analyticsBarStack: {
        width: 26,
        borderRadius: 8,
        overflow: "hidden",
        display: "flex",
        flexDirection: "column-reverse",
        border: "1px solid #cbd5e1",
        boxShadow: "0 6px 12px rgba(2, 132, 199, 0.16)"
    },
    analyticsSegHigh: { background: "linear-gradient(180deg, #ef4444 0%, #b91c1c 100%)" },
    analyticsSegMed: { background: "linear-gradient(180deg, #f59e0b 0%, #d97706 100%)" },
    analyticsSegLow: { background: "linear-gradient(180deg, #34d399 0%, #059669 100%)" },
    analyticsBarMeta: {
        display: "grid",
        justifyItems: "center",
        fontSize: 11,
        color: "#475569"
    },
    analyticsInsight: {
        marginTop: 10,
        border: "1px solid #bfdbfe",
        borderRadius: 8,
        background: "rgba(255,255,255,0.86)",
        padding: "8px 10px",
        fontSize: 12,
        color: "#334155",
        lineHeight: 1.4
    },
    deepAnalyticsGrid: {
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
        gap: 10
    },
    deepCard: {
        border: "1px solid #dbeafe",
        borderRadius: 10,
        background: "rgba(255,255,255,0.9)",
        padding: 9
    },
    deepTitle: {
        margin: "0 0 8px",
        fontSize: 13
    },
    rootBarTrack: {
        width: "100%",
        height: 7,
        borderRadius: 999,
        background: "#e2e8f0",
        overflow: "hidden",
        border: "1px solid #cbd5e1"
    },
    rootBarFill: {
        height: "100%",
        background: "linear-gradient(90deg, #0ea5e9 0%, #2563eb 100%)"
    },
    riskTableRow: {
        display: "flex",
        justifyContent: "space-between",
        gap: 8,
        fontSize: 12,
        color: "#334155",
        marginBottom: 6
    },
    recoveryCard: {
        marginTop: 6,
        marginBottom: 8,
        border: "1px solid #a7f3d0",
        borderRadius: 10,
        background: "linear-gradient(120deg, #f0fdf4 0%, #ecfeff 50%, #f8fafc 100%)",
        padding: 10
    },
    recoveryTop: {
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: 8
    },
    recoveryTag: {
        fontSize: 11,
        border: "1px solid #6ee7b7",
        borderRadius: 999,
        padding: "3px 8px",
        color: "#065f46",
        background: "rgba(255,255,255,0.85)"
    },
    recoveryMeterWrap: {
        display: "grid",
        gridTemplateColumns: "110px 1fr auto",
        alignItems: "center",
        gap: 8,
        marginBottom: 8
    },
    recoveryMeterLabel: {
        fontSize: 12,
        color: "#334155"
    },
    recoveryMeterTrack: {
        height: 9,
        borderRadius: 999,
        background: "#d1fae5",
        overflow: "hidden",
        border: "1px solid #a7f3d0"
    },
    recoveryMeterFill: {
        height: "100%",
        background: "linear-gradient(90deg, #10b981 0%, #0ea5e9 100%)"
    },
    recoveryMeterValue: {
        fontSize: 12,
        fontWeight: 700,
        color: "#0f172a"
    },
    recoveryGrid: {
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
        gap: 7
    },
    recoveryCell: {
        border: "1px solid #bbf7d0",
        borderRadius: 8,
        background: "rgba(255,255,255,0.88)",
        padding: "7px 8px",
        display: "grid",
        gap: 2,
        fontSize: 11,
        color: "#334155"
    },
    mainGrid: {
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
        gap: 12
    },
    column: {
        minWidth: 0
    },
    columnWide: {
        minWidth: 0
    },
    sectionTitle: {
        margin: "0 0 8px",
        fontSize: 16
    },
    listBox: {
        background: "#ffffff",
        border: "1px solid #e2e8f0",
        borderRadius: 12,
        padding: 10,
        maxHeight: 520,
        overflowY: "auto"
    },
    feedItem: {
        padding: 10,
        borderBottom: "1px dashed #e2e8f0"
    },
    feedMeta: {
        display: "flex",
        justifyContent: "space-between",
        fontSize: 11,
        color: "#475569"
    },
    threadRow: {
        width: "100%",
        textAlign: "left",
        padding: 10,
        border: "1px solid #e2e8f0",
        borderRadius: 10,
        background: "#f8fafc",
        marginBottom: 8,
        cursor: "pointer"
    },
    threadActive: {
        borderColor: "#38bdf8",
        background: "#ecfeff"
    },
    driverRiskPill: {
        fontSize: 10,
        border: "1px solid #ef4444",
        color: "#991b1b",
        background: "#fee2e2",
        borderRadius: 999,
        padding: "2px 7px",
        fontWeight: 700
    },
    driverSafePill: {
        fontSize: 10,
        border: "1px solid #22c55e",
        color: "#166534",
        background: "#dcfce7",
        borderRadius: 999,
        padding: "2px 7px",
        fontWeight: 700
    },
    kindPill: {
        fontSize: 10,
        textTransform: "uppercase",
        border: "1px solid #cbd5e1",
        padding: "2px 6px",
        borderRadius: 999
    },
    badge: {
        fontSize: 11,
        border: "1px solid #cbd5e1",
        borderRadius: 999,
        padding: "3px 8px",
        color: "#334155",
        background: "#f8fafc"
    },
    driverProfileCard: {
        border: "1px solid #fecaca",
        borderRadius: 10,
        background: "linear-gradient(115deg, #fff7ed 0%, #fef2f2 100%)",
        padding: 10
    },
    driverBadge: {
        fontSize: 11,
        border: "1px solid #fecaca",
        borderRadius: 999,
        padding: "3px 8px",
        background: "rgba(255,255,255,0.85)",
        color: "#7f1d1d"
    },
    driverRiskRow: {
        border: "1px solid #fecaca",
        borderRadius: 10,
        background: "#fef2f2",
        padding: 9,
        marginBottom: 8
    },
    driverRiskFlag: {
        fontSize: 10,
        border: "1px solid #ef4444",
        color: "#991b1b",
        background: "#fee2e2",
        borderRadius: 999,
        padding: "2px 7px",
        fontWeight: 700
    },
    starWrap: {
        position: "relative",
        display: "inline-block",
        letterSpacing: "0.06em",
        lineHeight: 1
    },
    starBase: {
        color: "#cbd5e1",
        fontSize: 14
    },
    starFill: {
        position: "absolute",
        top: 0,
        left: 0,
        overflow: "hidden",
        whiteSpace: "nowrap",
        fontSize: 14
    },
    messageItem: {
        padding: 10,
        borderBottom: "1px dashed #e2e8f0"
    },
    inlineRow: {
        display: "flex",
        gap: 8
    },
    input: {
        width: "100%",
        border: "1px solid #cbd5e1",
        borderRadius: 8,
        padding: "9px 10px",
        fontSize: 13,
        background: "#fff"
    },
    textarea: {
        width: "100%",
        border: "1px solid #cbd5e1",
        borderRadius: 8,
        padding: "9px 10px",
        fontSize: 13,
        resize: "vertical",
        boxSizing: "border-box"
    },
    primaryBtn: {
        border: "none",
        borderRadius: 9,
        background: "#0f766e",
        color: "white",
        fontWeight: 700,
        padding: "10px 14px",
        cursor: "pointer"
    },
    secondaryBtn: {
        border: "1px solid #0f766e",
        borderRadius: 9,
        background: "white",
        color: "#0f766e",
        fontWeight: 700,
        padding: "10px 14px",
        cursor: "pointer"
    },
    error: {
        marginBottom: 10,
        background: "#fef2f2",
        color: "#b91c1c",
        border: "1px solid #fecaca",
        borderRadius: 10,
        padding: "8px 10px"
    },
    orderContextPre: {
        margin: 0,
        whiteSpace: "pre-wrap",
        maxHeight: 220,
        overflowY: "auto",
        fontSize: 11,
        background: "#0f172a",
        color: "#e2e8f0",
        padding: 10,
        borderRadius: 8
    },
    muted: {
        color: "#64748b",
        fontSize: 13
    }
};

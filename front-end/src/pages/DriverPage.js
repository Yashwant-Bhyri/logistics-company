import React, { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon-2x.png',
    iconUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon.png',
    shadowUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png',
});

export default function DriverPage() {
    const [assignments, setAssignments] = useState([]);
    const [selectedRoute, setSelectedRoute] = useState(null);
    const [selectedAssignment, setSelectedAssignment] = useState(null);
    const [stops, setStops] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [driverId, setDriverId] = useState(null);
    const [driverName, setDriverName] = useState("");
    const [weatherData, setWeatherData] = useState([]);
    const [trafficData, setTrafficData] = useState([]);
    const [combinedRisk, setCombinedRisk] = useState(null);
    const [showNotesModal, setShowNotesModal] = useState(false);
    const [selectedStop, setSelectedStop] = useState(null);
    const [notes, setNotes] = useState("");
    const [expandedAssignment, setExpandedAssignment] = useState(null);
    const [isOptimized, setIsOptimized] = useState(false);
    const navigate = useNavigate();
    const mapRef = useRef(null);
    const mapInstanceRef = useRef(null);
    const markersRef = useRef([]);
    const polylineRef = useRef(null);
    const distanceLabelsRef = useRef([]);
    const [showActionModal, setShowActionModal] = useState(false);
    const [selectedAction, setSelectedAction] = useState(null); // 'ARRIVED' or 'COMPLETED'

    const saveConditions = async () => {
        const token = localStorage.getItem("token");
        try {
            const response = await fetch(`/save_current_conditions/${selectedRoute}`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${token}`
                }
            });
            const data = await response.json();
            alert(data.message);
        } catch (err) {
            console.error("Error saving conditions:", err);
            alert("Failed to save conditions");
        }
    };

    const calculateDistance = (point1, point2) => {
        const R = 6371;
        const lat1 = point1.lat * Math.PI / 180;
        const lat2 = point2.lat * Math.PI / 180;
        const deltaLat = (point2.lat - point1.lat) * Math.PI / 180;
        const deltaLon = (point2.lng - point1.lng) * Math.PI / 180;
        const a = Math.sin(deltaLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) ** 2;
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    };

    const calculateTotalDistance = (stopsArray) => {
        let total = 0;
        for (let i = 1; i < stopsArray.length; i++) {
            total += calculateDistance(stopsArray[i - 1], stopsArray[i]);
        }
        return total;
    };

    useEffect(() => {
        const token = localStorage.getItem("token");
        if (!token) {
            setError("No authentication token found. Please log in again.");
            setLoading(false);
            return;
        }
        try {
            const payload = JSON.parse(atob(token.split('.')[1]));
            setDriverId(payload.user_id);
        } catch (e) {
            console.error("Error decoding token:", e);
        }
        fetch("/driver/assignments", {
            headers: { "Authorization": `Bearer ${token}` }
        })
            .then(res => res.json())
            .then(data => {
                setAssignments(Array.isArray(data) ? data : []);
                setLoading(false);
            })
            .catch(err => {
                console.error("Fetch error:", err);
                setError(err.message);
                setLoading(false);
            });
    }, []);

    useEffect(() => {
        if (!mapRef.current || mapInstanceRef.current || !selectedRoute) return;
        let center = [23.1291, 113.2644];
        let zoom = 8;
        if (stops.length > 0 && stops[0].lat && stops[0].lng) {
            center = [stops[0].lat, stops[0].lng];
            zoom = 9;
        }
        mapInstanceRef.current = L.map(mapRef.current).setView(center, zoom);
        L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
            maxZoom: 19
        }).addTo(mapInstanceRef.current);
        return () => {
            if (mapInstanceRef.current) {
                mapInstanceRef.current.remove();
                mapInstanceRef.current = null;
            }
        };
    }, [selectedRoute, stops]);

    useEffect(() => {
        if (!mapInstanceRef.current || !selectedRoute || stops.length === 0) return;
        const map = mapInstanceRef.current;
        markersRef.current.forEach(marker => marker.remove());
        markersRef.current = [];
        distanceLabelsRef.current.forEach(label => label.remove());
        distanceLabelsRef.current = [];
        if (polylineRef.current) {
            map.removeLayer(polylineRef.current);
            polylineRef.current = null;
        }
        const validStops = stops.filter(stop => stop.lat && stop.lng);
        if (validStops.length === 0) return;
        if (!isOptimized) {
            const polylinePoints = validStops.map(stop => [stop.lat, stop.lng]);
            polylineRef.current = L.polyline(polylinePoints, { color: '#2196f3', weight: 4, opacity: 0.8 }).addTo(map);
            for (let i = 1; i < validStops.length; i++) {
                const dist = calculateDistance(validStops[i - 1], validStops[i]);
                const midLat = (validStops[i - 1].lat + validStops[i].lat) / 2;
                const midLng = (validStops[i - 1].lng + validStops[i].lng) / 2;
                const distanceLabel = L.marker([midLat, midLng], {
                    icon: L.divIcon({
                        html: `<div style="background:white; color:#2196f3; padding:4px 10px; border-radius:20px; font-size:12px; font-weight:bold; border:2px solid #2196f3;">📏 ${dist.toFixed(1)} km</div>`,
                        iconSize: [80, 30]
                    }),
                    interactive: false
                }).addTo(map);
                distanceLabelsRef.current.push(distanceLabel);
            }
            if (validStops.length > 1) {
                const totalDistance = calculateTotalDistance(validStops);
                const centerIndex = Math.floor(validStops.length / 2);
                const centerPoint = [validStops[centerIndex].lat, validStops[centerIndex].lng];
                const totalDistanceLabel = L.marker(centerPoint, {
                    icon: L.divIcon({
                        html: `<div style="background:#2196f3; color:white; padding:6px 14px; border-radius:25px; font-size:14px; font-weight:bold; border:2px solid white;">🎯 TOTAL: ${totalDistance.toFixed(1)} km</div>`,
                        iconSize: [150, 40]
                    }),
                    interactive: false
                }).addTo(map);
                distanceLabelsRef.current.push(totalDistanceLabel);
            }
        }
        const bounds = L.latLngBounds();
        validStops.forEach((stop, idx) => {
            let markerColor = '#007bff';
            if (stop.scan_status === 'COMPLETED') markerColor = '#4caf50';
            else if (stop.scan_status === 'ARRIVED') markerColor = '#ff9800';
            let cumulativeDistance = 0;
            for (let i = 1; i <= idx; i++) {
                cumulativeDistance += calculateDistance(validStops[i - 1], validStops[i]);
            }
            const marker = L.marker([stop.lat, stop.lng]).bindPopup(`
                <div style="min-width:220px; padding:5px;">
                    <h4 style="margin:0 0 8px 0; color:#2196f3;">📍 ${stop.name}</h4>
                    <p style="margin:4px 0;"><strong>Location:</strong> ${stop.location}</p>
                    <p style="margin:4px 0;"><strong>Status:</strong> <span style="color:${markerColor};">${stop.scan_status || 'Not started'}</span></p>
                    ${stop.weather ? `<p style="margin:4px 0;"><strong>🌤️ Weather:</strong> ${stop.weather.weather_status} | ${stop.weather.temperature}°C</p>` : ''}
                    ${stop.traffic ? `<p style="margin:4px 0;"><strong>🚗 Traffic:</strong> ${stop.traffic.traffic_status}</p>` : ''}
                    ${stop.risk_score ? `<p style="margin:4px 0;"><strong>⚠️ Risk:</strong> ${(stop.risk_score * 100).toFixed(0)}%</p>` : ''}
                    ${idx > 0 ? `<p style="margin:4px 0;"><strong>Distance from previous:</strong> ${calculateDistance(validStops[idx - 1], validStops[idx]).toFixed(1)} km</p>` : ''}
                    <p style="margin:4px 0; border-top:1px solid #eee; padding-top:4px;"><strong>📊 Cumulative distance:</strong> ${cumulativeDistance.toFixed(1)} km from start</p>
                </div>
            `).addTo(map);
            let label = '';
            let labelColor = '';
            if (idx === 0) { label = '🚀 START'; labelColor = '#28a745'; }
            else if (idx === validStops.length - 1) { label = '🏁 END'; labelColor = '#dc3545'; }
            else { label = `${idx + 1}`; labelColor = '#007bff'; }
            marker.bindTooltip(`<div style="background:${labelColor}; color:white; padding:4px 10px; border-radius:20px; font-size:12px; font-weight:bold;">${label}</div>`,
                { permanent: false, direction: 'top', offset: [0, -15] });
            markersRef.current.push(marker);
            bounds.extend([stop.lat, stop.lng]);
        });
        map.fitBounds(bounds, { padding: [80, 80] });
    }, [stops, selectedRoute, isOptimized]);

    const fetchRouteData = useCallback(async (routeId) => {
        const token = localStorage.getItem("token");
        try {
            const [weatherRes, trafficRes, riskRes] = await Promise.all([
                fetch(`/route/weather/${routeId}`, { headers: { "Authorization": `Bearer ${token}` } }),
                fetch(`/route/traffic/${routeId}`, { headers: { "Authorization": `Bearer ${token}` } }),
                fetch(`/route/combined_risk/${routeId}`, { headers: { "Authorization": `Bearer ${token}` } })
            ]);
            const weather = await weatherRes.json();
            const traffic = await trafficRes.json();
            const risk = await riskRes.json();
            setWeatherData(Array.isArray(weather) ? weather : []);
            setTrafficData(traffic.data || []);
            setCombinedRisk(risk);
        } catch (err) {
            console.error("Error fetching route data:", err);
        }
    }, []);

    const loadStops = useCallback((routeId, assignment) => {
        if (selectedRoute === routeId) {
            setSelectedRoute(null);
            setSelectedAssignment(null);
            setStops([]);
            setWeatherData([]);
            setTrafficData([]);
            setCombinedRisk(null);
            setExpandedAssignment(null);
            setIsOptimized(false);
            return;
        }
        const token = localStorage.getItem("token");
        setSelectedRoute(routeId);
        setSelectedAssignment(assignment);
        setStops([]);
        setIsOptimized(false);
        fetch(`/route/${routeId}/stops`, { headers: { "Authorization": `Bearer ${token}` } })
            .then(res => res.json())
            .then(data => {
                const sortedStops = Array.isArray(data) ? [...data].sort((a, b) => (a.sequence || 0) - (b.sequence || 0)) : [];
                setStops(sortedStops);
                fetchRouteData(routeId);
            })
            .catch(err => {
                console.error("Error loading stops:", err);
                alert(`Failed to load stops: ${err.message}`);
                setStops([]);
                setSelectedRoute(null);
                setSelectedAssignment(null);
            });
    }, [selectedRoute, fetchRouteData]);

    const updateStop = useCallback((routeId, stopSequence, status) => {
        const token = localStorage.getItem("token");
        fetch("/update_stop_status", {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
            body: JSON.stringify({ route_id: routeId, stop_sequence: stopSequence, status: status, notes: notes })
        })
            .then(res => res.json())
            .then(data => {
                alert(data.message);
                if (data.message && !data.message.toLowerCase().includes("error")) {
                    setStops(prevStops => prevStops.map(s => {
                        const seq = s.sequence || s.sequence_order;
                        return seq === stopSequence ? { ...s, scan_status: status } : s;
                    }));
                    fetchRouteData(routeId);
                    setShowNotesModal(false);
                    setNotes("");
                }
            })
            .catch(err => alert(`Failed to update stop: ${err.message}`));
    }, [fetchRouteData, notes]);

    const optimizeRoute = async () => {
        const token = localStorage.getItem("token");
        try {
            const response = await fetch(`/route/optimize/${selectedRoute}`, {
                method: "POST",
                headers: { "Authorization": `Bearer ${token}` }
            });
            const data = await response.json();
            alert(data.message);
            setIsOptimized(true);
            if (polylineRef.current && mapInstanceRef.current) {
                mapInstanceRef.current.removeLayer(polylineRef.current);
                polylineRef.current = null;
            }
            distanceLabelsRef.current.forEach(label => label.remove());
            distanceLabelsRef.current = [];
            loadStops(selectedRoute, selectedAssignment);
        } catch (err) {
            alert("Failed to optimize route");
        }
    };

    const handleStopAction = useCallback(() => {
        if (!selectedStop || !selectedAction) return;

        const token = localStorage.getItem("token");
        fetch("/update_stop_status", {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
            body: JSON.stringify({
                route_id: selectedRoute,
                stop_sequence: selectedStop.sequence || selectedStop.sequence_order,
                status: selectedAction,
                notes: notes
            })
        })
            .then(res => res.json())
            .then(data => {
                alert(data.message);
                if (data.message && !data.message.toLowerCase().includes("error")) {
                    setStops(prevStops => prevStops.map(s => {
                        const seq = s.sequence || s.sequence_order;
                        return seq === (selectedStop.sequence || selectedStop.sequence_order)
                            ? { ...s, scan_status: selectedAction }
                            : s;
                    }));
                    fetchRouteData(selectedRoute);
                    setShowActionModal(false);
                    setSelectedStop(null);
                    setSelectedAction(null);
                    setNotes("");
                }
            })
            .catch(err => alert(`Failed to update stop: ${err.message}`));
    }, [selectedRoute, selectedStop, selectedAction, notes, fetchRouteData]);

    const handleLogout = () => {
        localStorage.removeItem("token");
        localStorage.removeItem("driver_id");
        localStorage.removeItem("driver_name");
        navigate("/login");
    };

    const getRiskColor = (risk) => {
        if (risk < 0.3) return "#28a745";
        if (risk < 0.6) return "#ffc107";
        return "#dc3545";
    };

    const toggleAssignment = (assignmentId) => {
        setExpandedAssignment(expandedAssignment === assignmentId ? null : assignmentId);
    };

    if (loading) return <div style={styles.loading}>Loading assignments...</div>;
    if (error) return <div style={styles.error}>Error: {error}<button onClick={() => window.location.reload()}>Retry</button></div>;

    const currentRouteDistance = stops.length > 1 ? calculateTotalDistance(stops.filter(s => s.lat && s.lng)) : 0;

    return (
        <div style={styles.container}>
            <div style={styles.card}>
                <div style={styles.header}>
                    <div>
                        <h1 style={styles.title}>🚛 Driver Dashboard</h1>
                        {driverId && <p style={styles.subtitle}>Driver ID: {driverId} {driverName && `| ${driverName}`}</p>}
                    </div>
                    <button onClick={handleLogout} style={styles.logoutBtn}>🚪 Logout</button>
                </div>

                <div style={styles.section}>
                    <h2 style={styles.sectionTitle}>📋 Your Assignments</h2>
                    {assignments.length === 0 ? (
                        <p style={styles.emptyState}>No assignments found for this driver.</p>
                    ) : (
                        <div style={styles.assignmentsGrid}>
                            {assignments.map(a => {
                                const isExpanded = expandedAssignment === a.assignment_id;
                                const progress = a.completed_stops || 0;
                                const total = a.total_stops || 1;
                                const percent = (progress / total) * 100;
                                return (
                                    <div key={a.assignment_id} style={styles.assignmentCard}>
                                        <div style={styles.assignmentHeader} onClick={() => toggleAssignment(a.assignment_id)}>
                                            <div>
                                                <span style={styles.assignmentBadge}>Assignment #{a.assignment_id}</span>
                                                <span style={styles.routeBadge}>Route {a.route_id}</span>
                                            </div>
                                            <span style={styles.toggleIcon}>{isExpanded ? "▲" : "▼"}</span>
                                        </div>
                                        {isExpanded && (
                                            <div style={styles.assignmentDetails}>
                                                <div style={styles.infoRow}>
                                                    <div><strong>🚗 Vehicle:</strong> {a.vehicle_type || 'Not assigned'}</div>
                                                    <div><strong>🔢 License Plate:</strong> {a.license_plate || 'N/A'}</div>
                                                    <div><strong>⏱️ Estimated ETA:</strong> {
                                                        a.estimated_eta_minutes ? (
                                                            a.estimated_eta_minutes >= 60 ?
                                                                `${a.estimated_eta_hours} hours (${a.estimated_eta_minutes} min)` :
                                                                `${a.estimated_eta_minutes} minutes`
                                                        ) : 'Calculating...'
                                                    }</div>
                                                </div>
                                                <div style={styles.progressSection}>
                                                    <div style={styles.progressLabel}>Route Progress</div>
                                                    <div style={styles.progressBar}>
                                                        <div style={{ ...styles.progressFill, width: `${percent}%` }} />
                                                    </div>
                                                    <div style={styles.progressStats}>
                                                        <span>✅ {progress} of {total} stops completed</span>
                                                        <span>📊 {percent.toFixed(0)}%</span>
                                                    </div>
                                                </div>
                                                <button onClick={() => loadStops(a.route_id, a)} style={styles.viewRouteBtn}>
                                                    {selectedRoute === a.route_id ? "Hide Route" : "View Route"}
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {selectedRoute && (
                    <div style={styles.activeRouteSection}>
                        <div style={styles.activeRouteHeader}>
                            <h2 style={styles.sectionTitle}>🗺️ Active Route - Route {selectedRoute}</h2>
                            <button onClick={optimizeRoute} style={styles.optimizeBtn}>🔄 Optimize Route</button>
                            <button onClick={saveConditions} style={styles.saveBtn}>💾 Save Conditions</button>
                        </div>

                        {stops.length > 1 && (
                            <div style={styles.summaryCard}>
                                <span>📐 Calculated Route Distance: <strong>{currentRouteDistance.toFixed(1)} km</strong></span>
                            </div>
                        )}

                        {combinedRisk && (
                            <div style={{ ...styles.riskCard, backgroundColor: getRiskColor(combinedRisk.combined_risk) }}>
                                <div style={styles.riskHeader}>
                                    <span>🎯 Overall Route Risk</span>
                                    <span style={styles.riskValue}>{(combinedRisk.combined_risk * 100).toFixed(0)}%</span>
                                </div>
                                <div style={styles.riskDetails}>
                                    <span>🌤️ Weather: {(combinedRisk.weather_risk * 100).toFixed(0)}%</span>
                                    <span>🚗 Traffic: {(combinedRisk.traffic_risk * 100).toFixed(0)}%</span>
                                </div>
                            </div>
                        )}

                        {weatherData.length > 0 && (
                            <div style={styles.infoCard}>
                                <h3 style={styles.infoCardTitle}>🌤️ Weather Conditions</h3>
                                <div style={styles.horizontalScroll}>
                                    {weatherData.map((w, idx) => (
                                        <div key={idx} style={styles.weatherCard}>
                                            <div style={styles.weatherStop}>{w.stop_name}</div>
                                            <div style={styles.weatherTemp}>{w.temperature}°C</div>
                                            <div>{w.weather_status}</div>
                                            <div style={styles.weatherDetails}>💨 {w.wind_speed} m/s | 💧 {w.humidity}%</div>
                                            <div style={{ ...styles.riskBadge, backgroundColor: getRiskColor(w.risk_score) }}>
                                                Risk: {(w.risk_score * 100).toFixed(0)}%
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {trafficData.length > 0 && (
                            <div style={styles.infoCard}>
                                <h3 style={styles.infoCardTitle}>🚗 Traffic Conditions</h3>
                                <div style={styles.horizontalScroll}>
                                    {trafficData.map((t, idx) => (
                                        <div key={idx} style={{ ...styles.trafficCard, borderLeftColor: t.congestion_level >= 70 ? "#dc3545" : t.congestion_level >= 40 ? "#ffc107" : "#28a745" }}>
                                            <div style={styles.trafficStop}>{t.stop_name}</div>
                                            <div>{t.traffic_status} - {t.congestion_level}%</div>
                                            <div style={styles.trafficDelay}>⏰ Delay: +{t.estimated_delay_minutes} min</div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        <div ref={mapRef} style={styles.map} />

                        <h3 style={styles.stopsTitle}>📋 Route Stops</h3>
                        <div style={styles.stopsList}>
                            {stops.map((s, idx) => {
                                const sequence = s.sequence || s.sequence_order;
                                const prevStop = idx > 0 ? stops[idx - 1] : null;
                                const segmentDistance = prevStop && prevStop.lat && prevStop.lng && s.lat && s.lng ? calculateDistance(prevStop, s).toFixed(1) : null;
                                let cumulativeDistance = 0;
                                for (let i = 1; i <= idx; i++) {
                                    if (stops[i - 1].lat && stops[i - 1].lng && stops[i].lat && stops[i].lng) {
                                        cumulativeDistance += calculateDistance(stops[i - 1], stops[i]);
                                    }
                                }
                                return (
                                    <div key={sequence} style={{
                                        ...styles.stopCard,
                                        backgroundColor: s.scan_status === "COMPLETED" ? "#d4edda" : s.scan_status === "ARRIVED" ? "#fff3cd" : "white",
                                        borderLeftColor: s.scan_status === "COMPLETED" ? "#28a745" : s.scan_status === "ARRIVED" ? "#ffc107" : "#007bff"
                                    }}>
                                        <div style={styles.stopHeader}>
                                            <div>
                                                <span style={styles.stopNumber}>Stop {idx + 1}</span>
                                                <span style={styles.stopName}>{s.name}</span>
                                                {segmentDistance && <span style={styles.stopDistance}>📏 +{segmentDistance} km</span>}
                                                {idx > 0 && cumulativeDistance > 0 && <span style={styles.stopCumulative}>(累计: {cumulativeDistance.toFixed(1)} km)</span>}
                                            </div>
                                            <span style={{
                                                ...styles.statusBadge,
                                                backgroundColor: s.scan_status === "COMPLETED" ? "#28a745" : s.scan_status === "ARRIVED" ? "#ffc107" : "#6c757d"
                                            }}>
                                                {s.scan_status || 'Pending'}
                                            </span>
                                        </div>
                                        <p style={styles.stopLocation}>📍 {s.location || 'No location'}</p>
                                        {s.notes && (
                                            <div style={styles.notesDisplay}>
                                                <span>📝 </span>
                                                <span>{s.notes}</span>
                                            </div>
                                        )}


                                        <div style={styles.stopActions}>
                                            <button
                                                onClick={() => {
                                                    setSelectedStop(s);
                                                    setSelectedAction("ARRIVED");
                                                    setNotes("");
                                                    setShowActionModal(true);
                                                }}
                                                disabled={s.scan_status === "COMPLETED"}
                                                style={styles.arrivedBtn}
                                            >
                                                🚚 Arrived
                                            </button>
                                            <button
                                                onClick={() => {
                                                    setSelectedStop(s);
                                                    setSelectedAction("COMPLETED");
                                                    setNotes("");
                                                    setShowActionModal(true);
                                                }}
                                                disabled={s.scan_status === "COMPLETED"}
                                                style={styles.completeBtn}
                                            >
                                                ✅ Completed
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        {stops.length > 1 && (
                            <div style={styles.summaryFooter}>
                                <strong>📊 Route Summary:</strong> {stops.length} stops | Total distance: {currentRouteDistance.toFixed(1)} km | Completed: {stops.filter(s => s.scan_status === "COMPLETED").length}/{stops.length}
                            </div>
                        )}
                    </div>
                )}
            </div>

            {showActionModal && selectedStop && (
                <div style={styles.modalOverlay}>
                    <div style={styles.modalContent}>
                        <h3>
                            {selectedAction === "ARRIVED" ? "🚚 Mark Arrived" : "✅ Mark Completed"} - {selectedStop.name}
                        </h3>
                        <p style={{ marginBottom: "15px", color: "#666" }}>
                            {selectedAction === "ARRIVED"
                                ? "Confirm arrival at this stop. You can add notes below:"
                                : "Confirm completion of delivery. You can add notes below:"}
                        </p>
                        <textarea
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            placeholder="Add delivery notes, issues, or special instructions..."
                            rows={4}
                            style={styles.textarea}
                        />
                        <div style={styles.modalButtons}>
                            <button onClick={() => { setShowActionModal(false); setSelectedStop(null); setSelectedAction(null); setNotes(""); }} style={styles.cancelModalBtn}>
                                Cancel
                            </button>
                            <button onClick={handleStopAction} style={styles.saveModalBtn}>
                                Confirm {selectedAction === "ARRIVED" ? "Arrival" : "Completion"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
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
    title: { margin: 0, fontSize: "28px", color: "#2c3e50" },
    subtitle: { margin: "5px 0 0", color: "#7f8c8d" },
    logoutBtn: { padding: "8px 16px", backgroundColor: "#dc3545", color: "white", border: "none", borderRadius: "8px", cursor: "pointer", fontSize: "14px" },
    section: { marginBottom: "30px" },
    sectionTitle: { fontSize: "20px", color: "#2c3e50", marginBottom: "20px", paddingBottom: "10px", borderBottom: "2px solid #e0e4e8" },
    emptyState: { textAlign: "center", padding: "40px", color: "#7f8c8d" },
    assignmentsGrid: { display: "flex", flexDirection: "column", gap: "15px" },
    assignmentCard: { border: "1px solid #e0e4e8", borderRadius: "12px", overflow: "hidden", backgroundColor: "white" },
    assignmentHeader: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "15px 20px", backgroundColor: "#f8f9fa", cursor: "pointer" },
    assignmentBadge: { backgroundColor: "#007bff", color: "white", padding: "4px 12px", borderRadius: "20px", fontSize: "12px", fontWeight: "600", marginRight: "10px" },
    routeBadge: { backgroundColor: "#6c757d", color: "white", padding: "4px 12px", borderRadius: "20px", fontSize: "12px", fontWeight: "600" },
    toggleIcon: { fontSize: "12px", color: "#666" },
    assignmentDetails: { padding: "20px", borderTop: "1px solid #e0e4e8" },
    infoRow: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "15px", marginBottom: "15px", fontSize: "14px" },
    progressSection: { marginBottom: "15px" },
    progressLabel: { fontSize: "12px", color: "#666", marginBottom: "5px" },
    progressBar: { backgroundColor: "#e0e4e8", borderRadius: "10px", height: "8px", overflow: "hidden" },
    progressFill: { backgroundColor: "#28a745", height: "100%", borderRadius: "10px", transition: "width 0.3s" },
    progressStats: { display: "flex", justifyContent: "space-between", marginTop: "5px", fontSize: "11px", color: "#666" },
    viewRouteBtn: { width: "100%", padding: "10px", backgroundColor: "#007bff", color: "white", border: "none", borderRadius: "8px", cursor: "pointer", fontSize: "14px", fontWeight: "600" },
    activeRouteSection: { marginTop: "30px", paddingTop: "20px", borderTop: "2px solid #e0e4e8" },
    activeRouteHeader: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px", flexWrap: "wrap", gap: "15px" },
    optimizeBtn: { padding: "8px 16px", backgroundColor: "#28a745", color: "white", border: "none", borderRadius: "6px", cursor: "pointer", fontSize: "13px" },
    summaryCard: { backgroundColor: "#e8f5e9", padding: "12px", borderRadius: "8px", marginBottom: "15px", textAlign: "center", border: "1px solid #4caf50" },
    riskCard: { padding: "12px", borderRadius: "10px", marginBottom: "15px", color: "white" },
    riskHeader: { display: "flex", justifyContent: "space-between", alignItems: "center" },
    riskValue: { fontSize: "20px", fontWeight: "bold" },
    riskDetails: { display: "flex", gap: "20px", marginTop: "8px", fontSize: "13px" },
    infoCard: { backgroundColor: "#f8f9fa", borderRadius: "12px", padding: "15px", marginBottom: "20px" },
    infoCardTitle: { margin: "0 0 10px 0", fontSize: "16px", color: "#2c3e50" },
    horizontalScroll: { display: "flex", gap: "15px", overflowX: "auto", paddingBottom: "5px" },
    weatherCard: { minWidth: "180px", backgroundColor: "white", padding: "12px", borderRadius: "8px", textAlign: "center", border: "1px solid #e0e4e8" },
    weatherStop: { fontWeight: "bold", marginBottom: "5px" },
    weatherTemp: { fontSize: "24px", fontWeight: "bold", margin: "5px 0" },
    weatherDetails: { fontSize: "11px", color: "#666", marginTop: "5px" },
    riskBadge: { marginTop: "5px", padding: "2px 6px", borderRadius: "12px", fontSize: "10px", fontWeight: "bold", color: "white", display: "inline-block" },
    trafficCard: { minWidth: "180px", backgroundColor: "white", padding: "12px", borderRadius: "8px", borderLeft: "4px solid", border: "1px solid #e0e4e8", borderLeftWidth: "4px" },
    trafficStop: { fontWeight: "bold", marginBottom: "5px" },
    trafficDelay: { fontSize: "11px", color: "#666", marginTop: "3px" },
    map: { width: "100%", height: "400px", marginBottom: "20px", border: "2px solid #ddd", borderRadius: "8px" },
    stopsTitle: { margin: "0 0 15px 0", fontSize: "18px", color: "#2c3e50" },
    stopsList: { display: "flex", flexDirection: "column", gap: "10px" },
    stopCard: { border: "1px solid #ddd", padding: "15px", borderRadius: "8px", borderLeftWidth: "4px", borderLeftStyle: "solid" },
    stopHeader: { display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px", marginBottom: "8px" },
    stopNumber: { fontWeight: "bold", fontSize: "15px" },
    stopName: { marginLeft: "10px", fontSize: "14px" },
    stopDistance: { marginLeft: "10px", fontSize: "12px", color: "#666" },
    stopCumulative: { marginLeft: "10px", fontSize: "11px", color: "#2196f3" },
    stopLocation: { margin: "8px 0", fontSize: "13px", color: "#666" },
    stopActions: { display: "flex", gap: "10px", marginTop: "10px" },
    statusBadge: { padding: "4px 12px", borderRadius: "20px", fontSize: "12px", fontWeight: "600", color: "white" },
    notesBtn: { padding: "6px 12px", backgroundColor: "#17a2b8", color: "white", border: "none", borderRadius: "6px", cursor: "pointer", fontSize: "12px" },
    arrivedBtn: { padding: "6px 12px", backgroundColor: "#ffc107", border: "none", borderRadius: "6px", cursor: "pointer", fontSize: "12px" },
    completeBtn: { padding: "6px 12px", backgroundColor: "#28a745", color: "white", border: "none", borderRadius: "6px", cursor: "pointer", fontSize: "12px" },
    summaryFooter: { marginTop: "20px", padding: "15px", backgroundColor: "#e7f3ff", borderRadius: "8px", textAlign: "center" },
    modalOverlay: { position: "fixed", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 },
    modalContent: { backgroundColor: "white", padding: "25px", borderRadius: "12px", width: "450px", maxWidth: "90%" },
    textarea: { width: "100%", padding: "10px", margin: "10px 0", border: "1px solid #ddd", borderRadius: "5px", fontFamily: "inherit", resize: "vertical" },
    modalButtons: { display: "flex", gap: "10px", justifyContent: "flex-end" },
    cancelModalBtn: { padding: "8px 16px", backgroundColor: "#6c757d", color: "white", border: "none", borderRadius: "5px", cursor: "pointer" },
    saveModalBtn: { padding: "8px 16px", backgroundColor: "#007bff", color: "white", border: "none", borderRadius: "5px", cursor: "pointer" },
    loading: { padding: "20px", textAlign: "center" },
    error: { padding: "20px", color: "red", textAlign: "center" },
    notesDisplay: {
        marginTop: "8px",
        padding: "8px",
        backgroundColor: "#fef3c7",
        borderRadius: "6px",
        fontSize: "12px",
        color: "#92400e",
        border: "1px solid #fde68a"
    },

    saveBtn: {
        padding: "8px 16px",
        backgroundColor: "#6c757d",
        color: "white",
        border: "none",
        borderRadius: "6px",
        cursor: "pointer",
        fontSize: "13px",
        marginLeft: "10px"
    },
}; 
// AdminPage.js
import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";

export default function AdminPage() {
    const [activeTab, setActiveTab] = useState("routes");
    const [routes, setRoutes] = useState([]);
    const [stops, setStops] = useState([]);
    const [vehicles, setVehicles] = useState([]);
    const [assignments, setAssignments] = useState([]);
    const [orderUpdates, setOrderUpdates] = useState([]);
    const [conditionReports, setConditionReports] = useState([]);
    const [adminOverrides, setAdminOverrides] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [selectedRoute, setSelectedRoute] = useState(null);
    const [showStopModal, setShowStopModal] = useState(false);
    const [showVehicleModal, setShowVehicleModal] = useState(false);
    const [showOverrideModal, setShowOverrideModal] = useState(false);
    const [editingStop, setEditingStop] = useState(null);
    const [editingVehicle, setEditingVehicle] = useState(null);
    const [selectedDelivery, setSelectedDelivery] = useState(null);
    const [adminId, setAdminId] = useState(null);
    const [adminName, setAdminName] = useState("");
    const navigate = useNavigate();
    const [orders, setOrders] = useState([]);
    const [availableDrivers, setAvailableDrivers] = useState([]);
    const [availableVehiclesList, setAvailableVehiclesList] = useState([]);
    const [drivers, setDrivers] = useState([]);
    const [showDriverModal, setShowDriverModal] = useState(false);
    const [editingDriver, setEditingDriver] = useState(null);
    const [driverSort, setDriverSort] = useState({ field: "driver_id", order: "DESC" });
    const [vehicleSort, setVehicleSort] = useState({ field: "vehicle_id", order: "DESC" });

    const [aiCopilotMessage, setAiCopilotMessage] = useState("");
    const [aiCopilotAnswer, setAiCopilotAnswer] = useState("");
    const [aiCopilotLoading, setAiCopilotLoading] = useState(false);
    const [aiCopilotIntent, setAiCopilotIntent] = useState("");
    const [aiCopilotRaw, setAiCopilotRaw] = useState(null);
    const [aiCopilotErr, setAiCopilotErr] = useState("");
    const [chatInput, setChatInput] = useState("");
    const [chatBusy, setChatBusy] = useState(false);
    const [chatErr, setChatErr] = useState("");
    const [chatMessages, setChatMessages] = useState([
        {
            role: "assistant",
            text: "I’m your Operations AI chatbot. Ask about today’s delivery capacity, control-tower risks, or auto-routing for an order ID."
        }
    ]);
    const [aiInsightsDays, setAiInsightsDays] = useState(7);
    const [aiInsightsLoading, setAiInsightsLoading] = useState(false);
    const [aiInsightsSummary, setAiInsightsSummary] = useState("");
    const [aiInsightsSnapshot, setAiInsightsSnapshot] = useState(null);
    const [aiInsightsErr, setAiInsightsErr] = useState("");
    const [recommendOrderId, setRecommendOrderId] = useState("");
    const [recommendBusy, setRecommendBusy] = useState(false);
    const [recommendErr, setRecommendErr] = useState("");
    const [recommendReasoning, setRecommendReasoning] = useState("");
    const [recommendPayload, setRecommendPayload] = useState(null);

    const [notifDraftOrderId, setNotifDraftOrderId] = useState("");
    const [notifDraftChannel, setNotifDraftChannel] = useState("email");
    const [notifDraftSubject, setNotifDraftSubject] = useState("");
    const [notifDraftBody, setNotifDraftBody] = useState("");
    const [notifDraftBusy, setNotifDraftBusy] = useState(false);
    const [supportParticipantType, setSupportParticipantType] = useState("customer");
    const [supportParticipantId, setSupportParticipantId] = useState("");
    const [supportChatInput, setSupportChatInput] = useState("");
    const [supportChatBusy, setSupportChatBusy] = useState(false);
    const [supportChatErr, setSupportChatErr] = useState("");
    const [supportThread, setSupportThread] = useState([]);
    const [supportParticipantName, setSupportParticipantName] = useState("");

    const normalizeShowcaseText = (value) => {
        const text = String(value || "");
        return text
            .replace(
                /This is a simulated notification only\.?\s*No real message was sent\.?/gi,
                "This update has been logged to the participant conversation timeline."
            )
            .replace(/\bfake\b/gi, "demo")
            .replace(/\bsimulated\b/gi, "system-generated");
    };

    const forceLogin = (message) => {
        if (message) {
            alert(message);
        }
        localStorage.removeItem("token");
        localStorage.removeItem("admin_id");
        localStorage.removeItem("admin_name");
        navigate("/login");
    };

    const fetchStopsForRoute = async (routeId) => {
        const token = localStorage.getItem("token");
        try {
            const res = await fetch(`/admin/routes/${routeId}/stops`, {
                headers: { "Authorization": `Bearer ${token}` }
            });
            const data = await res.json();
            setStops(Array.isArray(data) ? data : []);
        } catch (err) {
            console.error("Error fetching stops:", err);
            setStops([]);
        }
    };

    const getFilteredAssignments = () => {
        let filtered = [...assignments];

        // Filter by Assignment ID
        if (assignmentFilter.assignmentId) {
            filtered = filtered.filter(a =>
                a.assignment_id.toString().includes(assignmentFilter.assignmentId)
            );
        }

        // Filter by Driver Name
        if (assignmentFilter.driverName) {
            filtered = filtered.filter(a =>
                a.driver_name && a.driver_name.toLowerCase().includes(assignmentFilter.driverName.toLowerCase())
            );
        }

        // Filter by Vehicle Type
        if (assignmentFilter.vehicleType) {
            filtered = filtered.filter(a =>
                a.vehicle_type && a.vehicle_type.toLowerCase().includes(assignmentFilter.vehicleType.toLowerCase())
            );
        }

        // Filter by Route ID
        if (assignmentFilter.routeId) {
            filtered = filtered.filter(a =>
                a.route_id.toString().includes(assignmentFilter.routeId)
            );
        }

        // Filter by Status
        if (assignmentFilter.status) {
            filtered = filtered.filter(a => a.status === assignmentFilter.status);
        }

        // Filter by Start Date
        if (assignmentFilter.startDate) {
            filtered = filtered.filter(a => {
                if (!a.start_time) return false;
                const assignDate = new Date(a.start_time).toISOString().split('T')[0];
                return assignDate >= assignmentFilter.startDate;
            });
        }

        // Filter by End Date
        if (assignmentFilter.endDate) {
            filtered = filtered.filter(a => {
                if (!a.start_time) return false;
                const assignDate = new Date(a.start_time).toISOString().split('T')[0];
                return assignDate <= assignmentFilter.endDate;
            });
        }

        return filtered;
    };

    const [assignmentFilter, setAssignmentFilter] = useState({
        assignmentId: "",
        driverName: "",
        vehicleType: "",
        routeId: "",
        status: "",
        startDate: "",
        endDate: ""
    });

    const sortVehicles = (field) => {
        setVehicleSort(prev => ({
            field: field,
            order: prev.field === field && prev.order === "ASC" ? "DESC" : "ASC"
        }));
    };

    const getFilteredVehicles = () => {
        let filtered = [...vehicles];

        // Filter by Vehicle Type
        if (vehicleFilter.type) {
            filtered = filtered.filter(vehicle =>
                vehicle.type && vehicle.type.toLowerCase().includes(vehicleFilter.type.toLowerCase())
            );
        }

        // Filter by Status
        if (vehicleFilter.status) {
            filtered = filtered.filter(vehicle => vehicle.status === vehicleFilter.status);
        }

        // Filter by Min Weight Capacity
        if (vehicleFilter.minWeight) {
            filtered = filtered.filter(vehicle =>
                vehicle.vmax_weight && vehicle.vmax_weight >= parseFloat(vehicleFilter.minWeight)
            );
        }

        // Filter by Max Weight Capacity
        if (vehicleFilter.maxWeight) {
            filtered = filtered.filter(vehicle =>
                vehicle.vmax_weight && vehicle.vmax_weight <= parseFloat(vehicleFilter.maxWeight)
            );
        }

        // Filter by License Plate
        if (vehicleFilter.licensePlate) {
            filtered = filtered.filter(vehicle =>
                vehicle.license_plate && vehicle.license_plate.toLowerCase().includes(vehicleFilter.licensePlate.toLowerCase())
            );
        }

        return filtered;
    };

    const [vehicleFilter, setVehicleFilter] = useState({
        type: "",
        status: "",
        minWeight: "",
        maxWeight: "",
        licensePlate: ""
    });

    const [ordersFilter, setOrdersFilter] = useState({
        orderId: "",
        status: "",
        type: "",
        minWeight: "",
        maxWeight: "",
        startDate: "",
        endDate: ""
    });

    const getFilteredOrdersList = () => {
        let filtered = [...orders];

        // Filter by Order ID
        if (ordersFilter.orderId) {
            filtered = filtered.filter(order =>
                order.order_id.toString().includes(ordersFilter.orderId)
            );
        }

        // Filter by Status
        if (ordersFilter.status) {
            filtered = filtered.filter(order => order.status === ordersFilter.status);
        }

        // Filter by Type
        if (ordersFilter.type) {
            filtered = filtered.filter(order => order.type === ordersFilter.type);
        }

        // Filter by Min Weight
        if (ordersFilter.minWeight) {
            filtered = filtered.filter(order => order.weight >= parseFloat(ordersFilter.minWeight));
        }

        // Filter by Max Weight
        if (ordersFilter.maxWeight) {
            filtered = filtered.filter(order => order.weight <= parseFloat(ordersFilter.maxWeight));
        }

        // Filter by Start Date
        if (ordersFilter.startDate) {
            filtered = filtered.filter(order => {
                if (!order.created_at) return false;
                const orderDate = new Date(order.created_at).toISOString().split('T')[0];
                return orderDate >= ordersFilter.startDate;
            });
        }

        // Filter by End Date
        if (ordersFilter.endDate) {
            filtered = filtered.filter(order => {
                if (!order.created_at) return false;
                const orderDate = new Date(order.created_at).toISOString().split('T')[0];
                return orderDate <= ordersFilter.endDate;
            });
        }

        return filtered;
    };

    const sortDrivers = (field) => {
        setDriverSort(prev => ({
            field: field,
            order: prev.field === field && prev.order === "ASC" ? "DESC" : "ASC"
        }));
    };

    const [driverForm, setDriverForm] = useState({
        name: "",
        phone: "",
        email: "",
        license_class: "",
        working_hours: 40,
        status: "Pending"
    });

    const getFilteredDrivers = () => {
        let filtered = [...drivers];

        // Filter by name
        if (driverFilter.name) {
            filtered = filtered.filter(driver =>
                driver.name && driver.name.toLowerCase().includes(driverFilter.name.toLowerCase())
            );
        }

        // Filter by status
        if (driverFilter.status) {
            filtered = filtered.filter(driver => driver.status === driverFilter.status);
        }

        // Filter by license class
        if (driverFilter.licenseClass) {
            filtered = filtered.filter(driver => driver.license_class === driverFilter.licenseClass);
        }

        // Sort
        filtered.sort((a, b) => {
            let aVal = a[driverSort.field] || "";
            let bVal = b[driverSort.field] || "";

            if (typeof aVal === 'number') {
                return driverSort.order === "ASC" ? aVal - bVal : bVal - aVal;
            }

            aVal = String(aVal).toLowerCase();
            bVal = String(bVal).toLowerCase();

            if (driverSort.order === "ASC") {
                return aVal.localeCompare(bVal);
            } else {
                return bVal.localeCompare(aVal);
            }
        });

        return filtered;
    };

    const fetchDrivers = async () => {
        const token = localStorage.getItem("token");
        if (!token) {
            forceLogin("Session expired. Please log in again.");
            return;
        }
        try {
            const res = await fetch("/admin/drivers", {
                headers: { "Authorization": `Bearer ${token}` }
            });
            if (res.status === 401 || res.status === 403) {
                forceLogin("Session expired or unauthorized. Please log in as admin again.");
                return;
            }
            if (!res.ok) {
                throw new Error(`HTTP error! status: ${res.status}`);
            }

            const data = await res.json();
            if (Array.isArray(data)) {
                setDrivers(data);
            } else {
                setDrivers([]);
            }
        } catch (err) {
            alert("Failed to fetch drivers: " + err.message);
            setDrivers([]);
        }
    };

    const createDriver = async () => {
        const token = localStorage.getItem("token");
        try {
            const res = await fetch("/admin/drivers", {
                method: "POST",
                headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
                body: JSON.stringify(driverForm)
            });
            const data = await res.json();
            alert(data.message);
            if (!data.error) {
                fetchDrivers();
                setShowDriverModal(false);
                setDriverForm({ name: "", phone: "", email: "", license_class: "", working_hours: 40, status: "Pending" });
                if (data.activation_token) {
                    alert(`Activation Token: ${data.activation_token}\nShare this with the driver to activate their account.`);
                }
            }
        } catch (err) {
            alert("Failed to create driver");
        }
    };

    const updateDriver = async () => {
        const token = localStorage.getItem("token");
        try {
            const res = await fetch(`/admin/drivers/${editingDriver.driver_id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
                body: JSON.stringify(driverForm)
            });
            const data = await res.json();
            alert(data.message);
            if (!data.error) {
                fetchDrivers();
                setShowDriverModal(false);
                setEditingDriver(null);
            }
        } catch (err) {
            alert("Failed to update driver");
        }
    };

    const deleteDriver = async (driverId, hasActiveAssignments) => {
        if (hasActiveAssignments) {
            alert("Cannot delete driver with active assignments");
            return;
        }
        if (!window.confirm("Delete this driver?")) return;
        const token = localStorage.getItem("token");
        try {
            const res = await fetch(`/admin/drivers/${driverId}`, {
                method: "DELETE",
                headers: { "Authorization": `Bearer ${token}` }
            });
            const data = await res.json();
            alert(data.message);
            if (!data.error) fetchDrivers();
        } catch (err) {
            alert("Failed to delete driver");
        }
    };

    const resendToken = async (driverId) => {
        const token = localStorage.getItem("token");
        try {
            const res = await fetch(`/admin/drivers/${driverId}/resend_token`, {
                method: "POST",
                headers: { "Authorization": `Bearer ${token}` }
            });
            const data = await res.json();
            alert(data.message);
            if (data.activation_token) {
                alert(`New Activation Token: ${data.activation_token}`);
            }
        } catch (err) {
            alert("Failed to resend token");
        }
    };

    const fetchAvailableDrivers = async () => {
        const token = localStorage.getItem("token");
        try {
            const res = await fetch("/admin/available_drivers", {
                headers: { "Authorization": `Bearer ${token}` }
            });
            const data = await res.json();
            console.log("Available drivers:", data);
            setAvailableDrivers(Array.isArray(data) ? data : []);
        } catch (err) {
            console.error("Error fetching drivers:", err);
        }
    };

    const fetchAvailableVehicles = async () => {
        const token = localStorage.getItem("token");
        try {
            const res = await fetch("/admin/available_vehicles", {
                headers: { "Authorization": `Bearer ${token}` }
            });
            const data = await res.json();
            console.log("Available vehicles:", data);
            setAvailableVehiclesList(Array.isArray(data) ? data : []);
        } catch (err) {
            console.error("Error fetching vehicles:", err);
        }
    };

    useEffect(() => {
        const token = localStorage.getItem("token");
        if (!token) {
            forceLogin("Session expired. Please log in again.");
            return;
        }
        const adminIdStorage = localStorage.getItem("admin_id");
        const adminNameStorage = localStorage.getItem("admin_name");
        if (adminIdStorage) setAdminId(adminIdStorage);
        if (adminNameStorage) setAdminName(adminNameStorage);

        fetchData();
        fetchOrders();
        fetchDrivers();

        if (activeTab === "assignments") {
            fetchAvailableDrivers();
            fetchAvailableVehicles();

            const refreshVehicles = async () => {
                const token = localStorage.getItem("token");
                try {
                    const res = await fetch("/admin/vehicles", {
                        headers: { "Authorization": `Bearer ${token}` }
                    });
                    const data = await res.json();
                    console.log("Refreshed vehicles:", data);
                    setVehicles(Array.isArray(data) ? data : []);
                } catch (err) {
                    console.error("Error refreshing vehicles:", err);
                }
            };
            refreshVehicles();

        }
    }, [activeTab]);


    // Fetch all orders
    const fetchOrders = async () => {
        const token = localStorage.getItem("token");
        try {
            const res = await fetch("/orders", {
                headers: { "Authorization": `Bearer ${token}` }
            });
            const data = await res.json();
            setOrders(Array.isArray(data) ? data : []);
        } catch (err) {
            console.error("Error fetching orders:", err);
        }
    };

    const [driverFilter, setDriverFilter] = useState({
        name: "",
        status: "",
        licenseClass: ""
    });

    // Filter states
    const [orderFilter, setOrderFilter] = useState({
        status: "",
        minWeight: "",
        maxWeight: "",
        searchId: ""
    });
    const [overrideFilter, setOverrideFilter] = useState({
        type: "",
        searchId: ""
    });
    const [conditionFilter, setConditionFilter] = useState({
        routeId: "",
        weather: "",
        minRisk: "",
        maxRisk: ""
    });

    // Form states
    const [stopForm, setStopForm] = useState({
        name: "",
        location: "",
        facility_type: "",
        sequence_order: 1,
        fmax_weight: "",
        fmax_volume: "",
        operating_hours: "",
        planned_eta: "",
        scan_status: "Pending"
    });

    const [vehicleForm, setVehicleForm] = useState({
        type: "",
        vmax_weight: "",
        vmax_volume: "",
        status: "Available",
        license_plate: ""
    });

    const [assignmentForm, setAssignmentForm] = useState({
        driver_id: "",
        vehicle_id: "",
        route_id: "",
        start_time: ""
    });

    const [overrideForm, setOverrideForm] = useState({
        delivery_id: "",
        override_type: "Status Change",
        reason: "",
        old_value: "",
        new_value: ""
    });

    const fetchData = async () => {
        const token = localStorage.getItem("token");
        if (!token) {
            forceLogin("Session expired. Please log in again.");
            return;
        }
        try {
            if (activeTab === "routes") {
                const res = await fetch("/admin/routes", {
                    headers: { "Authorization": `Bearer ${token}` }
                });
                if (res.status === 401 || res.status === 403) {
                    forceLogin("Session expired or unauthorized. Please log in as admin again.");
                    return;
                }
                const data = await res.json();
                setRoutes(Array.isArray(data) ? data : []);
            } else if (activeTab === "stops" && selectedRoute) {
                const res = await fetch(`/admin/routes/${selectedRoute}/stops`, {
                    headers: { "Authorization": `Bearer ${token}` }
                });
                if (res.status === 401 || res.status === 403) {
                    forceLogin("Session expired or unauthorized. Please log in as admin again.");
                    return;
                }
                const data = await res.json();
                setStops(Array.isArray(data) ? data : []);
            } else if (activeTab === "vehicles") {
                const res = await fetch("/admin/vehicles", {
                    headers: { "Authorization": `Bearer ${token}` }
                });
                if (res.status === 401 || res.status === 403) {
                    forceLogin("Session expired or unauthorized. Please log in as admin again.");
                    return;
                }
                const data = await res.json();
                setVehicles(Array.isArray(data) ? data : []);
            } else if (activeTab === "assignments") {
                const res = await fetch("/admin/assignments", {
                    headers: { "Authorization": `Bearer ${token}` }
                });
                if (res.status === 401 || res.status === 403) {
                    forceLogin("Session expired or unauthorized. Please log in as admin again.");
                    return;
                }
                const data = await res.json();
                setAssignments(Array.isArray(data) ? data : []);
            } else if (activeTab === "order_updates") {
                const res = await fetch("/admin/order_updates", {
                    headers: { "Authorization": `Bearer ${token}` }
                });
                if (res.status === 401 || res.status === 403) {
                    forceLogin("Session expired or unauthorized. Please log in as admin again.");
                    return;
                }
                const data = await res.json();
                setOrderUpdates(Array.isArray(data) ? data : []);
            } else if (activeTab === "condition_reports") {
                const res = await fetch("/admin/condition_reports", {
                    headers: { "Authorization": `Bearer ${token}` }
                });
                if (res.status === 401 || res.status === 403) {
                    forceLogin("Session expired or unauthorized. Please log in as admin again.");
                    return;
                }
                const data = await res.json();
                setConditionReports(Array.isArray(data) ? data : []);
            } else if (activeTab === "admin_overrides") {
                const res = await fetch("/admin/overrides", {
                    headers: { "Authorization": `Bearer ${token}` }
                });
                if (res.status === 401 || res.status === 403) {
                    forceLogin("Session expired or unauthorized. Please log in as admin again.");
                    return;
                }
                const data = await res.json();
                setAdminOverrides(Array.isArray(data) ? data : []);
            }
        } catch (err) {
            console.error("Error fetching data:", err);
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleLogout = () => {
        forceLogin("");
    };

    // Filter functions
    const getFilteredOrders = () => {
        return orderUpdates.filter(order => {
            if (orderFilter.status && order.new_status !== orderFilter.status) return false;
            return true;
        });
    };

    const getFilteredOverrides = () => {
        return adminOverrides.filter(override => {
            if (overrideFilter.type && override.override_type !== overrideFilter.type) return false;
            if (overrideFilter.searchId && !override.override_id.toString().includes(overrideFilter.searchId)) return false;
            return true;
        });
    };

    const getFilteredConditions = () => {
        return conditionReports.filter(condition => {
            if (conditionFilter.routeId && condition.route_id !== parseInt(conditionFilter.routeId)) return false;
            if (conditionFilter.weather && condition.weather_status !== conditionFilter.weather) return false;
            if (conditionFilter.minRisk && condition.risk_score < parseFloat(conditionFilter.minRisk)) return false;
            if (conditionFilter.maxRisk && condition.risk_score > parseFloat(conditionFilter.maxRisk)) return false;
            return true;
        });
    };

    // Stop CRUD operations
    const createStop = async () => {
        const token = localStorage.getItem("token");
        try {
            const res = await fetch("/admin/stops", {
                method: "POST",
                headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
                body: JSON.stringify({ ...stopForm, route_id: selectedRoute })
            });
            const data = await res.json();
            alert(data.message);
            if (!data.error) {
                fetchData();
                setShowStopModal(false);
                setStopForm({
                    name: "", location: "", facility_type: "", sequence_order: 1,
                    fmax_weight: "", fmax_volume: "", operating_hours: "", planned_eta: "", scan_status: "Pending"
                });
            }
        } catch (err) {
            alert("Failed to create stop");
        }
    };

    const updateStop = async () => {
        const token = localStorage.getItem("token");
        try {
            const res = await fetch(`/admin/stops/${editingStop.stop_id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
                body: JSON.stringify(stopForm)
            });
            const data = await res.json();
            alert(data.message);
            if (!data.error) {
                fetchData();
                setShowStopModal(false);
                setEditingStop(null);
            }
        } catch (err) {
            alert("Failed to update stop");
        }
    };

    const deleteStop = async (stopId) => {
        if (!window.confirm("Delete this stop?")) return;
        const token = localStorage.getItem("token");
        try {
            const res = await fetch(`/admin/stops/${stopId}`, {
                method: "DELETE",
                headers: { "Authorization": `Bearer ${token}` }
            });
            const data = await res.json();
            alert(data.message);
            if (!data.error) fetchData();
        } catch (err) {
            alert("Failed to delete stop");
        }
    };

    // Vehicle CRUD operations
    const createVehicle = async () => {
        const token = localStorage.getItem("token");
        try {
            const res = await fetch("/admin/vehicles", {
                method: "POST",
                headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
                body: JSON.stringify(vehicleForm)
            });
            const data = await res.json();
            alert(data.message);
            if (!data.error) {
                fetchData();
                setShowVehicleModal(false);
                setVehicleForm({ type: "", vmax_weight: "", vmax_volume: "", status: "Available", license_plate: "" });
            }
        } catch (err) {
            alert("Failed to create vehicle");
        }
    };

    const updateVehicle = async () => {
        const token = localStorage.getItem("token");
        try {
            const res = await fetch(`/admin/vehicles/${editingVehicle.vehicle_id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
                body: JSON.stringify(vehicleForm)
            });
            const data = await res.json();
            alert(data.message);
            if (!data.error) {
                fetchData();
                setShowVehicleModal(false);
                setEditingVehicle(null);
            }
        } catch (err) {
            alert("Failed to update vehicle");
        }
    };

    const deleteVehicle = async (vehicleId) => {
        if (!window.confirm("Delete this vehicle?")) return;
        const token = localStorage.getItem("token");
        try {
            const res = await fetch(`/admin/vehicles/${vehicleId}`, {
                method: "DELETE",
                headers: { "Authorization": `Bearer ${token}` }
            });
            const data = await res.json();
            alert(data.message);
            if (!data.error) fetchData();
        } catch (err) {
            alert("Failed to delete vehicle");
        }
    };

    // Assignment operations
    const createAssignment = async () => {
        const token = localStorage.getItem("token");

        // Validate form
        if (!assignmentForm.driver_id) {
            alert("Please select a driver");
            return;
        }
        if (!assignmentForm.vehicle_id) {
            alert("Please select a vehicle");
            return;
        }
        if (!assignmentForm.route_id) {
            alert("Please select a route");
            return;
        }

        // Get order ID for this assignment
        const orderId = prompt("Enter Order ID for this assignment:", "");
        if (!orderId) {
            alert("Order ID is required");
            return;
        }

        try {
            const res = await fetch("/admin/assignments", {
                method: "POST",
                headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
                body: JSON.stringify({
                    driver_id: parseInt(assignmentForm.driver_id),
                    vehicle_id: parseInt(assignmentForm.vehicle_id),
                    route_id: parseInt(assignmentForm.route_id),
                    start_time: assignmentForm.start_time,
                    order_id: parseInt(orderId)
                })
            });
            const data = await res.json();
            alert(data.message);
            if (!data.error) {
                fetchData(); // Refresh the assignments list
                fetchAvailableDrivers(); // Refresh drivers list
                setAssignmentForm({ driver_id: "", vehicle_id: "", route_id: "", start_time: "" });
            }
        } catch (err) {
            alert("Failed to create assignment: " + err.message);
        }
    };

    const completeAssignment = async (assignmentId) => {
        const token = localStorage.getItem("token");
        try {
            const res = await fetch(`/admin/assignments/${assignmentId}/complete`, {
                method: "PUT",
                headers: { "Authorization": `Bearer ${token}` }
            });
            const data = await res.json();
            alert(data.message);
            if (!data.error) fetchData();
        } catch (err) {
            alert("Failed to complete assignment");
        }
    };

    // Admin Override operations
    const createOverride = async () => {
        const token = localStorage.getItem("token");

        // Validate delivery_id is provided
        if (!overrideForm.delivery_id) {
            alert("Please enter a Delivery ID");
            return;
        }

        try {
            const res = await fetch("/admin/overrides", {
                method: "POST",
                headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
                body: JSON.stringify({
                    delivery_id: parseInt(overrideForm.delivery_id),
                    admin_id: parseInt(adminId),
                    override_type: overrideForm.override_type,
                    reason: overrideForm.reason,
                    old_value: overrideForm.old_value,
                    new_value: overrideForm.new_value
                })
            });
            const data = await res.json();

            if (res.ok) {
                alert(data.message);
                fetchData(); // Refresh overrides list
                setShowOverrideModal(false);
                setOverrideForm({
                    delivery_id: "",
                    override_type: "Status Change",
                    reason: "",
                    old_value: "",
                    new_value: ""
                });
            } else {
                alert(data.error || "Failed to create override");
            }
        } catch (err) {
            console.error("Error:", err);
            alert("Failed to create override: " + err.message);
        }
    };

    const statusColor = (status) => {
        switch (status) {
            case 'Pending': return '#ffc107';
            case 'In Progress': return '#17a2b8';
            case 'In Transit': return '#007bff';
            case 'Delivered': return '#28a745';
            case 'Completed': return '#28a745';
            case 'ARRIVED': return '#ffc107';
            case 'COMPLETED': return '#28a745';
            default: return '#6c757d';
        }
    };

    const getRiskColor = (risk) => {
        if (risk < 0.3) return "#28a745";
        if (risk < 0.6) return "#ffc107";
        return "#dc3545";
    };

    // Handle admin override for order status
    const handleStatusOverride = async (orderId, currentStatus) => {
        const newStatus = prompt(
            `Current Status: ${currentStatus}\n\nEnter new status:\n- Pending\n- In Progress\n- In Transit\n- Delivered\n- Completed`,
            "In Transit"
        );

        if (!newStatus) return;

        const validStatuses = ['Pending', 'In Progress', 'In Transit', 'Delivered', 'Completed'];
        if (!validStatuses.includes(newStatus)) {
            alert(`Invalid status. Must be one of: ${validStatuses.join(', ')}`);
            return;
        }

        if (newStatus === currentStatus) {
            alert("New status is the same as current status");
            return;
        }

        const reason = prompt("Reason for override:", "Admin action");
        if (!reason) return;

        const token = localStorage.getItem("token");

        try {
            const res = await fetch("/admin/override_status", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${token}`
                },
                body: JSON.stringify({
                    order_id: parseInt(orderId),
                    new_status: newStatus,
                    admin_id: parseInt(adminId),
                    reason: reason
                })
            });

            const data = await res.json();

            if (res.ok) {
                alert(`✅ ${data.message}`);
                fetchOrders(); // Refresh orders list
                fetchData(); // Refresh overrides list if on that tab
            } else {
                alert(data.error || "Failed to override status");
            }
        } catch (err) {
            console.error("Error:", err);
            alert("Failed to override status");
        }
    };

    const askAdminCopilot = async () => {
        const msg = aiCopilotMessage.trim();
        if (!msg) {
            alert("Enter a question for the ops copilot.");
            return;
        }
        const token = localStorage.getItem("token");
        setAiCopilotLoading(true);
        setAiCopilotErr("");
        setAiCopilotAnswer("");
        setAiCopilotIntent("");
        setAiCopilotRaw(null);
        try {
            const res = await fetch("/api/ai/admin-copilot", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${token}`
                },
                body: JSON.stringify({ message: msg })
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                setAiCopilotErr(data.error || `Request failed (${res.status})`);
                return;
            }
            setAiCopilotAnswer(data.answer || "");
            setAiCopilotIntent(data.intent || "");
            setAiCopilotRaw(data.tool_raw ?? null);
        } catch (e) {
            setAiCopilotErr(String(e.message || e));
        } finally {
            setAiCopilotLoading(false);
        }
    };

    const sendOpsChat = async (promptOverride) => {
        const msg = (promptOverride ?? chatInput).trim();
        if (!msg) return;
        const token = localStorage.getItem("token");
        const userMessage = { role: "user", text: msg };
        const nextHistory = [...chatMessages, userMessage];
        setChatMessages(nextHistory);
        setChatInput("");
        setChatBusy(true);
        setChatErr("");
        try {
            const res = await fetch("/api/ai/ops-chatbot", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${token}`
                },
                body: JSON.stringify({
                    message: msg,
                    history: nextHistory.map(m => ({ role: m.role, content: m.text }))
                })
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                setChatErr(data.error || `Chat failed (${res.status})`);
                setChatMessages(prev => [
                    ...prev,
                    { role: "assistant", text: `I hit an error: ${data.error || `HTTP ${res.status}`}` }
                ]);
                return;
            }
            const answer = data.answer || "(No answer returned)";
            setChatMessages(prev => [
                ...prev,
                {
                    role: "assistant",
                    text: answer,
                    intent: data.intent || "",
                    raw: data.tool_raw ?? null
                }
            ]);
        } catch (e) {
            const m = String(e.message || e);
            setChatErr(m);
            setChatMessages(prev => [...prev, { role: "assistant", text: `I hit an error: ${m}` }]);
        } finally {
            setChatBusy(false);
        }
    };

    const runAdminInsights = async () => {
        const token = localStorage.getItem("token");
        setAiInsightsLoading(true);
        setAiInsightsErr("");
        setAiInsightsSummary("");
        setAiInsightsSnapshot(null);
        try {
            const res = await fetch("/api/ai/admin-insights", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${token}`
                },
                body: JSON.stringify({ days: aiInsightsDays })
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                setAiInsightsErr(data.error || `Insights failed (${res.status})`);
                return;
            }
            setAiInsightsSummary(data.summary || "");
            setAiInsightsSnapshot(data.snapshot || null);
        } catch (e) {
            setAiInsightsErr(String(e.message || e));
        } finally {
            setAiInsightsLoading(false);
        }
    };

    const runAssignmentRecommendation = async () => {
        const token = localStorage.getItem("token");
        const oid = parseInt(recommendOrderId, 10);
        if (Number.isNaN(oid)) {
            alert("Enter a numeric order ID for recommendation.");
            return;
        }
        setRecommendBusy(true);
        setRecommendErr("");
        setRecommendReasoning("");
        setRecommendPayload(null);
        try {
            const res = await fetch("/api/ai/assignment-recommendation", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${token}`
                },
                body: JSON.stringify({ order_id: oid })
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                setRecommendErr(data.error || `Recommendation failed (${res.status})`);
                return;
            }
            if (data.error) {
                setRecommendErr(data.error);
                setRecommendPayload(data);
                return;
            }
            setRecommendReasoning(data.reasoning || "");
            setRecommendPayload(data.recommendation || data);
        } catch (e) {
            setRecommendErr(String(e.message || e));
        } finally {
            setRecommendBusy(false);
        }
    };

    const generateAdminNotificationDraft = async () => {
        const oid = parseInt(notifDraftOrderId, 10);
        if (Number.isNaN(oid)) {
            alert("Enter a numeric order ID.");
            return;
        }
        const token = localStorage.getItem("token");
        setNotifDraftBusy(true);
        setNotifDraftSubject("");
        setNotifDraftBody("");
        try {
            const res = await fetch("/api/ai/notification-draft", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${token}`
                },
                body: JSON.stringify({
                    order_id: oid,
                    channel: notifDraftChannel,
                    tone: "professional concise",
                    template: "status_update_general"
                })
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                alert(data.error || `Draft failed (${res.status})`);
                return;
            }
            setNotifDraftSubject(data.subject || "");
            setNotifDraftBody(data.body || "");
        } catch (e) {
            alert(String(e.message || e));
        } finally {
            setNotifDraftBusy(false);
        }
    };

    const loadSupportThread = async () => {
        const pid = parseInt(supportParticipantId, 10);
        if (Number.isNaN(pid)) {
            alert("Enter a numeric participant ID.");
            return;
        }
        const token = localStorage.getItem("token");
        setSupportChatErr("");
        try {
            const res = await fetch(
                `/api/ai/support/thread?participant_type=${encodeURIComponent(supportParticipantType)}&participant_id=${pid}`,
                {
                    headers: { "Authorization": `Bearer ${token}` }
                }
            );
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                setSupportChatErr(data.error || `Thread fetch failed (${res.status})`);
                return;
            }
            setSupportParticipantName(data.participant_name || "");
            setSupportThread(Array.isArray(data.messages) ? data.messages : []);
        } catch (e) {
            setSupportChatErr(String(e.message || e));
        }
    };

    const fakeSendDraft = async () => {
        const pid = parseInt(supportParticipantId, 10);
        if (Number.isNaN(pid)) {
            alert("Enter a numeric participant ID.");
            return;
        }
        const body = (notifDraftBody || "").trim();
        if (!body) {
            alert("Generate or write a draft message first.");
            return;
        }
        const token = localStorage.getItem("token");
        setSupportChatBusy(true);
        setSupportChatErr("");
        try {
            const payload = {
                participant_type: supportParticipantType,
                participant_id: pid,
                channel: notifDraftChannel,
                subject: notifDraftSubject,
                message: body,
                order_id: notifDraftOrderId ? parseInt(notifDraftOrderId, 10) : null
            };
            const res = await fetch("/api/ai/support/fake-send", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${token}`
                },
                body: JSON.stringify(payload)
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                setSupportChatErr(data.error || `Message dispatch failed (${res.status})`);
                return;
            }
            await loadSupportThread();
        } catch (e) {
            setSupportChatErr(String(e.message || e));
        } finally {
            setSupportChatBusy(false);
        }
    };

    const sendSupportBotMessage = async () => {
        const pid = parseInt(supportParticipantId, 10);
        if (Number.isNaN(pid)) {
            alert("Enter a numeric participant ID.");
            return;
        }
        const msg = supportChatInput.trim();
        if (!msg) return;
        const token = localStorage.getItem("token");
        setSupportChatBusy(true);
        setSupportChatErr("");
        try {
            const res = await fetch("/api/ai/support/chat", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${token}`
                },
                body: JSON.stringify({
                    participant_type: supportParticipantType,
                    participant_id: pid,
                    message: msg
                })
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                setSupportChatErr(data.error || `Support chat failed (${res.status})`);
                return;
            }
            setSupportParticipantName(data.participant_name || supportParticipantName);
            setSupportChatInput("");
            await loadSupportThread();
        } catch (e) {
            setSupportChatErr(String(e.message || e));
        } finally {
            setSupportChatBusy(false);
        }
    };

    if (loading) return <div style={styles.loading}>Loading admin panel...</div>;
    if (error) return <div style={styles.error}>Error: {error}</div>;

    return (
        <div style={styles.container}>
            <div style={styles.header}>
                <div>
                    <h1>🔧 Admin Dashboard</h1>
                    {adminName && <p style={styles.adminInfo}>Welcome, {adminName} (Admin ID: {adminId})</p>}
                </div>
                <button onClick={handleLogout} style={styles.logoutBtn}>🚪 Logout</button>
            </div>

            {/* Tabs */}
            <div style={styles.tabs}>
                <button onClick={() => setActiveTab("orders")} style={{ ...styles.tab, ...(activeTab === "orders" ? styles.activeTab : {}) }}>📦 Orders</button>
                <button onClick={() => setActiveTab("drivers")} style={{ ...styles.tab, ...(activeTab === "drivers" ? styles.activeTab : {}) }}>👨‍✈️ Drivers</button>
                <button onClick={() => setActiveTab("routes")} style={{ ...styles.tab, ...(activeTab === "routes" ? styles.activeTab : {}) }}>🗺️ Routes & Stops</button>
                <button onClick={() => setActiveTab("vehicles")} style={{ ...styles.tab, ...(activeTab === "vehicles" ? styles.activeTab : {}) }}>🚗 Vehicles</button>
                <button onClick={() => setActiveTab("assignments")} style={{ ...styles.tab, ...(activeTab === "assignments" ? styles.activeTab : {}) }}>📦 Assignments</button>
                <button onClick={() => setActiveTab("order_updates")} style={{ ...styles.tab, ...(activeTab === "order_updates" ? styles.activeTab : {}) }}>📝 Order Updates</button>
                <button onClick={() => setActiveTab("condition_reports")} style={{ ...styles.tab, ...(activeTab === "condition_reports" ? styles.activeTab : {}) }}>🌤️ Condition Reports</button>
                <button onClick={() => setActiveTab("admin_overrides")} style={{ ...styles.tab, ...(activeTab === "admin_overrides" ? styles.activeTab : {}) }}>📝 Admin Overrides</button>
                <button onClick={() => setActiveTab("ai_hub")} style={{ ...styles.tab, ...(activeTab === "ai_hub" ? styles.activeTab : {}) }}>🤖 AI Assistant</button>
            </div>

            {/* Orders Tab */}
            {activeTab === "orders" && (
                <div style={styles.section}>
                    <h2>📦 All Orders</h2>

                    {/* Quick Filter Buttons */}
                    <div style={{ display: "flex", gap: "10px", marginBottom: "15px", flexWrap: "wrap" }}>
                        <button onClick={() => setOrdersFilter({ ...ordersFilter, status: "Pending" })} style={styles.quickFilterBtn}>Pending</button>
                        <button onClick={() => setOrdersFilter({ ...ordersFilter, status: "In Progress" })} style={styles.quickFilterBtn}>In Progress</button>
                        <button onClick={() => setOrdersFilter({ ...ordersFilter, status: "In Transit" })} style={styles.quickFilterBtn}>In Transit</button>
                        <button onClick={() => setOrdersFilter({ ...ordersFilter, status: "Delivered" })} style={styles.quickFilterBtn}>Delivered</button>
                        <button onClick={() => setOrdersFilter({ ...ordersFilter, status: "Completed" })} style={styles.quickFilterBtn}>Completed</button>
                        <button onClick={() => setOrdersFilter({ orderId: "", status: "", type: "", minWeight: "", maxWeight: "", startDate: "", endDate: "" })} style={styles.clearBtn}>Show All</button>
                    </div>

                    {/* Filter Section */}
                    <div style={styles.filterSection}>
                        <h3>Filter Orders</h3>
                        <div style={styles.filterRow}>
                            <input
                                type="text"
                                placeholder="Order ID"
                                value={ordersFilter.orderId}
                                onChange={(e) => setOrdersFilter({ ...ordersFilter, orderId: e.target.value })}
                                style={styles.filterInput}
                            />
                            <select
                                value={ordersFilter.status}
                                onChange={(e) => setOrdersFilter({ ...ordersFilter, status: e.target.value })}
                                style={styles.filterInput}
                            >
                                <option value="">All Status</option>
                                <option value="Pending">Pending</option>
                                <option value="In Progress">In Progress</option>
                                <option value="In Transit">In Transit</option>
                                <option value="Delivered">Delivered</option>
                                <option value="Completed">Completed</option>
                            </select>
                            <select
                                value={ordersFilter.type}
                                onChange={(e) => setOrdersFilter({ ...ordersFilter, type: e.target.value })}
                                style={styles.filterInput}
                            >
                                <option value="">All Types</option>
                                <option value="Standard">Standard</option>
                                <option value="Express">Express</option>
                                <option value="Priority">Priority</option>
                            </select>
                            <input
                                type="number"
                                placeholder="Min Weight (kg)"
                                value={ordersFilter.minWeight}
                                onChange={(e) => setOrdersFilter({ ...ordersFilter, minWeight: e.target.value })}
                                style={styles.filterInput}
                            />
                            <input
                                type="number"
                                placeholder="Max Weight (kg)"
                                value={ordersFilter.maxWeight}
                                onChange={(e) => setOrdersFilter({ ...ordersFilter, maxWeight: e.target.value })}
                                style={styles.filterInput}
                            />
                        </div>
                        <div style={styles.filterRow}>
                            <input
                                type="date"
                                placeholder="Start Date"
                                value={ordersFilter.startDate}
                                onChange={(e) => setOrdersFilter({ ...ordersFilter, startDate: e.target.value })}
                                style={styles.filterInput}
                            />
                            <input
                                type="date"
                                placeholder="End Date"
                                value={ordersFilter.endDate}
                                onChange={(e) => setOrdersFilter({ ...ordersFilter, endDate: e.target.value })}
                                style={styles.filterInput}
                            />
                            <button onClick={() => setOrdersFilter({ orderId: "", status: "", type: "", minWeight: "", maxWeight: "", startDate: "", endDate: "" })} style={styles.clearBtn}>
                                Clear Filters
                            </button>
                        </div>
                    </div>

                    {/* Order Count */}
                    <p style={{ padding: "5px 10px", backgroundColor: "#f0f0f0", borderRadius: "5px", marginBottom: "15px" }}>
                        Showing {getFilteredOrdersList().length} of {orders.length} orders
                    </p>

                    <div style={styles.tableWrapper}>
                        <table style={styles.table}>
                            <thead>
                                <tr>
                                    <th>Order ID</th>
                                    <th>Type</th>
                                    <th>Weight (kg)</th>
                                    <th>Dimensions (cm)</th>
                                    <th>Price ($)</th>
                                    <th>Status</th>
                                    <th>Created At</th>
                                    <th>Action</th>
                                </tr>
                            </thead>
                            <tbody>
                                {getFilteredOrdersList().map(order => (
                                    <tr key={order.order_id}>
                                        <td>{order.order_id}</td>
                                        <td>{order.type || 'Standard'}</td>
                                        <td>{order.weight}</td>
                                        <td>{order.length || 0} x {order.width || 0} x {order.height || 0}</td>
                                        <td>${order.price}</td>
                                        <td>
                                            <span style={{
                                                ...styles.statusBadge,
                                                backgroundColor: statusColor(order.status)
                                            }}>
                                                {order.status}
                                            </span>
                                        </td>
                                        <td>
                                            {order.created_at ? new Date(order.created_at).toLocaleDateString() : '-'}
                                        </td>
                                        <td>
                                            <button
                                                onClick={() => handleStatusOverride(order.order_id, order.status)}
                                                style={styles.overrideBtn}
                                            >
                                                ⚡ Override
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                                {getFilteredOrdersList().length === 0 && (
                                    <tr>
                                        <td colSpan="8" style={{ textAlign: "center", padding: "20px" }}>
                                            No orders found matching your filters.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Routes & Stops Tab (Merged) */}
            {activeTab === "routes" && (
                <div style={styles.section}>
                    <h2>🗺️ Routes & Stops Management</h2>

                    {/* Route Selection Section */}
                    <div style={styles.formCard}>
                        <h3>Select Route</h3>
                        <div style={styles.formRow}>
                            <select
                                value={selectedRoute || ""}
                                onChange={(e) => {
                                    setSelectedRoute(parseInt(e.target.value));
                                    // Fetch stops for selected route
                                    if (e.target.value) {
                                        fetchStopsForRoute(parseInt(e.target.value));
                                    }
                                }}
                                style={{ ...styles.select, flex: 1 }}
                            >
                                <option value="">-- Select a Route --</option>
                                {routes.map(r => (
                                    <option key={r.route_id} value={r.route_id}>
                                        Route {r.route_id} - {r.total_distance || 0} km ({r.estimated_time || 0} min)
                                    </option>
                                ))}
                            </select>
                            <button onClick={fetchData} style={styles.smallBtn}>🔄 Refresh</button>
                        </div>
                    </div>

                    {/* Route Details (when route is selected) */}
                    {selectedRoute && (
                        <>
                            {/* Route Info */}
                            <div style={styles.infoCard}>
                                <h3>Route {selectedRoute} Information</h3>
                                <div style={styles.infoGrid}>
                                    <div><strong>Total Distance:</strong> {routes.find(r => r.route_id === selectedRoute)?.total_distance || 'N/A'} km</div>
                                    <div><strong>Estimated Time:</strong> {routes.find(r => r.route_id === selectedRoute)?.estimated_time || 'N/A'} min</div>
                                    <div><strong>Total Stops:</strong> {stops.length}</div>
                                    <div><strong>Completed Stops:</strong> {stops.filter(s => s.scan_status === 'COMPLETED').length}</div>
                                </div>
                            </div>

                            {/* Stops Management */}
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 20, marginBottom: 15 }}>
                                <h3>📍 Route Stops</h3>
                                <button
                                    onClick={() => {
                                        setEditingStop(null);
                                        setStopForm({
                                            name: "",
                                            location: "",
                                            facility_type: "",
                                            sequence_order: stops.length + 1,
                                            fmax_weight: "",
                                            fmax_volume: "",
                                            operating_hours: "",
                                            planned_eta: "",
                                            scan_status: "Pending"
                                        });
                                        setShowStopModal(true);
                                    }}
                                    style={styles.addBtn}
                                >
                                    + Add Stop
                                </button>
                            </div>

                            <div style={styles.tableWrapper}>
                                <table style={styles.table}>
                                    <thead>
                                        <tr>
                                            <th>Seq</th>
                                            <th>Name</th>
                                            <th>Location</th>
                                            <th>Type</th>
                                            <th>Max Weight</th>
                                            <th>Max Volume</th>
                                            <th>Hours</th>
                                            <th>ETA</th>
                                            <th>Status</th>
                                            <th>Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {stops.map(s => (
                                            <tr key={s.stop_id}>
                                                <td>{s.sequence_order}</td>
                                                <td>{s.name}</td>
                                                <td>{s.location}</td>
                                                <td>{s.facility_type || '-'}</td>
                                                <td>{s.fmax_weight ? `${s.fmax_weight} kg` : '-'}</td>
                                                <td>{s.fmax_volume ? `${s.fmax_volume} m³` : '-'}</td>
                                                <td>{s.operating_hours || '-'}</td>
                                                <td>{s.planned_eta ? new Date(s.planned_eta).toLocaleString() : '-'}</td>
                                                <td>
                                                    <span style={{
                                                        ...styles.statusBadge,
                                                        backgroundColor: s.scan_status === "COMPLETED" ? "#28a745" :
                                                            s.scan_status === "ARRIVED" ? "#ffc107" : "#6c757d"
                                                    }}>
                                                        {s.scan_status || 'Pending'}
                                                    </span>
                                                </td>
                                                <td>
                                                    <button onClick={() => { setEditingStop(s); setStopForm(s); setShowStopModal(true); }} style={styles.editBtn}>Edit</button>
                                                    <button onClick={() => deleteStop(s.stop_id)} style={styles.deleteBtn}>Delete</button>
                                                </td>
                                            </tr>
                                        ))}
                                        {stops.length === 0 && (
                                            <tr>
                                                <td colSpan="10" style={{ textAlign: "center", padding: "20px" }}>
                                                    No stops found for this route. Click "Add Stop" to create one.
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </>
                    )}

                    {/* No Route Selected Message */}
                    {!selectedRoute && (
                        <div style={{ textAlign: "center", padding: "40px", color: "#666" }}>
                            <p>👈 Please select a route from the dropdown above to view and manage its stops.</p>
                        </div>
                    )}
                </div>
            )}

            {/* Vehicles Tab */}
            {activeTab === "vehicles" && (
                <div style={styles.section}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
                        <h2>🚗 Vehicle Management</h2>
                        <button onClick={() => { setEditingVehicle(null); setVehicleForm({ type: "", vmax_weight: "", vmax_volume: "", status: "Available", license_plate: "" }); setShowVehicleModal(true); }} style={styles.addBtn}>+ Add Vehicle</button>
                    </div>

                    {/* Quick Filter Buttons */}
                    <div style={{ display: "flex", gap: "10px", marginBottom: "15px", flexWrap: "wrap" }}>
                        <button onClick={() => setVehicleFilter({ ...vehicleFilter, status: "Available" })} style={styles.quickFilterBtn}>Available</button>
                        <button onClick={() => setVehicleFilter({ ...vehicleFilter, status: "In Use" })} style={styles.quickFilterBtn}>In Use</button>
                        <button onClick={() => setVehicleFilter({ ...vehicleFilter, status: "Maintenance" })} style={styles.quickFilterBtn}>Maintenance</button>
                        <button onClick={() => setVehicleFilter({ type: "", status: "", minWeight: "", maxWeight: "", licensePlate: "" })} style={styles.clearBtn}>Show All</button>
                    </div>

                    {/* Filter Section */}
                    <div style={styles.filterSection}>
                        <h3>Filter Vehicles</h3>
                        <div style={styles.filterRow}>
                            <input
                                type="text"
                                placeholder="Vehicle Type (Truck, Van, etc.)"
                                value={vehicleFilter.type}
                                onChange={(e) => setVehicleFilter({ ...vehicleFilter, type: e.target.value })}
                                style={styles.filterInput}
                            />
                            <input
                                type="text"
                                placeholder="License Plate"
                                value={vehicleFilter.licensePlate}
                                onChange={(e) => setVehicleFilter({ ...vehicleFilter, licensePlate: e.target.value })}
                                style={styles.filterInput}
                            />
                            <select
                                value={vehicleFilter.status}
                                onChange={(e) => setVehicleFilter({ ...vehicleFilter, status: e.target.value })}
                                style={styles.filterInput}
                            >
                                <option value="">All Status</option>
                                <option value="Available">Available</option>
                                <option value="In Use">In Use</option>
                                <option value="Maintenance">Maintenance</option>
                            </select>
                        </div>
                        <div style={styles.filterRow}>
                            <input
                                type="number"
                                placeholder="Min Weight Capacity (kg)"
                                value={vehicleFilter.minWeight}
                                onChange={(e) => setVehicleFilter({ ...vehicleFilter, minWeight: e.target.value })}
                                style={styles.filterInput}
                            />
                            <input
                                type="number"
                                placeholder="Max Weight Capacity (kg)"
                                value={vehicleFilter.maxWeight}
                                onChange={(e) => setVehicleFilter({ ...vehicleFilter, maxWeight: e.target.value })}
                                style={styles.filterInput}
                            />
                            <button onClick={() => setVehicleFilter({ type: "", status: "", minWeight: "", maxWeight: "", licensePlate: "" })} style={styles.clearBtn}>
                                Clear Filters
                            </button>
                        </div>
                    </div>

                    {/* Vehicle Count */}
                    <p style={{ padding: "5px 10px", backgroundColor: "#f0f0f0", borderRadius: "5px", marginBottom: "15px" }}>
                        Showing {getFilteredVehicles().length} of {vehicles.length} vehicles
                    </p>

                    <div style={styles.tableWrapper}>
                        <table style={styles.table}>
                            <thead>
                                <tr>
                                    <th>ID</th>
                                    <th>Type</th>
                                    <th>License Plate</th>
                                    <th>Max Weight (kg)</th>
                                    <th>Max Volume (m³)</th>
                                    <th>Status</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {getFilteredVehicles().length > 0 ? getFilteredVehicles().map(v => (
                                    <tr key={v.vehicle_id}>
                                        <td>{v.vehicle_id}</td>
                                        <td>{v.type}</td>
                                        <td>{v.license_plate || 'N/A'}</td>
                                        <td>{v.vmax_weight || '-'}</td>
                                        <td>{v.vmax_volume || '-'}</td>
                                        <td>
                                            <span style={{
                                                ...styles.statusBadge,
                                                backgroundColor: v.status === "Available" ? "#28a745" :
                                                    v.status === "In Use" ? "#ffc107" : "#dc3545"
                                            }}>
                                                {v.status || 'Unknown'}
                                            </span>
                                        </td>
                                        <td>
                                            <button onClick={() => { setEditingVehicle(v); setVehicleForm(v); setShowVehicleModal(true); }} style={styles.editBtn}>Edit</button>
                                            <button onClick={() => deleteVehicle(v.vehicle_id)} style={styles.deleteBtn}>Delete</button>
                                        </td>
                                    </tr>
                                )) : (
                                    <tr>
                                        <td colSpan="7" style={{ textAlign: "center", padding: "20px" }}>
                                            No vehicles found matching your filters.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Drivers Tab */}
            {activeTab === "drivers" && (
                <div style={styles.section}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
                        <h2>👨‍✈️ Driver Management</h2>
                        <div>
                            <button onClick={() => { setEditingDriver(null); setDriverForm({ name: "", phone: "", email: "", license_class: "", working_hours: 40, status: "Pending" }); setShowDriverModal(true); }} style={styles.addBtn}>+ Add Driver</button>
                        </div>
                    </div>

                    {/* Filter Section */}
                    <div style={styles.filterSection}>
                        <h3>Filter Drivers</h3>
                        <div style={styles.filterRow}>
                            <input
                                type="text"
                                placeholder="Search by name..."
                                value={driverFilter.name}
                                onChange={(e) => setDriverFilter({ ...driverFilter, name: e.target.value })}
                                style={styles.filterInput}
                            />
                            <select
                                value={driverFilter.status}
                                onChange={(e) => setDriverFilter({ ...driverFilter, status: e.target.value })}
                                style={styles.filterInput}
                            >
                                <option value="">All Status</option>
                                <option value="Active">Active</option>
                                <option value="Pending">Pending</option>
                                <option value="Available">Available</option>
                                <option value="On Delivery">On Delivery</option>
                                <option value="Offline">Offline</option>
                                <option value="Inactive">Inactive</option>
                            </select>
                            <select
                                value={driverFilter.licenseClass}
                                onChange={(e) => setDriverFilter({ ...driverFilter, licenseClass: e.target.value })}
                                style={styles.filterInput}
                            >
                                <option value="">All License Classes</option>
                                <option value="A">Class A (Truck)</option>
                                <option value="B">Class B (Van)</option>
                                <option value="C">Class C (Car)</option>
                                <option value="B2">B2</option>
                                <option value="C1">C1</option>
                                <option value="C2">C2</option>
                                <option value="B3">B3</option>
                            </select>
                            <button onClick={() => setDriverFilter({ name: "", status: "", licenseClass: "" })} style={styles.clearBtn}>
                                Clear Filters
                            </button>
                        </div>
                    </div>

                    {/* Driver count */}
                    <p style={{ padding: "5px 10px", backgroundColor: "#f0f0f0", borderRadius: "5px", marginBottom: "15px" }}>
                        Showing {getFilteredDrivers().length} of {drivers.length} drivers
                    </p>

                    <div style={styles.tableWrapper}>
                        <table style={styles.table}>
                            <thead>
                                <tr>
                                    <th>ID</th>
                                    <th>Name</th>
                                    <th>Phone</th>
                                    <th>Email</th>
                                    <th>License Class</th>
                                    <th>Hours</th>
                                    <th>Status</th>
                                    <th>Activated</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {getFilteredDrivers().length > 0 ? getFilteredDrivers().map(d => (
                                    <tr key={d.driver_id}>
                                        <td>{d.driver_id}</td>
                                        <td>{d.name}</td>
                                        <td>{d.phone || '-'}</td>
                                        <td>{d.email || '-'}</td>
                                        <td>{d.license_class || '-'}</td>
                                        <td>{d.working_hours || '-'}</td>
                                        <td>
                                            <span style={{
                                                ...styles.statusBadge,
                                                backgroundColor: d.status === 'Active' ? '#28a745' :
                                                    d.status === 'Pending' ? '#ffc107' :
                                                        d.status === 'Available' ? '#17a2b8' :
                                                            d.status === 'On Delivery' ? '#007bff' : '#dc3545'
                                            }}>
                                                {d.status}
                                            </span>
                                        </td>
                                        <td>{d.has_password === 'Yes' ? '✅ Yes' : '❌ No'}</td>
                                        <td>
                                            <button onClick={() => { setEditingDriver(d); setDriverForm(d); setShowDriverModal(true); }} style={styles.editBtn}>Edit</button>
                                            {d.status === 'Pending' && (
                                                <button onClick={() => resendToken(d.driver_id)} style={styles.smallBtn}>Resend Token</button>
                                            )}
                                            <button onClick={() => deleteDriver(d.driver_id, false)} style={styles.deleteBtn}>Delete</button>
                                        </td>
                                    </tr>
                                )) : (
                                    <tr>
                                        <td colSpan="9" style={{ textAlign: "center", padding: "20px" }}>
                                            No drivers found matching your filters.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Assignments Tab */}
            {activeTab === "assignments" && (
                <div style={styles.section}>
                    <h2>📦 Driver Assignments</h2>

                    {/* Create Assignment Form */}
                    <div style={styles.formCard}>
                        <h3>Create New Assignment</h3>
                        <div style={styles.formRow}>
                            <div style={{ display: "flex", alignItems: "center", gap: "10px", flex: 1 }}>
                                <select
                                    value={assignmentForm.driver_id}
                                    onChange={(e) => setAssignmentForm({ ...assignmentForm, driver_id: e.target.value })}
                                    style={{ ...styles.input, marginRight: 0, flex: 1 }}
                                >
                                    <option value="">Select Driver</option>
                                    {availableDrivers.map(d => (
                                        <option key={d.driver_id} value={d.driver_id}>
                                            {d.name} - {d.phone} ({d.status})
                                        </option>
                                    ))}
                                </select>
                                <button onClick={fetchAvailableDrivers} style={styles.smallBtn} title="Refresh drivers">
                                    🔄
                                </button>
                            </div>

                            <select
                                value={assignmentForm.vehicle_id}
                                onChange={(e) => setAssignmentForm({ ...assignmentForm, vehicle_id: e.target.value })}
                                style={styles.input}
                            >
                                <option value="">Select Vehicle</option>
                                {vehicles.filter(v => v.status === 'Available').map(v => (
                                    <option key={v.vehicle_id} value={v.vehicle_id}>
                                        {v.type} - {v.license_plate} (Max: {v.vmax_weight}kg)
                                    </option>
                                ))}
                            </select>

                            <select
                                value={assignmentForm.route_id}
                                onChange={(e) => setAssignmentForm({ ...assignmentForm, route_id: e.target.value })}
                                style={styles.input}
                            >
                                <option value="">Select Route</option>
                                {routes.map(r => (
                                    <option key={r.route_id} value={r.route_id}>
                                        Route {r.route_id} - {r.total_distance || 0} km
                                    </option>
                                ))}
                            </select>

                            <input
                                type="datetime-local"
                                value={assignmentForm.start_time}
                                onChange={(e) => setAssignmentForm({ ...assignmentForm, start_time: e.target.value })}
                                style={styles.input}
                            />

                            <button onClick={createAssignment} style={styles.addBtn}>Create Assignment</button>
                        </div>
                    </div>

                    {/* Quick Filter Buttons */}
                    <div style={{ display: "flex", gap: "10px", marginBottom: "15px", flexWrap: "wrap", marginTop: "20px" }}>
                        <button onClick={() => setAssignmentFilter({ ...assignmentFilter, status: "Assigned" })} style={styles.quickFilterBtn}>Assigned</button>
                        <button onClick={() => setAssignmentFilter({ ...assignmentFilter, status: "In Progress" })} style={styles.quickFilterBtn}>In Progress</button>
                        <button onClick={() => setAssignmentFilter({ ...assignmentFilter, status: "Completed" })} style={styles.quickFilterBtn}>Completed</button>
                        <button onClick={() => setAssignmentFilter({ assignmentId: "", driverName: "", vehicleType: "", routeId: "", status: "", startDate: "", endDate: "" })} style={styles.clearBtn}>Show All</button>
                    </div>

                    {/* Filter Section */}
                    <div style={styles.filterSection}>
                        <h3>Filter Assignments</h3>
                        <div style={styles.filterRow}>
                            <input
                                type="text"
                                placeholder="Assignment ID"
                                value={assignmentFilter.assignmentId}
                                onChange={(e) => setAssignmentFilter({ ...assignmentFilter, assignmentId: e.target.value })}
                                style={styles.filterInput}
                            />
                            <input
                                type="text"
                                placeholder="Driver Name"
                                value={assignmentFilter.driverName}
                                onChange={(e) => setAssignmentFilter({ ...assignmentFilter, driverName: e.target.value })}
                                style={styles.filterInput}
                            />
                            <input
                                type="text"
                                placeholder="Vehicle Type"
                                value={assignmentFilter.vehicleType}
                                onChange={(e) => setAssignmentFilter({ ...assignmentFilter, vehicleType: e.target.value })}
                                style={styles.filterInput}
                            />
                            <input
                                type="text"
                                placeholder="Route ID"
                                value={assignmentFilter.routeId}
                                onChange={(e) => setAssignmentFilter({ ...assignmentFilter, routeId: e.target.value })}
                                style={styles.filterInput}
                            />
                        </div>
                        <div style={styles.filterRow}>
                            <select
                                value={assignmentFilter.status}
                                onChange={(e) => setAssignmentFilter({ ...assignmentFilter, status: e.target.value })}
                                style={styles.filterInput}
                            >
                                <option value="">All Status</option>
                                <option value="Assigned">Assigned</option>
                                <option value="In Progress">In Progress</option>
                                <option value="Completed">Completed</option>
                            </select>
                            <input
                                type="date"
                                placeholder="Start Date"
                                value={assignmentFilter.startDate}
                                onChange={(e) => setAssignmentFilter({ ...assignmentFilter, startDate: e.target.value })}
                                style={styles.filterInput}
                            />
                            <input
                                type="date"
                                placeholder="End Date"
                                value={assignmentFilter.endDate}
                                onChange={(e) => setAssignmentFilter({ ...assignmentFilter, endDate: e.target.value })}
                                style={styles.filterInput}
                            />
                            <button onClick={() => setAssignmentFilter({ assignmentId: "", driverName: "", vehicleType: "", routeId: "", status: "", startDate: "", endDate: "" })} style={styles.clearBtn}>
                                Clear Filters
                            </button>
                        </div>
                    </div>

                    {/* Assignment Count */}
                    <p style={{ padding: "5px 10px", backgroundColor: "#f0f0f0", borderRadius: "5px", marginBottom: "15px" }}>
                        Showing {getFilteredAssignments().length} of {assignments.length} assignments
                    </p>

                    <div style={styles.tableWrapper}>
                        <table style={styles.table}>
                            <thead>
                                <tr>
                                    <th>Assignment ID</th>
                                    <th>Driver ID</th>
                                    <th>Driver Name</th>
                                    <th>Vehicle</th>
                                    <th>Route</th>
                                    <th>Order ID</th>
                                    <th>Start Time</th>
                                    <th>End Time</th>
                                    <th>Status</th>
                                    <th>Action</th>
                                </tr>
                            </thead>
                            <tbody>
                                {getFilteredAssignments().length > 0 ? getFilteredAssignments().map(a => (
                                    <tr key={a.assignment_id}>
                                        <td>{a.assignment_id}</td>
                                        <td>{a.driver_id}</td>
                                        <td>{a.driver_name || '-'}</td>
                                        <td>{a.vehicle_type || `ID: ${a.vehicle_id}`}</td>
                                        <td>{a.route_id}</td>
                                        <td>{a.order_id || '-'}</td>
                                        <tr>{a.start_time ? new Date(a.start_time).toLocaleString() : '-'}</tr>
                                        <td>{a.end_time ? new Date(a.end_time).toLocaleString() : '-'}</td>
                                        <td>
                                            <span style={{
                                                ...styles.statusBadge,
                                                backgroundColor: a.status === "Completed" ? "#28a745" :
                                                    a.status === "In Progress" ? "#ffc107" : "#007bff"
                                            }}>
                                                {a.status || 'Assigned'}
                                            </span>
                                        </td>
                                        <td>
                                            {a.status !== "Completed" && (
                                                <button onClick={() => completeAssignment(a.assignment_id)} style={styles.completeBtn}>
                                                    Complete
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                )) : (
                                    <tr>
                                        <td colSpan="10" style={{ textAlign: "center", padding: "20px" }}>
                                            No assignments found matching your filters.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Order Updates Tab with Filters */}
            {activeTab === "order_updates" && (
                <div style={styles.section}>
                    <h2>📝 Order Update History</h2>

                    {/* Filters */}
                    <div style={styles.filterSection}>
                        <h3>Filter Updates</h3>
                        <div style={styles.filterRow}>
                            <select value={orderFilter.status} onChange={(e) => setOrderFilter({ ...orderFilter, status: e.target.value })} style={styles.filterInput}>
                                <option value="">All Status</option>
                                <option value="Pending">Pending</option>
                                <option value="In Progress">In Progress</option>
                                <option value="In Transit">In Transit</option>
                                <option value="Delivered">Delivered</option>
                                <option value="ARRIVED">Arrived</option>
                                <option value="COMPLETED">Completed</option>
                            </select>
                            <button onClick={() => setOrderFilter({ status: "", minWeight: "", maxWeight: "", searchId: "" })} style={styles.clearBtn}>Clear Filters</button>
                        </div>
                    </div>

                    <div style={styles.tableWrapper}>
                        <table style={styles.table}>
                            <thead>
                                <tr>
                                    <th>Update ID</th>
                                    <th>Order ID</th>
                                    <th>Driver Name</th>
                                    <th>Stop Name</th>
                                    <th>Update Type</th>
                                    <th>Scan Type</th>
                                    <th>Notes</th>
                                    <th>New Status</th>
                                    <th>Updated At</th>
                                </tr>
                            </thead>
                            <tbody>
                                {getFilteredOrders().map(u => (
                                    <tr key={u.update_id}>
                                        <td>{u.update_id}</td>
                                        <td>{u.order_id || 'N/A'}</td>
                                        <td>{u.driver_name || 'N/A'}</td>
                                        <td>{u.stop_name || 'N/A'}</td>
                                        <td>{u.update_type}</td>
                                        <td>{u.scan_type || '-'}</td>
                                        <td style={{ maxWidth: "200px", whiteSpace: "normal", wordWrap: "break-word" }}>{u.notes || '-'}</td>
                                        <td><span style={{ ...styles.statusBadge, backgroundColor: statusColor(u.new_status) }}>{u.new_status}</span></td>
                                        <td>{new Date(u.updated_at).toLocaleString()}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        {getFilteredOrders().length === 0 && (
                            <p style={{ textAlign: "center", padding: "20px", color: "#666" }}>No order updates found.</p>
                        )}
                    </div>
                </div>
            )}

            {/* Condition Reports Tab */}
            {activeTab === "condition_reports" && (
                <div style={styles.section}>
                    <h2>🌤️ Condition Reports</h2>

                    {/* Filters */}
                    <div style={styles.filterSection}>
                        <h3>Filter Reports</h3>
                        <div style={styles.filterRow}>
                            <select value={conditionFilter.routeId} onChange={(e) => setConditionFilter({ ...conditionFilter, routeId: e.target.value })} style={styles.filterInput}>
                                <option value="">All Routes</option>
                                {routes.map(r => <option key={r.route_id} value={r.route_id}>Route {r.route_id}</option>)}
                            </select>
                            <select value={conditionFilter.weather} onChange={(e) => setConditionFilter({ ...conditionFilter, weather: e.target.value })} style={styles.filterInput}>
                                <option value="">All Weather</option>
                                <option value="Sunny">Sunny</option>
                                <option value="Clear">Clear</option>
                                <option value="Cloudy">Cloudy</option>
                                <option value="Rainy">Rainy</option>
                                <option value="Storm">Storm</option>
                                <option value="Foggy">Foggy</option>
                            </select>
                            <input type="number" placeholder="Min Risk Score" value={conditionFilter.minRisk} onChange={(e) => setConditionFilter({ ...conditionFilter, minRisk: e.target.value })} style={styles.filterInput} step="0.1" />
                            <input type="number" placeholder="Max Risk Score" value={conditionFilter.maxRisk} onChange={(e) => setConditionFilter({ ...conditionFilter, maxRisk: e.target.value })} style={styles.filterInput} step="0.1" />
                            <button onClick={() => setConditionFilter({ routeId: "", weather: "", minRisk: "", maxRisk: "" })} style={styles.clearBtn}>Clear Filters</button>
                        </div>
                    </div>

                    <div style={styles.tableWrapper}>
                        <table style={styles.table}>
                            <thead>
                                <tr>
                                    <th>Report ID</th>
                                    <th>Route ID</th>
                                    <th>Region</th>
                                    <th>Weather Status</th>
                                    <th>Road Status</th>
                                    <th>Risk Score</th>
                                    <th>Risk Level</th>
                                    <th>Recorded At</th>
                                </tr>
                            </thead>
                            <tbody>
                                {getFilteredConditions().map(c => (
                                    <tr key={c.report_id}>
                                        <td>{c.report_id}</td>
                                        <td>{c.route_id}</td>
                                        <td>{c.region}</td>
                                        <td>{c.weather_status}</td>
                                        <td>{c.road_status}</td>
                                        <td>{c.risk_score}</td>
                                        <td>
                                            <span style={{ ...styles.riskBadge, backgroundColor: getRiskColor(c.risk_score) }}>
                                                {(c.risk_score * 100).toFixed(0)}%
                                            </span>
                                        </td>
                                        <td>{new Date(c.recorded_at).toLocaleString()}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        {getFilteredConditions().length === 0 && (
                            <p style={{ textAlign: "center", padding: "20px", color: "#666" }}>No condition reports found.</p>
                        )}
                    </div>
                </div>
            )}

            {/* Admin Overrides Tab */}
            {activeTab === "admin_overrides" && (
                <div style={styles.section}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <h2>📝 Admin Override History</h2>
                        <button onClick={() => setShowOverrideModal(true)} style={styles.addBtn}>+ New Override</button>
                    </div>

                    {/* Filters */}
                    <div style={styles.filterSection}>
                        <h3>Filter Overrides</h3>
                        <div style={styles.filterRow}>
                            <select value={overrideFilter.type} onChange={(e) => setOverrideFilter({ ...overrideFilter, type: e.target.value })} style={styles.filterInput}>
                                <option value="">All Types</option>
                                <option value="Status Change">Status Change</option>
                                <option value="Reschedule">Reschedule</option>
                                <option value="Route Change">Route Change</option>
                                <option value="Driver Change">Driver Change</option>
                                <option value="Vehicle Change">Vehicle Change</option>
                            </select>
                            <input type="text" placeholder="Search by Override ID" value={overrideFilter.searchId} onChange={(e) => setOverrideFilter({ ...overrideFilter, searchId: e.target.value })} style={styles.filterInput} />
                            <button onClick={() => setOverrideFilter({ type: "", searchId: "" })} style={styles.clearBtn}>Clear Filters</button>
                        </div>
                    </div>

                    <div style={styles.tableWrapper}>
                        <table style={styles.table}>
                            <thead>
                                <tr>
                                    <th>Override ID</th>
                                    <th>Delivery ID</th>
                                    <th>Admin ID</th>
                                    <th>Type</th>
                                    <th>Reason</th>
                                    <th>Old Value</th>
                                    <th>New Value</th>
                                    <th>Created At</th>
                                </tr>
                            </thead>
                            <tbody>
                                {getFilteredOverrides().map(o => (
                                    <tr key={o.override_id}>
                                        <td>{o.override_id}</td>
                                        <td>{o.delivery_id}</td>
                                        <td>{o.admin_id}</td>
                                        <td>{o.override_type}</td>
                                        <td>{o.reason || '-'}</td>
                                        <td>{o.old_value || '-'}</td>
                                        <td>{o.new_value || '-'}</td>
                                        <td>{new Date(o.created_at).toLocaleString()}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        {getFilteredOverrides().length === 0 && (
                            <p style={{ textAlign: "center", padding: "20px", color: "#666" }}>No admin overrides found.</p>
                        )}
                    </div>
                </div>
            )}

            {activeTab === "ai_hub" && (
                <div style={styles.section}>
                    <h2 style={{ marginTop: 0 }}>💬 Operations chatbot</h2>
                    <p style={{ fontSize: 14, color: "#555", maxWidth: 900 }}>
                        Ask advanced logistics questions in conversation mode: delivery intake capacity, auto shipment routing,
                        risk incidents, and live operational diagnostics.
                    </p>
                    <div style={{ marginBottom: 12 }}>
                        <button type="button" style={styles.addBtn} onClick={() => navigate("/ops-comms")}>
                            Open Ops Communication Center
                        </button>
                    </div>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
                        <button type="button" style={styles.quickFilterBtn} disabled={chatBusy} onClick={() => sendOpsChat("How many deliveries can we accept today given current driver and vehicle availability?")}>
                            Capacity today
                        </button>
                        <button type="button" style={styles.quickFilterBtn} disabled={chatBusy} onClick={() => sendOpsChat("Run a control tower risk overview for the last 7 days.")}>
                            Control tower
                        </button>
                        <button type="button" style={styles.quickFilterBtn} disabled={chatBusy} onClick={() => sendOpsChat("Auto-route and recommend assignment for order 1001.")}>
                            Auto-route order 1001
                        </button>
                    </div>
                    <div style={{ border: "1px solid #d1d5db", borderRadius: 10, backgroundColor: "#f8fafc", padding: 12, maxHeight: 420, overflowY: "auto" }}>
                        {chatMessages.map((m, idx) => (
                            <div
                                key={idx}
                                style={{
                                    marginBottom: 10,
                                    display: "flex",
                                    justifyContent: m.role === "user" ? "flex-end" : "flex-start"
                                }}
                            >
                                <div
                                    style={{
                                        maxWidth: "84%",
                                        whiteSpace: "pre-wrap",
                                        fontSize: 14,
                                        lineHeight: 1.4,
                                        padding: "10px 12px",
                                        borderRadius: 10,
                                        backgroundColor: m.role === "user" ? "#dbeafe" : "#ffffff",
                                        border: "1px solid #cbd5e1"
                                    }}
                                >
                                    <div style={{ fontSize: 11, color: "#64748b", marginBottom: 4 }}>
                                        {m.role === "user" ? "You" : "Ops Bot"}{m.intent ? ` · intent: ${m.intent}` : ""}
                                    </div>
                                    {m.text}
                                    {m.raw ? (
                                        <details style={{ marginTop: 8 }}>
                                            <summary style={{ cursor: "pointer", fontSize: 12, fontWeight: 600 }}>Tool payload</summary>
                                            <pre style={{ fontSize: 11, overflow: "auto", maxHeight: 180, marginTop: 6, backgroundColor: "#0f172a", color: "#e2e8f0", padding: 8, borderRadius: 8 }}>
                                                {JSON.stringify(m.raw, null, 2)}
                                            </pre>
                                        </details>
                                    ) : null}
                                </div>
                            </div>
                        ))}
                    </div>
                    <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                        <textarea
                            rows={3}
                            value={chatInput}
                            onChange={(e) => setChatInput(e.target.value)}
                            placeholder="Example: How many deliveries can we still accept today? / Auto-route order 1012."
                            style={{ ...styles.textarea, width: "100%", marginTop: 0 }}
                            disabled={chatBusy}
                        />
                        <button
                            type="button"
                            style={{ ...styles.overrideBtn, minWidth: 120, alignSelf: "flex-end" }}
                            disabled={chatBusy}
                            onClick={() => sendOpsChat()}
                        >
                            {chatBusy ? "⏳ Sending..." : "Send"}
                        </button>
                    </div>
                    {chatErr ? <p style={{ marginTop: 8, color: "#c0392b" }}>{chatErr}</p> : null}

                    <hr style={{ margin: "28px 0", borderColor: "#e2e8f0" }} />

                    <h2 style={{ marginTop: 0 }}>🤖 Operations copilot</h2>
                    <p style={{ fontSize: 14, color: "#555", maxWidth: 900 }}>
                        Ask plain-language questions. The assistant classifies intent, runs audited database queries only (no arbitrary SQL),
                        then summarizes the results for you.
                    </p>

                    <textarea
                        placeholder="Examples: Which drivers are currently available? / Show pending assignments. / Recent order updates?"
                        rows={5}
                        value={aiCopilotMessage}
                        onChange={(e) => setAiCopilotMessage(e.target.value)}
                        style={{ ...styles.textarea, width: "100%", marginTop: 10 }}
                        disabled={aiCopilotLoading}
                    />
                    <div style={{ marginTop: 10 }}>
                        <button type="button" onClick={askAdminCopilot} disabled={aiCopilotLoading} style={styles.overrideBtn}>
                            {aiCopilotLoading ? "⏳ Working..." : "Run copilot"}
                        </button>
                    </div>

                    {aiCopilotErr && (
                        <p style={{ marginTop: 12, color: "#c0392b" }}>{aiCopilotErr}</p>
                    )}
                    {(aiCopilotIntent || aiCopilotAnswer) && (
                        <div style={{ marginTop: 16, padding: 14, backgroundColor: "#f8fafc", borderRadius: 8, border: "1px solid #dbeafe" }}>
                            {aiCopilotIntent ? (
                                <p style={{ fontSize: 12, color: "#64748b", marginBottom: 8 }}><strong>Intent:</strong> {aiCopilotIntent}</p>
                            ) : null}
                            <pre style={{ whiteSpace: "pre-wrap", fontFamily: "system-ui,sans-serif", fontSize: 14, margin: 0 }}>
                                {aiCopilotAnswer || "(no summary)"}
                            </pre>
                        </div>
                    )}
                    {aiCopilotRaw != null && (
                        <details style={{ marginTop: 12 }}>
                            <summary style={{ cursor: "pointer", fontWeight: 600 }}>Raw tool payload (advanced)</summary>
                            <pre style={{ fontSize: 11, overflow: "auto", maxHeight: 320, marginTop: 8, backgroundColor: "#0f172a", color: "#e2e8f0", padding: 10, borderRadius: 8 }}>
                                {JSON.stringify(aiCopilotRaw, null, 2)}
                            </pre>
                        </details>
                    )}

                    <hr style={{ margin: "32px 0", borderColor: "#e2e8f0" }} />

                    <h3>🚨 Operations insights scan</h3>
                    <p style={{ fontSize: 14, color: "#555", maxWidth: 900 }}>
                        Analyze recent operating metrics and surface top risks with prioritized actions.
                    </p>
                    <div style={{ ...styles.formRow, alignItems: "flex-end", marginTop: 10 }}>
                        <label style={{ display: "flex", flexDirection: "column", fontSize: 13 }}>
                            Lookback window (days)
                            <input
                                type="number"
                                min="1"
                                max="60"
                                value={aiInsightsDays}
                                onChange={(e) => setAiInsightsDays(e.target.value)}
                                style={{ ...styles.select, padding: "8px 12px", minWidth: 160 }}
                                disabled={aiInsightsLoading}
                            />
                        </label>
                        <button type="button" onClick={runAdminInsights} disabled={aiInsightsLoading} style={styles.overrideBtn}>
                            {aiInsightsLoading ? "⏳ Scanning..." : "Run insights scan"}
                        </button>
                    </div>
                    {aiInsightsErr && (
                        <p style={{ marginTop: 12, color: "#c0392b" }}>{aiInsightsErr}</p>
                    )}
                    {(aiInsightsSummary || aiInsightsSnapshot) && (
                        <div style={{ marginTop: 16, padding: 14, backgroundColor: "#fff7ed", borderRadius: 8, border: "1px solid #fed7aa" }}>
                            {aiInsightsSummary ? (
                                <pre style={{ whiteSpace: "pre-wrap", fontFamily: "system-ui,sans-serif", fontSize: 14, margin: 0 }}>
                                    {aiInsightsSummary}
                                </pre>
                            ) : null}
                            {aiInsightsSnapshot ? (
                                <details style={{ marginTop: 10 }}>
                                    <summary style={{ cursor: "pointer", fontWeight: 600 }}>Snapshot metrics</summary>
                                    <pre style={{ fontSize: 11, overflow: "auto", maxHeight: 300, marginTop: 8, backgroundColor: "#0f172a", color: "#e2e8f0", padding: 10, borderRadius: 8 }}>
                                        {JSON.stringify(aiInsightsSnapshot, null, 2)}
                                    </pre>
                                </details>
                            ) : null}
                        </div>
                    )}

                    <hr style={{ margin: "32px 0", borderColor: "#e2e8f0" }} />

                    <h3>🧭 Assignment recommender</h3>
                    <p style={{ fontSize: 14, color: "#555", maxWidth: 900 }}>
                        Get a best-fit driver/vehicle suggestion for an order based on current availability and capacity.
                    </p>
                    <div style={{ ...styles.formRow, alignItems: "flex-end", marginTop: 10 }}>
                        <label style={{ display: "flex", flexDirection: "column", fontSize: 13 }}>
                            Order ID
                            <input
                                type="number"
                                placeholder="Order ID"
                                value={recommendOrderId}
                                onChange={(e) => setRecommendOrderId(e.target.value)}
                                style={{ ...styles.select, padding: "8px 12px", minWidth: 160 }}
                                disabled={recommendBusy}
                            />
                        </label>
                        <button type="button" onClick={runAssignmentRecommendation} disabled={recommendBusy} style={styles.addBtn}>
                            {recommendBusy ? "⏳ Evaluating..." : "Recommend assignment"}
                        </button>
                    </div>
                    {recommendErr && (
                        <p style={{ marginTop: 12, color: "#c0392b" }}>{recommendErr}</p>
                    )}
                    {(recommendReasoning || recommendPayload) && (
                        <div style={{ marginTop: 16, padding: 14, backgroundColor: "#ecfeff", borderRadius: 8, border: "1px solid #a5f3fc" }}>
                            {recommendReasoning ? (
                                <pre style={{ whiteSpace: "pre-wrap", fontFamily: "system-ui,sans-serif", fontSize: 14, margin: "0 0 10px 0" }}>
                                    {recommendReasoning}
                                </pre>
                            ) : null}
                            {recommendPayload ? (
                                <pre style={{ fontSize: 11, overflow: "auto", maxHeight: 300, margin: 0, backgroundColor: "#0f172a", color: "#e2e8f0", padding: 10, borderRadius: 8 }}>
                                    {JSON.stringify(recommendPayload, null, 2)}
                                </pre>
                            ) : null}
                        </div>
                    )}

                    <hr style={{ margin: "32px 0", borderColor: "#e2e8f0" }} />

                    <h3>✉️ Customer notification draft</h3>
                    <p style={{ fontSize: 14, color: "#555" }}>
                        Produce SMS or email copy for an order status update and add it to a participant conversation thread.
                    </p>
                    <div style={{ ...styles.formRow, alignItems: "flex-end", marginTop: 10 }}>
                        <label style={{ display: "flex", flexDirection: "column", fontSize: 13 }}>
                            Order ID
                            <input
                                type="number"
                                placeholder="Order ID"
                                value={notifDraftOrderId}
                                onChange={(e) => setNotifDraftOrderId(e.target.value)}
                                style={{ ...styles.select, padding: "8px 12px", minWidth: 140 }}
                            />
                        </label>
                        <label style={{ display: "flex", flexDirection: "column", fontSize: 13 }}>
                            Format
                            <select
                                value={notifDraftChannel}
                                onChange={(e) => setNotifDraftChannel(e.target.value)}
                                style={{ ...styles.select, padding: "8px 12px" }}
                                disabled={notifDraftBusy}
                            >
                                <option value="email">Email draft</option>
                                <option value="sms">SMS-length draft</option>
                            </select>
                        </label>
                        <button type="button" onClick={generateAdminNotificationDraft} disabled={notifDraftBusy} style={styles.addBtn}>
                            {notifDraftBusy ? "⏳ Generating..." : "Generate draft"}
                        </button>
                    </div>

                    {(notifDraftSubject || notifDraftBody) && (
                        <div style={{ marginTop: 16, padding: 14, backgroundColor: "#f0fdf4", borderRadius: 8, border: "1px solid #bbf7d0" }}>
                            {notifDraftSubject ? <p style={{ margin: "0 0 8px" }}><strong>Subject:</strong> {notifDraftSubject}</p> : null}
                            <pre style={{ whiteSpace: "pre-wrap", fontFamily: "system-ui,sans-serif", fontSize: 14, margin: 0 }}>
                                {normalizeShowcaseText(notifDraftBody || "")}
                            </pre>
                        </div>
                    )}

                    <div style={{ marginTop: 18, padding: 14, backgroundColor: "#fff7ed", borderRadius: 8, border: "1px solid #fed7aa" }}>
                        <h4 style={{ margin: "0 0 8px" }}>📨 Customer/Driver conversation threads</h4>
                        <p style={{ fontSize: 13, color: "#555", margin: "0 0 10px" }}>
                            Send draft updates into a participant timeline and continue support chat with contextual replies.
                        </p>
                        <div style={{ ...styles.formRow, alignItems: "flex-end" }}>
                            <label style={{ display: "flex", flexDirection: "column", fontSize: 13 }}>
                                Participant type
                                <select
                                    value={supportParticipantType}
                                    onChange={(e) => setSupportParticipantType(e.target.value)}
                                    style={{ ...styles.select, padding: "8px 12px" }}
                                    disabled={supportChatBusy}
                                >
                                    <option value="customer">Customer</option>
                                    <option value="driver">Driver</option>
                                </select>
                            </label>
                            <label style={{ display: "flex", flexDirection: "column", fontSize: 13 }}>
                                Participant ID
                                <input
                                    type="number"
                                    placeholder={supportParticipantType === "customer" ? "e.g. 8" : "e.g. 2001"}
                                    value={supportParticipantId}
                                    onChange={(e) => setSupportParticipantId(e.target.value)}
                                    style={{ ...styles.select, padding: "8px 12px", minWidth: 140 }}
                                    disabled={supportChatBusy}
                                />
                            </label>
                            <button type="button" onClick={loadSupportThread} disabled={supportChatBusy} style={styles.quickFilterBtn}>
                                Load thread
                            </button>
                            <button type="button" onClick={fakeSendDraft} disabled={supportChatBusy || !(notifDraftBody || "").trim()} style={styles.addBtn}>
                                {supportChatBusy ? "⏳ Working..." : "Send draft to thread"}
                            </button>
                        </div>

                        <div style={{ marginTop: 10, border: "1px solid #e2e8f0", borderRadius: 8, backgroundColor: "#fff", padding: 10, maxHeight: 260, overflowY: "auto" }}>
                            {supportThread.length === 0 ? (
                                <p style={{ margin: 0, color: "#64748b", fontSize: 13 }}>
                                    No messages yet for this participant. Load a thread, send a draft, or start chat.
                                </p>
                            ) : (
                                supportThread.map((m) => (
                                    <div key={m.message_id} style={{ marginBottom: 8, paddingBottom: 8, borderBottom: "1px dashed #e2e8f0" }}>
                                        <div style={{ fontSize: 11, color: "#64748b", marginBottom: 4 }}>
                                            {m.actor_role} · {m.direction} · {m.channel || "chat"} · {m.created_at}
                                        </div>
                                        {m.subject ? <div style={{ fontSize: 12, marginBottom: 3 }}><strong>Subject:</strong> {m.subject}</div> : null}
                                        <div style={{ fontSize: 13, whiteSpace: "pre-wrap" }}>{normalizeShowcaseText(m.body)}</div>
                                    </div>
                                ))
                            )}
                        </div>

                        <div style={{ marginTop: 10 }}>
                            <label style={{ display: "block", fontSize: 13, marginBottom: 6 }}>
                                Support bot chat {supportParticipantName ? `with ${supportParticipantName}` : ""}
                            </label>
                            <div style={{ display: "flex", gap: 8 }}>
                                <textarea
                                    rows={3}
                                    placeholder="Type a support message context, e.g. customer asks for ETA clarity..."
                                    value={supportChatInput}
                                    onChange={(e) => setSupportChatInput(e.target.value)}
                                    style={{ ...styles.textarea, width: "100%", marginTop: 0 }}
                                    disabled={supportChatBusy}
                                />
                                <button type="button" onClick={sendSupportBotMessage} disabled={supportChatBusy} style={{ ...styles.overrideBtn, minWidth: 120, alignSelf: "flex-end" }}>
                                    {supportChatBusy ? "⏳ Sending..." : "Send chat"}
                                </button>
                            </div>
                        </div>
                        {supportChatErr ? <p style={{ marginTop: 8, color: "#c0392b" }}>{supportChatErr}</p> : null}
                    </div>
                </div>
            )}

            {/* Stop Modal */}
            {showStopModal && (
                <div style={styles.modal}>
                    <div style={styles.modalContent}>
                        <h3>{editingStop ? "Edit Stop" : "Add Stop"}</h3>
                        <input placeholder="Name" value={stopForm.name} onChange={(e) => setStopForm({ ...stopForm, name: e.target.value })} style={styles.input} />
                        <input placeholder="Location (lat,lng)" value={stopForm.location} onChange={(e) => setStopForm({ ...stopForm, location: e.target.value })} style={styles.input} />
                        <input placeholder="Facility Type" value={stopForm.facility_type} onChange={(e) => setStopForm({ ...stopForm, facility_type: e.target.value })} style={styles.input} />
                        <input type="number" placeholder="Sequence Order" value={stopForm.sequence_order} onChange={(e) => setStopForm({ ...stopForm, sequence_order: parseInt(e.target.value) })} style={styles.input} />
                        <input type="number" placeholder="Max Weight (kg)" value={stopForm.fmax_weight} onChange={(e) => setStopForm({ ...stopForm, fmax_weight: e.target.value })} style={styles.input} />
                        <input type="number" placeholder="Max Volume (m³)" value={stopForm.fmax_volume} onChange={(e) => setStopForm({ ...stopForm, fmax_volume: e.target.value })} style={styles.input} />
                        <input placeholder="Operating Hours (e.g., 09:00-17:00)" value={stopForm.operating_hours} onChange={(e) => setStopForm({ ...stopForm, operating_hours: e.target.value })} style={styles.input} />
                        <input type="datetime-local" placeholder="Planned ETA" value={stopForm.planned_eta} onChange={(e) => setStopForm({ ...stopForm, planned_eta: e.target.value })} style={styles.input} />
                        <select value={stopForm.scan_status} onChange={(e) => setStopForm({ ...stopForm, scan_status: e.target.value })} style={styles.input}>
                            <option value="Pending">Pending</option>
                            <option value="ARRIVED">Arrived</option>
                            <option value="COMPLETED">Completed</option>
                        </select>
                        <div style={styles.modalButtons}>
                            <button onClick={editingStop ? updateStop : createStop} style={styles.saveBtn}>Save</button>
                            <button onClick={() => { setShowStopModal(false); setEditingStop(null); }} style={styles.cancelBtn}>Cancel</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Driver Modal */}
            {showDriverModal && (
                <div style={styles.modal}>
                    <div style={styles.modalContent}>
                        <h3>{editingDriver ? "Edit Driver" : "Add New Driver"}</h3>
                        <input placeholder="Name" value={driverForm.name} onChange={(e) => setDriverForm({ ...driverForm, name: e.target.value })} style={styles.input} />
                        <input placeholder="Phone" value={driverForm.phone} onChange={(e) => setDriverForm({ ...driverForm, phone: e.target.value })} style={styles.input} />
                        <input placeholder="Email" value={driverForm.email} onChange={(e) => setDriverForm({ ...driverForm, email: e.target.value })} style={styles.input} />
                        <select value={driverForm.license_class} onChange={(e) => setDriverForm({ ...driverForm, license_class: e.target.value })} style={styles.input}>
                            <option value="">Select License Class</option>
                            <option value="A">Class A (Truck)</option>
                            <option value="B">Class B (Van)</option>
                            <option value="C">Class C (Car)</option>
                        </select>
                        <input type="number" placeholder="Working Hours/Week" value={driverForm.working_hours} onChange={(e) => setDriverForm({ ...driverForm, working_hours: e.target.value })} style={styles.input} />
                        {editingDriver && (
                            <select value={driverForm.status} onChange={(e) => setDriverForm({ ...driverForm, status: e.target.value })} style={styles.input}>
                                <option value="Pending">Pending</option>
                                <option value="Active">Active</option>
                                <option value="Inactive">Inactive</option>
                            </select>
                        )}
                        <div style={styles.modalButtons}>
                            <button onClick={editingDriver ? updateDriver : createDriver} style={styles.saveBtn}>Save</button>
                            <button onClick={() => { setShowDriverModal(false); setEditingDriver(null); }} style={styles.cancelBtn}>Cancel</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Vehicle Modal */}
            {showVehicleModal && (
                <div style={styles.modal}>
                    <div style={styles.modalContent}>
                        <h3>{editingVehicle ? "Edit Vehicle" : "Add Vehicle"}</h3>
                        <input placeholder="Type (e.g., Truck, Van)" value={vehicleForm.type} onChange={(e) => setVehicleForm({ ...vehicleForm, type: e.target.value })} style={styles.input} />
                        <input placeholder="License Plate" value={vehicleForm.license_plate} onChange={(e) => setVehicleForm({ ...vehicleForm, license_plate: e.target.value })} style={styles.input} />
                        <input type="number" placeholder="Max Weight (kg)" value={vehicleForm.vmax_weight} onChange={(e) => setVehicleForm({ ...vehicleForm, vmax_weight: e.target.value })} style={styles.input} />
                        <input type="number" placeholder="Max Volume (m³)" value={vehicleForm.vmax_volume} onChange={(e) => setVehicleForm({ ...vehicleForm, vmax_volume: e.target.value })} style={styles.input} />
                        <select value={vehicleForm.status} onChange={(e) => setVehicleForm({ ...vehicleForm, status: e.target.value })} style={styles.input}>
                            <option value="Available">Available</option>
                            <option value="In Use">In Use</option>
                            <option value="Maintenance">Maintenance</option>
                        </select>
                        <div style={styles.modalButtons}>
                            <button onClick={editingVehicle ? updateVehicle : createVehicle} style={styles.saveBtn}>Save</button>
                            <button onClick={() => { setShowVehicleModal(false); setEditingVehicle(null); }} style={styles.cancelBtn}>Cancel</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Admin Override Modal */}
            {showOverrideModal && (
                <div style={styles.modal}>
                    <div style={styles.modalContent}>
                        <h3>Admin Override</h3>
                        <p style={{ fontSize: "12px", color: "#666", marginBottom: "10px" }}>
                            Note: Override requires a valid Delivery ID. You can find Delivery ID in the DELIVERY table.
                        </p>
                        <input
                            type="number"
                            placeholder="Delivery ID (required)"
                            value={overrideForm.delivery_id}
                            onChange={(e) => setOverrideForm({ ...overrideForm, delivery_id: e.target.value })}
                            style={styles.input}
                        />
                        <select
                            value={overrideForm.override_type}
                            onChange={(e) => setOverrideForm({ ...overrideForm, override_type: e.target.value })}
                            style={styles.input}
                        >
                            <option value="Status Change">Status Change</option>
                            <option value="Reschedule">Reschedule</option>
                            <option value="Route Change">Route Change</option>
                            <option value="Driver Change">Driver Change</option>
                            <option value="Vehicle Change">Vehicle Change</option>
                        </select>
                        <input
                            type="text"
                            placeholder="Old Value"
                            value={overrideForm.old_value}
                            onChange={(e) => setOverrideForm({ ...overrideForm, old_value: e.target.value })}
                            style={styles.input}
                        />
                        <input
                            type="text"
                            placeholder="New Value"
                            value={overrideForm.new_value}
                            onChange={(e) => setOverrideForm({ ...overrideForm, new_value: e.target.value })}
                            style={styles.input}
                        />
                        <textarea
                            placeholder="Reason for override"
                            value={overrideForm.reason}
                            onChange={(e) => setOverrideForm({ ...overrideForm, reason: e.target.value })}
                            style={styles.textarea}
                            rows="3"
                        />
                        <div style={styles.modalButtons}>
                            <button onClick={createOverride} style={styles.saveBtn}>Submit Override</button>
                            <button onClick={() => { setShowOverrideModal(false); setOverrideForm({ delivery_id: "", override_type: "Status Change", reason: "", old_value: "", new_value: "" }); }} style={styles.cancelBtn}>Cancel</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

const styles = {
    container: { padding: 20, maxWidth: 1400, margin: "0 auto", fontFamily: "system-ui, sans-serif" },
    header: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, paddingBottom: 10, borderBottom: "2px solid #e0e4e8" },
    adminInfo: { margin: "5px 0 0", fontSize: "12px", color: "#666" },
    logoutBtn: { padding: "8px 16px", backgroundColor: "#dc3545", color: "white", border: "none", borderRadius: 5, cursor: "pointer" },
    tabs: { display: "flex", gap: 10, marginBottom: 20, borderBottom: "1px solid #ddd", paddingBottom: 10, flexWrap: "wrap" },
    tab: { padding: "10px 20px", backgroundColor: "#f8f9fa", border: "none", borderRadius: 8, cursor: "pointer", fontSize: 14 },
    activeTab: { backgroundColor: "#007bff", color: "white" },
    section: { backgroundColor: "white", padding: 20, borderRadius: 12, boxShadow: "0 1px 3px rgba(0,0,0,0.1)" },
    tableWrapper: { overflowX: "auto" },
    table: { width: "100%", borderCollapse: "collapse" },
    select: { padding: "8px 12px", border: "1px solid #ddd", borderRadius: 5, marginRight: 10 },
    input: { padding: "8px 12px", border: "1px solid #ddd", borderRadius: 5, marginRight: 10, marginBottom: 10, width: "calc(100% - 20px)" },
    textarea: { width: "100%", padding: "10px", margin: "8px 0", border: "1px solid #ddd", borderRadius: 5, fontFamily: "inherit", resize: "vertical" },
    formRow: { display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 20, alignItems: "center" },
    addBtn: { padding: "8px 16px", backgroundColor: "#28a745", color: "white", border: "none", borderRadius: 5, cursor: "pointer" },
    editBtn: { padding: "4px 8px", backgroundColor: "#ffc107", border: "none", borderRadius: 4, cursor: "pointer", marginRight: 5 },
    deleteBtn: { padding: "4px 8px", backgroundColor: "#dc3545", color: "white", border: "none", borderRadius: 4, cursor: "pointer" },
    completeBtn: { padding: "4px 8px", backgroundColor: "#28a745", color: "white", border: "none", borderRadius: 4, cursor: "pointer" },
    smallBtn: { padding: "4px 8px", backgroundColor: "#007bff", color: "white", border: "none", borderRadius: 4, cursor: "pointer" },
    statusBadge: { padding: "2px 8px", borderRadius: 12, fontSize: 11, color: "white" },
    riskBadge: { padding: "2px 8px", borderRadius: 12, fontSize: 11, fontWeight: "bold", color: "white", display: "inline-block" },
    filterSection: { backgroundColor: "#f8f9fa", padding: "15px", borderRadius: "8px", marginBottom: "20px" },
    filterRow: { display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center" },
    filterInput: { padding: "8px 12px", border: "1px solid #ddd", borderRadius: "5px", fontSize: "14px", flex: "1", minWidth: "120px" },
    clearBtn: { padding: "8px 16px", backgroundColor: "#6c757d", color: "white", border: "none", borderRadius: "5px", cursor: "pointer" },
    modal: { position: "fixed", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 },
    modalContent: { backgroundColor: "white", padding: 25, borderRadius: 12, width: 500, maxWidth: "90%" },
    modalButtons: { display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 15 },
    saveBtn: { padding: "8px 16px", backgroundColor: "#007bff", color: "white", border: "none", borderRadius: 5, cursor: "pointer" },
    cancelBtn: { padding: "8px 16px", backgroundColor: "#6c757d", color: "white", border: "none", borderRadius: 5, cursor: "pointer" },
    loading: { padding: 20, textAlign: "center" },
    error: { padding: 20, color: "red", textAlign: "center" },

    overrideBtn: {
        padding: "4px 12px",
        backgroundColor: "#ff9800",
        color: "white",
        border: "none",
        borderRadius: 4,
        cursor: "pointer",
        fontSize: 12,
        marginLeft: 5
    },

    formCard: {
        backgroundColor: "#f8f9fa",
        padding: "15px",
        borderRadius: "8px",
        marginBottom: "20px"
    },

    quickFilterBtn: {
        padding: "6px 12px",
        backgroundColor: "#e9ecef",
        border: "1px solid #dee2e6",
        borderRadius: "4px",
        cursor: "pointer",
        fontSize: "12px"
    },

    infoCard: {
        backgroundColor: "#e3f2fd",
        padding: "15px",
        borderRadius: "8px",
        marginBottom: "20px"
    },
    infoGrid: {
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
        gap: "10px",
        marginTop: "10px"
    },

};
